import {
  getEmptyWorkspaceStorageSnapshot,
  getWorkspaceSubjectKey,
  sanitizeWorkspaceNote,
  sanitizeWorkspaceStorageSnapshot,
  sanitizeWorkspaceSubjectState,
} from "../storage";
import type {
  WorkspaceNote,
  WorkspaceStorageSnapshot,
  WorkspaceSubjectState,
  WorkspaceSubjectType,
} from "../types";
import type { WorkspaceStorageAdapter } from "./types";
import {
  createWorkspaceNote,
  deleteWorkspaceEntry,
  deleteWorkspaceNote,
  getWorkspaceEntry,
  getWorkspaceSnapshot,
  listWorkspaceNotes,
  updateWorkspaceNote,
  upsertWorkspaceEntry,
} from "../../api";

function toComparableArray(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values.filter((value): value is string => typeof value === "string");
}

function areStringArraysEqual(a: string[] = [], b: string[] = []): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function areQueueStatesEqual(a: WorkspaceSubjectState["queue"], b: WorkspaceSubjectState["queue"]): boolean {
  const aQueued = Boolean(a?.queued && a.title);
  const bQueued = Boolean(b?.queued && b.title);
  if (!aQueued && !bQueued) return true;
  if (aQueued !== bQueued) return false;

  return (
    a?.title === b?.title &&
    (a?.subtitle ?? null) === (b?.subtitle ?? null) &&
    (a?.addedAt ?? null) === (b?.addedAt ?? null)
  );
}

function areDecisionStatesEqual(
  a: WorkspaceSubjectState["decision"],
  b: WorkspaceSubjectState["decision"],
): boolean {
  const aExists = Boolean(a);
  const bExists = Boolean(b);
  if (!aExists && !bExists) return true;
  if (aExists !== bExists) return false;

  return (
    (a?.sentiment ?? null) === (b?.sentiment ?? null) &&
    areStringArraysEqual(toComparableArray(a?.checks), toComparableArray(b?.checks)) &&
    (a?.score ?? null) === (b?.score ?? null)
  );
}

function areEntryFieldsEqual(a: WorkspaceSubjectState | null, b: WorkspaceSubjectState | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;

  return (
    (a.builderId ?? null) === (b.builderId ?? null) &&
    (a.communityId ?? null) === (b.communityId ?? null) &&
    (a.listingId ?? null) === (b.listingId ?? null) &&
    (a.floorPlanId ?? null) === (b.floorPlanId ?? null) &&
    areQueueStatesEqual(a.queue, b.queue) &&
    areStringArraysEqual(a.labels ?? [], b.labels ?? []) &&
    areDecisionStatesEqual(a.decision, b.decision)
  );
}

function toWorkspaceNoteMap(notes: WorkspaceNote[] = []): Map<string, WorkspaceNote> {
  const map = new Map<string, WorkspaceNote>();
  for (const note of notes) {
    const sanitized = sanitizeWorkspaceNote(note);
    if (!sanitized || !sanitized.id) continue;
    map.set(sanitized.id, sanitized);
  }
  return map;
}

function getEntryPayload(subjectState: WorkspaceSubjectState): WorkspaceSubjectState {
  return {
    builderId: subjectState.builderId,
    communityId: subjectState.communityId,
    listingId: subjectState.listingId,
    floorPlanId: subjectState.floorPlanId,
    queue: subjectState.queue,
    labels: subjectState.labels ?? [],
    decision: subjectState.decision,
  };
}

class RemoteWorkspaceAdapter implements WorkspaceStorageAdapter {
  readonly kind = "remote" as const;
  readonly supportsCrossDeviceSync = true;

  private snapshot: WorkspaceStorageSnapshot = getEmptyWorkspaceStorageSnapshot();
  private hasLoaded = false;
  private loadAllPromise: Promise<WorkspaceStorageSnapshot> | null = null;
  private saveChain: Promise<void> = Promise.resolve();
  private pendingSnapshot: WorkspaceStorageSnapshot | null = null;

  async loadAll(): Promise<WorkspaceStorageSnapshot> {
    if (this.hasLoaded) return this.snapshot;
    if (this.loadAllPromise) return this.loadAllPromise;

    this.loadAllPromise = getWorkspaceSnapshot()
      .then((response) => {
        this.snapshot = sanitizeWorkspaceStorageSnapshot(response.snapshot);
        this.hasLoaded = true;
        return this.snapshot;
      })
      .finally(() => {
        this.loadAllPromise = null;
      });

    return this.loadAllPromise;
  }

  async saveAll(snapshot: WorkspaceStorageSnapshot): Promise<void> {
    const nextSnapshot = sanitizeWorkspaceStorageSnapshot(snapshot);
    if (!this.hasLoaded) {
      this.snapshot = nextSnapshot;
      this.hasLoaded = true;
    }

    this.pendingSnapshot = nextSnapshot;
    this.saveChain = this.saveChain
      .catch(() => {
        // Keep the queue alive after transient network/auth failures.
      })
      .then(async () => {
        await this.flushPendingSnapshot();
      });
    return this.saveChain;
  }

  async loadSubject(
    subjectType: WorkspaceSubjectType,
    subjectId: string,
  ): Promise<WorkspaceSubjectState | null> {
    const key = getWorkspaceSubjectKey(subjectType, subjectId);
    const [entryResponse, notesResponse] = await Promise.all([
      getWorkspaceEntry(subjectType, subjectId),
      listWorkspaceNotes(subjectType, subjectId),
    ]);

    const combined = sanitizeWorkspaceSubjectState({
      ...(entryResponse.entry || {}),
      notes: notesResponse.notes || [],
    });

    const nextSubjects = { ...this.snapshot.subjects };
    if (combined) nextSubjects[key] = combined;
    else delete nextSubjects[key];
    this.snapshot = { ...this.snapshot, subjects: nextSubjects };
    this.hasLoaded = true;

    return combined;
  }

  async saveSubject(
    subjectType: WorkspaceSubjectType,
    subjectId: string,
    subjectState: WorkspaceSubjectState,
  ): Promise<void> {
    await this.loadAll();

    const key = getWorkspaceSubjectKey(subjectType, subjectId);
    const currentSubject = sanitizeWorkspaceSubjectState(this.snapshot.subjects[key]) || null;
    const nextSubject = sanitizeWorkspaceSubjectState(subjectState);

    if (!nextSubject) {
      await this.removeSubject(subjectType, subjectId);
      return;
    }

    if (!areEntryFieldsEqual(currentSubject, nextSubject)) {
      await upsertWorkspaceEntry(subjectType, subjectId, getEntryPayload(nextSubject));
    }

    await this.syncSubjectNotes(
      subjectType,
      subjectId,
      currentSubject?.notes ?? [],
      nextSubject.notes ?? [],
      nextSubject,
    );

    this.snapshot.subjects[key] = {
      ...nextSubject,
      updatedAt:
        typeof nextSubject.updatedAt === "number" && Number.isFinite(nextSubject.updatedAt)
          ? nextSubject.updatedAt
          : Date.now(),
    };
  }

  async removeSubject(subjectType: WorkspaceSubjectType, subjectId: string): Promise<void> {
    await this.loadAll();
    await deleteWorkspaceEntry(subjectType, subjectId);

    const key = getWorkspaceSubjectKey(subjectType, subjectId);
    delete this.snapshot.subjects[key];
  }

  private async flushPendingSnapshot(): Promise<void> {
    while (this.pendingSnapshot) {
      const next = this.pendingSnapshot;
      this.pendingSnapshot = null;
      await this.syncSnapshot(this.snapshot, next);
      this.snapshot = next;
    }
  }

  private async syncSnapshot(
    current: WorkspaceStorageSnapshot,
    next: WorkspaceStorageSnapshot,
  ): Promise<void> {
    const keys = new Set<string>([
      ...Object.keys(current.subjects || {}),
      ...Object.keys(next.subjects || {}),
    ]);

    for (const key of keys) {
      const separatorIndex = key.indexOf(":");
      if (separatorIndex <= 0 || separatorIndex >= key.length - 1) continue;
      const subjectType = key.slice(0, separatorIndex) as WorkspaceSubjectType;
      const subjectId = key.slice(separatorIndex + 1);

      const currentSubject = sanitizeWorkspaceSubjectState(current.subjects[key]) || null;
      const nextSubject = sanitizeWorkspaceSubjectState(next.subjects[key]) || null;

      if (!currentSubject && !nextSubject) continue;
      if (!nextSubject) {
        await deleteWorkspaceEntry(subjectType, subjectId);
        continue;
      }

      if (!areEntryFieldsEqual(currentSubject, nextSubject)) {
        await upsertWorkspaceEntry(subjectType, subjectId, getEntryPayload(nextSubject));
      }

      await this.syncSubjectNotes(
        subjectType,
        subjectId,
        currentSubject?.notes ?? [],
        nextSubject.notes ?? [],
        nextSubject,
      );
    }
  }

  private async syncSubjectNotes(
    subjectType: WorkspaceSubjectType,
    subjectId: string,
    currentNotes: WorkspaceNote[],
    nextNotes: WorkspaceNote[],
    subjectState: WorkspaceSubjectState,
  ): Promise<void> {
    const currentMap = toWorkspaceNoteMap(currentNotes);
    const nextMap = toWorkspaceNoteMap(nextNotes);

    for (const [noteId] of currentMap.entries()) {
      if (nextMap.has(noteId)) continue;
      await deleteWorkspaceNote(noteId);
    }

    for (const [noteId, note] of nextMap.entries()) {
      const previous = currentMap.get(noteId);
      if (!previous) {
        await createWorkspaceNote(subjectType, subjectId, {
          id: note.id,
          text: note.text,
          ...(subjectState.builderId ? { builderId: subjectState.builderId } : {}),
          ...(subjectState.communityId ? { communityId: subjectState.communityId } : {}),
          ...(subjectState.listingId ? { listingId: subjectState.listingId } : {}),
          ...(subjectState.floorPlanId ? { floorPlanId: subjectState.floorPlanId } : {}),
        });
        continue;
      }

      if (previous.text !== note.text) {
        await updateWorkspaceNote(note.id, { text: note.text });
      }
    }
  }
}

export function createRemoteWorkspaceAdapter(): WorkspaceStorageAdapter {
  return new RemoteWorkspaceAdapter();
}

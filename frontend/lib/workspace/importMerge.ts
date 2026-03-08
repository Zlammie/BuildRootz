import {
  getEmptyWorkspaceStorageSnapshot,
  sanitizeWorkspaceDecision,
  sanitizeWorkspaceLabels,
  sanitizeWorkspaceNote,
  sanitizeWorkspaceQueueState,
  sanitizeWorkspaceStorageSnapshot,
  sanitizeWorkspaceSubjectState,
} from "./storage";
import type {
  WorkspaceDecisionState,
  WorkspaceNote,
  WorkspaceQueueState,
  WorkspaceStorageSnapshot,
  WorkspaceSubjectState,
} from "./types";

function toFiniteNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toUniqueStringList(values: string[]): string[] {
  const unique = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const next = value.trim();
    if (!next) continue;
    unique.add(next);
  }
  return Array.from(unique);
}

function hasMeaningfulDecision(decision: WorkspaceDecisionState | undefined): boolean {
  if (!decision) return false;
  return Boolean(decision.sentiment) || decision.checks.length > 0 || typeof decision.score === "number";
}

export function hasMeaningfulWorkspaceData(snapshot: WorkspaceStorageSnapshot): boolean {
  const cleanSnapshot = sanitizeWorkspaceStorageSnapshot(snapshot);

  return Object.values(cleanSnapshot.subjects).some((subject) => {
    const cleanSubject = sanitizeWorkspaceSubjectState(subject);
    if (!cleanSubject) return false;

    const hasQueue = Boolean(cleanSubject.queue?.queued && cleanSubject.queue.title);
    const hasNotes = Array.isArray(cleanSubject.notes) && cleanSubject.notes.length > 0;
    const hasLabels = Array.isArray(cleanSubject.labels) && cleanSubject.labels.length > 0;
    const hasDecision = hasMeaningfulDecision(cleanSubject.decision);

    return hasQueue || hasNotes || hasLabels || hasDecision;
  });
}

function mergeQueue(
  localQueue: WorkspaceQueueState | undefined,
  remoteQueue: WorkspaceQueueState | undefined,
): WorkspaceQueueState | undefined {
  const local = sanitizeWorkspaceQueueState(localQueue);
  const remote = sanitizeWorkspaceQueueState(remoteQueue);
  if (!local && !remote) return undefined;

  const title = remote?.title || local?.title;
  if (!title) return undefined;

  const subtitle = remote?.subtitle ?? local?.subtitle ?? null;
  const remoteAddedAt = toFiniteNumberOrNull(remote?.addedAt);
  const localAddedAt = toFiniteNumberOrNull(local?.addedAt);

  let addedAt = Date.now();
  if (remoteAddedAt !== null && localAddedAt !== null) addedAt = Math.min(remoteAddedAt, localAddedAt);
  else if (remoteAddedAt !== null) addedAt = remoteAddedAt;
  else if (localAddedAt !== null) addedAt = localAddedAt;

  return {
    queued: true,
    title,
    subtitle,
    addedAt,
  };
}

function mergeDecision(
  localDecision: WorkspaceDecisionState | undefined,
  remoteDecision: WorkspaceDecisionState | undefined,
): WorkspaceDecisionState | undefined {
  const local = sanitizeWorkspaceDecision(localDecision);
  const remote = sanitizeWorkspaceDecision(remoteDecision);

  const mergedSentiment = remote.sentiment || local.sentiment || null;
  const mergedChecks = toUniqueStringList([...(remote.checks || []), ...(local.checks || [])]);
  const mergedScore =
    typeof remote.score === "number"
      ? remote.score
      : typeof local.score === "number"
        ? local.score
        : null;

  if (!mergedSentiment && !mergedChecks.length && mergedScore === null) return undefined;
  return {
    sentiment: mergedSentiment,
    checks: mergedChecks,
    score: mergedScore,
  };
}

function mergeNotes(localNotes: WorkspaceNote[] = [], remoteNotes: WorkspaceNote[] = []): WorkspaceNote[] {
  const remoteMap = new Map<string, WorkspaceNote>();
  for (const note of remoteNotes) {
    const clean = sanitizeWorkspaceNote(note);
    if (!clean?.id) continue;
    remoteMap.set(clean.id, clean);
  }

  for (const note of localNotes) {
    const clean = sanitizeWorkspaceNote(note);
    if (!clean?.id) continue;
    if (remoteMap.has(clean.id)) continue;
    remoteMap.set(clean.id, clean);
  }

  return Array.from(remoteMap.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function mergeSubjectState(
  localSubject: WorkspaceSubjectState | undefined,
  remoteSubject: WorkspaceSubjectState | undefined,
): WorkspaceSubjectState | null {
  const local = sanitizeWorkspaceSubjectState(localSubject) || {};
  const remote = sanitizeWorkspaceSubjectState(remoteSubject) || {};

  const queue = mergeQueue(local.queue, remote.queue);
  const labels = toUniqueStringList([
    ...(remote.labels ? sanitizeWorkspaceLabels(remote.labels) : []),
    ...(local.labels ? sanitizeWorkspaceLabels(local.labels) : []),
  ]);
  const decision = mergeDecision(local.decision, remote.decision);
  const notes = mergeNotes(local.notes, remote.notes);

  const merged: WorkspaceSubjectState = {
    ...(remote.builderId || local.builderId ? { builderId: remote.builderId || local.builderId } : {}),
    ...(remote.communityId || local.communityId
      ? { communityId: remote.communityId || local.communityId }
      : {}),
    ...(remote.listingId || local.listingId ? { listingId: remote.listingId || local.listingId } : {}),
    ...(remote.floorPlanId || local.floorPlanId
      ? { floorPlanId: remote.floorPlanId || local.floorPlanId }
      : {}),
    ...(queue ? { queue } : {}),
    ...(labels.length ? { labels } : {}),
    ...(decision ? { decision } : {}),
    ...(notes.length ? { notes } : {}),
    updatedAt: Date.now(),
  };

  return sanitizeWorkspaceSubjectState(merged);
}

export function mergeWorkspaceSnapshots(
  localSnapshot: WorkspaceStorageSnapshot,
  remoteSnapshot: WorkspaceStorageSnapshot,
): WorkspaceStorageSnapshot {
  const cleanLocal = sanitizeWorkspaceStorageSnapshot(localSnapshot);
  const cleanRemote = sanitizeWorkspaceStorageSnapshot(remoteSnapshot);
  const next = getEmptyWorkspaceStorageSnapshot();
  const keys = new Set<string>([
    ...Object.keys(cleanLocal.subjects),
    ...Object.keys(cleanRemote.subjects),
  ]);

  for (const key of keys) {
    const mergedSubject = mergeSubjectState(cleanLocal.subjects[key], cleanRemote.subjects[key]);
    if (!mergedSubject) continue;
    next.subjects[key] = mergedSubject;
  }

  return next;
}

function getCanonicalComparableSnapshot(snapshot: WorkspaceStorageSnapshot): Record<string, unknown> {
  const clean = sanitizeWorkspaceStorageSnapshot(snapshot);
  const keys = Object.keys(clean.subjects).sort();
  const subjects: Record<string, unknown> = {};

  for (const key of keys) {
    const subject = sanitizeWorkspaceSubjectState(clean.subjects[key]);
    if (!subject) continue;
    subjects[key] = {
      builderId: subject.builderId || null,
      communityId: subject.communityId || null,
      listingId: subject.listingId || null,
      floorPlanId: subject.floorPlanId || null,
      queue: subject.queue
        ? {
            queued: true,
            title: subject.queue.title,
            subtitle: subject.queue.subtitle ?? null,
            addedAt: subject.queue.addedAt ?? null,
          }
        : null,
      labels: toUniqueStringList(subject.labels || []).sort(),
      decision: subject.decision
        ? {
            sentiment: subject.decision.sentiment ?? null,
            checks: toUniqueStringList(subject.decision.checks || []).sort(),
            score: typeof subject.decision.score === "number" ? subject.decision.score : null,
          }
        : null,
      notes: (subject.notes || [])
        .map((note) => sanitizeWorkspaceNote(note))
        .filter((note): note is WorkspaceNote => Boolean(note))
        .map((note) => ({
          id: note.id,
          text: note.text,
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    };
  }

  return subjects;
}

export function workspaceSnapshotsEqual(
  left: WorkspaceStorageSnapshot,
  right: WorkspaceStorageSnapshot,
): boolean {
  return JSON.stringify(getCanonicalComparableSnapshot(left)) === JSON.stringify(getCanonicalComparableSnapshot(right));
}

function hashString(input: string): string {
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index);
  }
  return (hash >>> 0).toString(16);
}

export function buildWorkspaceSnapshotFingerprint(snapshot: WorkspaceStorageSnapshot): string {
  const canonical = JSON.stringify(getCanonicalComparableSnapshot(snapshot));
  return `ws-${hashString(canonical)}`;
}

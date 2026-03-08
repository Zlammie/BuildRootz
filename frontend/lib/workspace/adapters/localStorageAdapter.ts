import {
  getEmptyWorkspaceStorageSnapshot,
  getWorkspaceSubjectKey,
  sanitizeWorkspaceStorageSnapshot,
  sanitizeWorkspaceSubjectState,
  WORKSPACE_STORAGE_KEY,
} from "../storage";
import type { WorkspaceStorageSnapshot, WorkspaceSubjectState, WorkspaceSubjectType } from "../types";
import type { WorkspaceStorageAdapter } from "./types";

function readSnapshotFromLocalStorage(): WorkspaceStorageSnapshot {
  if (typeof window === "undefined") return getEmptyWorkspaceStorageSnapshot();

  try {
    const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!raw) return getEmptyWorkspaceStorageSnapshot();
    return sanitizeWorkspaceStorageSnapshot(JSON.parse(raw) as unknown);
  } catch {
    return getEmptyWorkspaceStorageSnapshot();
  }
}

function writeSnapshotToLocalStorage(snapshot: WorkspaceStorageSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore quota/storage exceptions during UX validation.
  }
}

class LocalStorageWorkspaceAdapter implements WorkspaceStorageAdapter {
  readonly kind = "localStorage" as const;
  readonly supportsCrossDeviceSync = false;

  async loadAll(): Promise<WorkspaceStorageSnapshot> {
    return Promise.resolve(readSnapshotFromLocalStorage());
  }

  async saveAll(snapshot: WorkspaceStorageSnapshot): Promise<void> {
    writeSnapshotToLocalStorage(sanitizeWorkspaceStorageSnapshot(snapshot));
    return Promise.resolve();
  }

  async loadSubject(
    subjectType: WorkspaceSubjectType,
    subjectId: string,
  ): Promise<WorkspaceSubjectState | null> {
    const key = getWorkspaceSubjectKey(subjectType, subjectId);
    return Promise.resolve(readSnapshotFromLocalStorage().subjects[key] ?? null);
  }

  async saveSubject(
    subjectType: WorkspaceSubjectType,
    subjectId: string,
    subjectState: WorkspaceSubjectState,
  ): Promise<void> {
    const key = getWorkspaceSubjectKey(subjectType, subjectId);
    const snapshot = readSnapshotFromLocalStorage();
    const nextSubject = sanitizeWorkspaceSubjectState(subjectState);

    if (!nextSubject) {
      delete snapshot.subjects[key];
      writeSnapshotToLocalStorage(snapshot);
      return Promise.resolve();
    }

    snapshot.subjects[key] = {
      ...nextSubject,
      updatedAt:
        typeof nextSubject.updatedAt === "number" && Number.isFinite(nextSubject.updatedAt)
          ? nextSubject.updatedAt
          : Date.now(),
    };
    writeSnapshotToLocalStorage(snapshot);
    return Promise.resolve();
  }

  async removeSubject(subjectType: WorkspaceSubjectType, subjectId: string): Promise<void> {
    const key = getWorkspaceSubjectKey(subjectType, subjectId);
    const snapshot = readSnapshotFromLocalStorage();
    if (!snapshot.subjects[key]) return Promise.resolve();
    delete snapshot.subjects[key];
    writeSnapshotToLocalStorage(snapshot);
    return Promise.resolve();
  }
}

export function createLocalStorageWorkspaceAdapter(): WorkspaceStorageAdapter {
  return new LocalStorageWorkspaceAdapter();
}

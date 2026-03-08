"use client";

import { createLocalStorageWorkspaceAdapter } from "./adapters/localStorageAdapter";
import {
  buildWorkspaceSnapshotFingerprint,
  hasMeaningfulWorkspaceData,
  mergeWorkspaceSnapshots,
  workspaceSnapshotsEqual,
} from "./importMerge";
import {
  hasSeenWorkspaceImportFingerprint,
  markWorkspaceImportCompleted,
} from "./importTracking";
import { getWorkspaceAdapter } from "./getWorkspaceAdapter";
import { createWorkspaceSyncSourceId, emitWorkspaceSync } from "./sync";

type WorkspaceAuthImportStatus =
  | "imported"
  | "already-imported"
  | "no-local-data"
  | "no-user-id"
  | "up-to-date";

export type WorkspaceAuthImportResult = {
  status: WorkspaceAuthImportStatus;
  fingerprint?: string;
};

const importInFlightByUser = new Map<string, Promise<WorkspaceAuthImportResult>>();
const authImportSyncSourceId = createWorkspaceSyncSourceId("workspace-auth-import");

async function runWorkspaceAuthImportForUser(userId: string): Promise<WorkspaceAuthImportResult> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return { status: "no-user-id" };

  const localAdapter = createLocalStorageWorkspaceAdapter();
  const localSnapshot = await localAdapter.loadAll();
  if (!hasMeaningfulWorkspaceData(localSnapshot)) {
    return { status: "no-local-data" };
  }

  const fingerprint = buildWorkspaceSnapshotFingerprint(localSnapshot);
  if (hasSeenWorkspaceImportFingerprint(normalizedUserId, fingerprint)) {
    return { status: "already-imported", fingerprint };
  }

  const remoteAdapter = getWorkspaceAdapter({
    isAuthenticated: true,
    userId: normalizedUserId,
  });
  const remoteSnapshot = await remoteAdapter.loadAll();
  const mergedSnapshot = mergeWorkspaceSnapshots(localSnapshot, remoteSnapshot);

  if (workspaceSnapshotsEqual(mergedSnapshot, remoteSnapshot)) {
    markWorkspaceImportCompleted(normalizedUserId, fingerprint);
    return { status: "up-to-date", fingerprint };
  }

  await remoteAdapter.saveAll(mergedSnapshot);
  markWorkspaceImportCompleted(normalizedUserId, fingerprint);
  emitWorkspaceSync({ sourceId: authImportSyncSourceId });
  return { status: "imported", fingerprint };
}

export function importAnonymousWorkspaceForAuthenticatedUser(
  userId: string,
): Promise<WorkspaceAuthImportResult> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    return Promise.resolve({ status: "no-user-id" });
  }

  const inFlight = importInFlightByUser.get(normalizedUserId);
  if (inFlight) return inFlight;

  const next = runWorkspaceAuthImportForUser(normalizedUserId).finally(() => {
    importInFlightByUser.delete(normalizedUserId);
  });

  importInFlightByUser.set(normalizedUserId, next);
  return next;
}

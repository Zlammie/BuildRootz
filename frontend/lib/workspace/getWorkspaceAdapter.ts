import { createLocalStorageWorkspaceAdapter } from "./adapters/localStorageAdapter";
import { createRemoteWorkspaceAdapter } from "./adapters/remoteAdapter";
import type { WorkspaceStorageAdapter } from "./adapters/types";

type WorkspaceAdapterSelectionOptions = {
  isAuthenticated?: boolean;
  userId?: string | null;
};

let localAdapterSingleton: WorkspaceStorageAdapter | null = null;
let remoteAdapterSingleton: WorkspaceStorageAdapter | null = null;
let remoteAdapterUserId: string | null = null;

function getLocalAdapterSingleton(): WorkspaceStorageAdapter {
  if (!localAdapterSingleton) {
    localAdapterSingleton = createLocalStorageWorkspaceAdapter();
  }
  return localAdapterSingleton;
}

function getRemoteAdapterSingleton(): WorkspaceStorageAdapter {
  if (!remoteAdapterSingleton) {
    remoteAdapterSingleton = createRemoteWorkspaceAdapter();
  }
  return remoteAdapterSingleton;
}

export function getWorkspaceAdapter(
  options: WorkspaceAdapterSelectionOptions = {},
): WorkspaceStorageAdapter {
  const { isAuthenticated = false, userId } = options;
  if (isAuthenticated) {
    const normalizedUserId = typeof userId === "string" ? userId.trim() : "";
    if (!remoteAdapterSingleton || remoteAdapterUserId !== normalizedUserId) {
      remoteAdapterSingleton = createRemoteWorkspaceAdapter();
      remoteAdapterUserId = normalizedUserId;
    }
    return getRemoteAdapterSingleton();
  }
  remoteAdapterSingleton = null;
  remoteAdapterUserId = null;
  return getLocalAdapterSingleton();
}

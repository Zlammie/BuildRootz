import type { WorkspaceSubjectType } from "./types";

const WORKSPACE_SYNC_EVENT_NAME = "buildrootz:workspace:updated";

export type WorkspaceSyncDetail = {
  sourceId?: string;
  subjectType?: WorkspaceSubjectType;
  subjectId?: string;
  at: number;
};

let sourceCounter = 0;

export function createWorkspaceSyncSourceId(prefix = "workspace"): string {
  sourceCounter += 1;
  return `${prefix}-${Date.now()}-${sourceCounter}`;
}

export function emitWorkspaceSync(
  detail: Omit<WorkspaceSyncDetail, "at">,
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<WorkspaceSyncDetail>(WORKSPACE_SYNC_EVENT_NAME, {
      detail: {
        ...detail,
        at: Date.now(),
      },
    }),
  );
}

export function subscribeWorkspaceSync(
  listener: (detail: WorkspaceSyncDetail) => void,
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleEvent = (event: Event) => {
    const detail = (event as CustomEvent<WorkspaceSyncDetail>).detail;
    listener(detail || { at: Date.now() });
  };

  window.addEventListener(WORKSPACE_SYNC_EVENT_NAME, handleEvent);
  return () => window.removeEventListener(WORKSPACE_SYNC_EVENT_NAME, handleEvent);
}

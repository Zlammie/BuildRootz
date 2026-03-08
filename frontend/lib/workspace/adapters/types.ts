import type {
  WorkspaceStorageSnapshot,
  WorkspaceSubjectState,
  WorkspaceSubjectType,
} from "../types";

export type WorkspaceAdapterKind = "localStorage" | "remote";

export interface WorkspaceStorageAdapter {
  readonly kind: WorkspaceAdapterKind;
  readonly supportsCrossDeviceSync: boolean;
  loadAll(): Promise<WorkspaceStorageSnapshot>;
  saveAll(snapshot: WorkspaceStorageSnapshot): Promise<void>;
  loadSubject(subjectType: WorkspaceSubjectType, subjectId: string): Promise<WorkspaceSubjectState | null>;
  saveSubject(
    subjectType: WorkspaceSubjectType,
    subjectId: string,
    subjectState: WorkspaceSubjectState,
  ): Promise<void>;
  removeSubject(subjectType: WorkspaceSubjectType, subjectId: string): Promise<void>;
}

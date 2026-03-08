export const WORKSPACE_SUBJECT_TYPES = [
  "builder",
  "community",
  "listing",
  "floorPlan",
] as const;

export type WorkspaceSubjectType = (typeof WORKSPACE_SUBJECT_TYPES)[number];
export type WorkspaceSubjectKey = `${WorkspaceSubjectType}:${string}`;

export type WorkspaceSubject = {
  subjectType: WorkspaceSubjectType;
  subjectId: string;
};

export type WorkspaceDecisionSentiment = "love" | "maybe" | "pass";

export type WorkspaceDecisionState = {
  sentiment: WorkspaceDecisionSentiment | null;
  checks: string[];
  score: number | null;
};

export type WorkspaceDecisionCheck = {
  id: string;
  label: string;
};

export type WorkspaceSubjectContextRefs = {
  builderId?: string;
  communityId?: string;
  listingId?: string;
  floorPlanId?: string;
};

export type WorkspaceQueueState = {
  queued: true;
  title: string;
  subtitle?: string | null;
  addedAt: number;
};

export type WorkspaceNote = {
  id: string;
  text: string;
  createdAt: number;
  updatedAt?: number;
};

export type WorkspaceSubjectState = {
  builderId?: string;
  communityId?: string;
  listingId?: string;
  floorPlanId?: string;
  queue?: WorkspaceQueueState;
  notes?: WorkspaceNote[];
  labels?: string[];
  decision?: WorkspaceDecisionState;
  updatedAt?: number;
};

export type WorkspaceStorageSnapshot = {
  version: 1;
  subjects: Record<string, WorkspaceSubjectState>;
};

export type WorkspaceQueueItem = WorkspaceSubject & {
  title: string;
  subtitle?: string | null;
  addedAt: number;
};

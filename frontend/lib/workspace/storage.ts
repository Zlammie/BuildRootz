import type {
  WorkspaceDecisionState,
  WorkspaceNote,
  WorkspaceQueueItem,
  WorkspaceQueueState,
  WorkspaceStorageSnapshot,
  WorkspaceSubject,
  WorkspaceSubjectKey,
  WorkspaceSubjectState,
  WorkspaceSubjectType,
} from "./types";
import { WORKSPACE_SUBJECT_TYPES } from "./types";
import {
  WORKSPACE_DECISION_CHECK_IDS,
  WORKSPACE_DECISION_CHECKS_BY_SUBJECT,
} from "./decisionChecks";

export const WORKSPACE_STORAGE_KEY = "buildrootz:workspace:v1";
export const WORKSPACE_STORAGE_VERSION = 1 as const;

export const WORKSPACE_DECISION_CHECKS = WORKSPACE_DECISION_CHECKS_BY_SUBJECT.listing;

const DEFAULT_DECISION_STATE: WorkspaceDecisionState = {
  sentiment: null,
  checks: [],
  score: null,
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function getEmptyWorkspaceStorageSnapshot(): WorkspaceStorageSnapshot {
  return { version: WORKSPACE_STORAGE_VERSION, subjects: {} };
}

export function isWorkspaceSubjectType(value: string): value is WorkspaceSubjectType {
  return WORKSPACE_SUBJECT_TYPES.includes(value as WorkspaceSubjectType);
}

export function getWorkspaceSubjectKey(
  subjectType: WorkspaceSubjectType,
  subjectId: string,
): WorkspaceSubjectKey {
  return `${subjectType}:${subjectId}` as WorkspaceSubjectKey;
}

export function parseWorkspaceSubjectKey(key: string): WorkspaceSubject | null {
  const separatorIndex = key.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex >= key.length - 1) return null;

  const subjectType = key.slice(0, separatorIndex);
  const subjectId = key.slice(separatorIndex + 1).trim();
  if (!isWorkspaceSubjectType(subjectType) || !subjectId) return null;

  return { subjectType, subjectId };
}

export function sanitizeWorkspaceLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const candidate of value) {
    if (typeof candidate !== "string") continue;
    const next = candidate.trim();
    if (!next) continue;
    unique.add(next);
  }
  return Array.from(unique);
}

export function sanitizeWorkspaceDecision(value: unknown): WorkspaceDecisionState {
  if (!isPlainObject(value)) return { ...DEFAULT_DECISION_STATE };

  const sentiment =
    value.sentiment === "love" || value.sentiment === "maybe" || value.sentiment === "pass"
      ? value.sentiment
      : null;

  const checks = Array.isArray(value.checks)
    ? value.checks.filter(
        (check): check is string => typeof check === "string" && WORKSPACE_DECISION_CHECK_IDS.has(check),
      )
    : [];

  const score =
    typeof value.score === "number" &&
    Number.isFinite(value.score) &&
    value.score >= 1 &&
    value.score <= 5
      ? Math.round(value.score)
      : null;

  return {
    sentiment,
    checks: Array.from(new Set(checks)),
    score,
  };
}

export function sanitizeWorkspaceNote(value: unknown): WorkspaceNote | null {
  if (!isPlainObject(value)) return null;

  const text = typeof value.text === "string" ? value.text.trim() : "";
  if (!text) return null;

  const id = typeof value.id === "string" && value.id.trim() ? value.id.trim() : `note-${Date.now()}`;
  const createdAt =
    typeof value.createdAt === "number" && Number.isFinite(value.createdAt)
      ? value.createdAt
      : Date.now();
  const updatedAt =
    typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt)
      ? value.updatedAt
      : undefined;

  return { id, text, createdAt, ...(updatedAt !== undefined ? { updatedAt } : {}) };
}

export function sanitizeWorkspaceQueueState(value: unknown): WorkspaceQueueState | undefined {
  if (!isPlainObject(value)) return undefined;
  if (value.queued !== true) return undefined;

  const title = typeof value.title === "string" ? value.title.trim() : "";
  if (!title) return undefined;

  const subtitle = typeof value.subtitle === "string" ? value.subtitle.trim() : null;
  const addedAt =
    typeof value.addedAt === "number" && Number.isFinite(value.addedAt)
      ? value.addedAt
      : Date.now();

  return {
    queued: true,
    title,
    subtitle,
    addedAt,
  };
}

export function sanitizeWorkspaceSubjectState(value: unknown): WorkspaceSubjectState | null {
  if (!isPlainObject(value)) return null;

  const queue = sanitizeWorkspaceQueueState(value.queue);
  const notes = Array.isArray(value.notes)
    ? value.notes.map(sanitizeWorkspaceNote).filter((note): note is WorkspaceNote => Boolean(note))
    : [];
  const labels = sanitizeWorkspaceLabels(value.labels);
  const decision = sanitizeWorkspaceDecision(value.decision);
  const hasDecision =
    decision.sentiment !== null || decision.checks.length > 0 || typeof decision.score === "number";

  const updatedAt =
    typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt)
      ? value.updatedAt
      : undefined;
  const builderId = sanitizeOptionalString(value.builderId);
  const communityId = sanitizeOptionalString(value.communityId);
  const listingId = sanitizeOptionalString(value.listingId);
  const floorPlanId = sanitizeOptionalString(value.floorPlanId);

  const subject: WorkspaceSubjectState = {};
  if (builderId) subject.builderId = builderId;
  if (communityId) subject.communityId = communityId;
  if (listingId) subject.listingId = listingId;
  if (floorPlanId) subject.floorPlanId = floorPlanId;
  if (queue) subject.queue = queue;
  if (notes.length) subject.notes = notes;
  if (labels.length) subject.labels = labels;
  if (hasDecision) subject.decision = decision;
  if (updatedAt !== undefined && Object.keys(subject).length > 0) {
    subject.updatedAt = updatedAt;
  }

  return Object.keys(subject).length ? subject : null;
}

export function sanitizeWorkspaceStorageSnapshot(value: unknown): WorkspaceStorageSnapshot {
  if (!isPlainObject(value)) return getEmptyWorkspaceStorageSnapshot();
  if (!isPlainObject(value.subjects)) return getEmptyWorkspaceStorageSnapshot();

  const subjects: Record<string, WorkspaceSubjectState> = {};
  for (const [key, subjectValue] of Object.entries(value.subjects)) {
    if (!parseWorkspaceSubjectKey(key)) continue;
    const sanitized = sanitizeWorkspaceSubjectState(subjectValue);
    if (!sanitized) continue;
    subjects[key] = sanitized;
  }

  return {
    version: WORKSPACE_STORAGE_VERSION,
    subjects,
  };
}

export function createWorkspaceNoteId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function extractWorkspaceQueueItems(storage: WorkspaceStorageSnapshot): WorkspaceQueueItem[] {
  const queueItems: WorkspaceQueueItem[] = [];

  for (const [key, record] of Object.entries(storage.subjects)) {
    const parsed = parseWorkspaceSubjectKey(key);
    if (!parsed || !record.queue?.queued || !record.queue.title) continue;

    queueItems.push({
      subjectType: parsed.subjectType,
      subjectId: parsed.subjectId,
      title: record.queue.title,
      subtitle: record.queue.subtitle ?? null,
      addedAt: record.queue.addedAt ?? Date.now(),
    });
  }

  queueItems.sort((a, b) => b.addedAt - a.addedAt);
  return queueItems;
}

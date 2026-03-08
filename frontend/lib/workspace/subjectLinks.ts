import type { WorkspaceSubjectType } from "./types";

export function buildWorkspaceSubjectHref(
  subjectType: WorkspaceSubjectType,
  subjectId: string,
): string | null {
  const normalizedSubjectId = typeof subjectId === "string" ? subjectId.trim() : "";
  if (!normalizedSubjectId) return null;

  const encodedId = encodeURIComponent(normalizedSubjectId);
  if (subjectType === "listing") return `/listing/${encodedId}`;
  if (subjectType === "builder") return `/builder/${encodedId}`;
  if (subjectType === "floorPlan") return `/floorplan/${encodedId}`;
  if (subjectType === "community") return `/community?communityId=${encodedId}`;
  return null;
}

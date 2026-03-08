import type { WorkspaceDecisionCheck, WorkspaceSubjectType } from "./types";

type WorkspaceDecisionCheckMap = Record<WorkspaceSubjectType, readonly WorkspaceDecisionCheck[]>;

export const WORKSPACE_DECISION_CHECKS_BY_SUBJECT: WorkspaceDecisionCheckMap = {
  listing: [
    { id: "layout", label: "Layout works for me" },
    { id: "kitchen", label: "Kitchen stands out" },
    { id: "primarySuite", label: "Primary suite works" },
    { id: "storage", label: "Storage feels good" },
    { id: "outdoor", label: "Outdoor space works" },
    { id: "price", label: "Price feels reasonable" },
    { id: "communityLocation", label: "Location in community is good" },
    { id: "tourNeeded", label: "Needs in-person tour" },
  ],
  floorPlan: [
    { id: "layout", label: "Layout works for me" },
    { id: "kitchen", label: "Kitchen stands out" },
    { id: "primarySuite", label: "Primary suite works" },
    { id: "storage", label: "Storage feels good" },
    { id: "price", label: "Price feels reasonable" },
    { id: "tourNeeded", label: "Needs in-person tour" },
  ],
  community: [
    { id: "locationWorks", label: "Location works for me" },
    { id: "amenitiesMatter", label: "Amenities matter to me" },
    { id: "commuteReasonable", label: "Commute feels reasonable" },
    { id: "schoolsAppealing", label: "Schools are appealing" },
    { id: "vibeRight", label: "Community vibe feels right" },
    { id: "visitInPerson", label: "Worth visiting in person" },
  ],
  builder: [
    { id: "styleFits", label: "Design style fits me" },
    { id: "reputationStrong", label: "Reputation feels strong" },
    { id: "qualityStandsOut", label: "Product quality stands out" },
    { id: "homeTypesFit", label: "Offers the type of homes I want" },
    { id: "exploreMore", label: "Worth exploring more" },
  ],
};

export function getWorkspaceDecisionChecks(
  subjectType: WorkspaceSubjectType,
): readonly WorkspaceDecisionCheck[] {
  return WORKSPACE_DECISION_CHECKS_BY_SUBJECT[subjectType];
}

export const WORKSPACE_DECISION_CHECK_IDS = new Set<string>(
  Object.values(WORKSPACE_DECISION_CHECKS_BY_SUBJECT).flatMap((checks) =>
    checks.map((check) => check.id),
  ),
);

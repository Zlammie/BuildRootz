"use client";

import type { BuilderPlanCard } from "./types";
import WorkspaceQueueButton from "../workspace/WorkspaceQueueButton";
import styles from "./PlanCard.module.css";

type Props = {
  plan: BuilderPlanCard;
  onPreview: (plan: BuilderPlanCard) => void;
  onViewHomes: (plan: BuilderPlanCard) => void;
  queueContext?: {
    builderId?: string;
    communityId?: string;
  };
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export default function PlanCard({ plan, onPreview, onViewHomes, queueContext }: Props) {
  const heroImageUrl = cleanText(plan.heroImageUrl);
  const previewUrl = cleanText(plan.previewUrl) || cleanText(plan.fileUrl);
  const previewDisabled = !previewUrl;
  const floorPlanSubjectId =
    cleanText(plan.id) || cleanText(plan.planCatalogId) || cleanText(plan.keepupFloorPlanId);
  const floorPlanTitle = cleanText(plan.name) || "Floor plan";
  const floorPlanSubtitle = cleanText(plan.fromPrice) || null;

  return (
    <article className={styles.card}>
      <div
        className={`${styles.media} ${heroImageUrl ? "" : styles.mediaPlaceholder}`}
        style={heroImageUrl ? { backgroundImage: `url(${heroImageUrl})` } : undefined}
        role="img"
        aria-label={heroImageUrl ? `${plan.name} floor plan preview` : `${plan.name} floor plan placeholder`}
      >
        {!heroImageUrl ? <span className={styles.noPreview}>No preview</span> : null}
      </div>
      <div className={styles.body}>
        <p className={styles.name}>{plan.name}</p>
        <p className={styles.specs}>{plan.specs}</p>
        <p className={styles.price}>{plan.fromPrice}</p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.previewBtn}
            onClick={() => onPreview(plan)}
            disabled={previewDisabled}
            title={previewDisabled ? "Preview not available" : "Preview floor plan"}
          >
            Preview floor plan
          </button>
          <button type="button" className={styles.secondaryBtn} onClick={() => onViewHomes(plan)}>
            View homes
          </button>
        </div>
        {floorPlanSubjectId ? (
          <div className={styles.queueRow}>
            <WorkspaceQueueButton
              subjectType="floorPlan"
              subjectId={floorPlanSubjectId}
              title={floorPlanTitle}
              subtitle={floorPlanSubtitle}
              contextRefs={{
                floorPlanId: floorPlanSubjectId,
                ...(queueContext?.builderId ? { builderId: queueContext.builderId } : {}),
                ...(queueContext?.communityId ? { communityId: queueContext.communityId } : {}),
              }}
              className={styles.queueBtn}
              activeClassName={styles.queueBtnActive}
              queuedLabel="In Queue"
              idleLabel="Queue"
            />
          </div>
        ) : null}
      </div>
    </article>
  );
}

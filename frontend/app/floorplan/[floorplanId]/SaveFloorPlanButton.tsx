"use client";

import { useEffect, useState } from "react";
import {
  getLocalSavedFloorPlans,
  toggleLocalSavedFloorPlan,
} from "../../../lib/savedFloorPlansStorage";
import styles from "./page.module.css";

type SaveFloorPlanButtonProps = {
  floorPlanId: string;
  floorPlanName: string;
};

export default function SaveFloorPlanButton({
  floorPlanId,
  floorPlanName,
}: SaveFloorPlanButtonProps) {
  const [isSaved, setIsSaved] = useState(false);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    if (!floorPlanId) {
      setIsSaved(false);
      return;
    }
    const existing = getLocalSavedFloorPlans();
    setIsSaved(existing.includes(floorPlanId));
  }, [floorPlanId]);

  const label = isPending ? "Saving..." : isSaved ? "Saved plan" : "Save plan";

  const handleClick = () => {
    if (!floorPlanId || isPending) return;
    setIsPending(true);
    try {
      const next = toggleLocalSavedFloorPlan(floorPlanId);
      setIsSaved(next.includes(floorPlanId));
    } finally {
      setIsPending(false);
    }
  };

  return (
    <button
      type="button"
      className={`${styles.saveAction} ${isSaved ? styles.saveActionSaved : ""}`}
      aria-pressed={isSaved}
      aria-label={`${label} ${floorPlanName}`}
      title={label}
      onClick={handleClick}
      disabled={!floorPlanId || isPending}
    >
      <span className={styles.saveText}>{label}</span>
      <svg className={styles.saveIcon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle className={styles.saveCircle} cx="12" cy="12" r="9" />
        <path
          className={styles.saveRoots}
          d="M12 14.5c-.6.9-1.3 1.7-2.2 2.2M12 14.5c.6.7 1.3 1.4 2.2 1.8M12 14.5c0 1-.2 2-.4 3M12 14.5c.3.8.5 1.5.8 2.3"
          fill="none"
        />
        <path
          className={styles.saveSprout}
          d="M12 14.5V10.8m0 0c.4-1.3 1.1-2.6 2.8-3m-2.8 3c-.5-1.2-1.3-2.3-2.8-2.6"
          fill="none"
        />
      </svg>
    </button>
  );
}

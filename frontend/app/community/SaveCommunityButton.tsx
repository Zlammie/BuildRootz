"use client";

import { useState } from "react";
import { useAuth } from "../../components/AuthProvider";
import styles from "./page.module.css";

type Props = {
  communityId?: string | null;
};

export default function SaveCommunityButton({ communityId }: Props) {
  const { savedCommunities, toggleSavedCommunity } = useAuth();
  const [loading, setLoading] = useState(false);
  const id = communityId || "";
  const isSaved = id ? savedCommunities.includes(id) : false;
  const label = loading ? "Saving..." : isSaved ? "Saved community" : "Save community";

  const handleClick = async () => {
    if (!id || loading) return;
    setLoading(true);
    try {
      await toggleSavedCommunity(id);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      className={`${styles.saveButton} ${isSaved ? styles.saveButtonSaved : ""}`}
      aria-pressed={isSaved}
      aria-label={label}
      title={label}
      onClick={handleClick}
      disabled={!id || loading}
    >
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

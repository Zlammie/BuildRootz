"use client";

import { useEffect, useMemo, useState } from "react";
import { getLocalSavedHomes } from "../../../lib/savedHomesStorage";
import styles from "./page.module.css";

type Props = {
  homeIds: string[];
};

export default function LikedHomesStat({ homeIds }: Props) {
  const [likedCount, setLikedCount] = useState(0);
  const homeIdSet = useMemo(() => new Set(homeIds), [homeIds]);

  useEffect(() => {
    const updateCount = () => {
      const saved = getLocalSavedHomes();
      if (!saved.length || !homeIdSet.size) {
        setLikedCount(0);
        return;
      }
      const count = saved.reduce((total, id) => (homeIdSet.has(id) ? total + 1 : total), 0);
      setLikedCount(count);
    };

    updateCount();
    const handleStorage = () => updateCount();
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [homeIdSet]);

  return (
    <div className={styles.statCard}>
      <div className={styles.statHeader}>
        <span className={styles.statLabel}>Liked homes</span>
        <svg className={styles.statIcon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
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
      </div>
      <strong>{likedCount}</strong>
    </div>
  );
}

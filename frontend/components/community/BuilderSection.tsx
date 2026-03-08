"use client";

import { useState } from "react";
import { useEffect } from "react";
import {
  buildExpandedStorageKey,
} from "../../../shared/communityBuilderState";
import BuilderCard from "./BuilderCard";
import type { BuilderCardData } from "./types";
import styles from "./CommunitySections.module.css";

type Props = {
  communityId: string;
  builders: BuilderCardData[];
};

function buildDefaultExpandedMap(builders: BuilderCardData[], defaultExpanded: boolean) {
  const map: Record<string, boolean> = {};
  builders.forEach((builder) => {
    map[builder.id] = defaultExpanded;
  });
  return map;
}

export default function BuilderSection({ communityId, builders }: Props) {
  const defaultExpanded = builders.length <= 1;
  const [expandedById, setExpandedById] = useState<Record<string, boolean>>(() =>
    buildDefaultExpandedMap(builders, defaultExpanded),
  );

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const next = buildDefaultExpandedMap(builders, defaultExpanded);
    builders.forEach((builder) => {
      const key = buildExpandedStorageKey(communityId, builder.id);
      const saved = window.localStorage.getItem(key);
      if (saved === "1") next[builder.id] = true;
      if (saved === "0") next[builder.id] = false;
    });
    const frame = window.requestAnimationFrame(() => setExpandedById(next));
    return () => window.cancelAnimationFrame(frame);
  }, [builders, communityId, defaultExpanded]);

  const persistExpanded = (builderId: string, value: boolean) => {
    const key = buildExpandedStorageKey(communityId, builderId);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(key, value ? "1" : "0");
    }
  };

  const setAllExpanded = (value: boolean) => {
    const next = buildDefaultExpandedMap(builders, value);
    setExpandedById(next);
    builders.forEach((builder) => persistExpanded(builder.id, value));
  };

  const handleExpandedChange = (builderId: string, value: boolean) => {
    setExpandedById((current) => ({ ...current, [builderId]: value }));
    persistExpanded(builderId, value);
  };

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeaderRow}>
        <h2 className={styles.sectionHeader}>Builders in this Community</h2>
        {builders.length > 0 ? (
          <div className={styles.sectionControls}>
            <button type="button" className={styles.sectionControlBtn} onClick={() => setAllExpanded(true)}>
              Expand all
            </button>
            <button type="button" className={styles.sectionControlBtn} onClick={() => setAllExpanded(false)}>
              Collapse all
            </button>
          </div>
        ) : null}
      </div>

      {builders.length === 0 ? (
        <div className={styles.card}>
          <p className={styles.muted}>No builders published yet for this community.</p>
        </div>
      ) : (
        <div className={styles.builderList}>
          {builders.map((builder) => (
            <BuilderCard
              key={`${communityId}-${builder.id}`}
              communityId={communityId}
              builder={builder}
              expanded={Boolean(expandedById[builder.id])}
              onExpandedChange={(value) => handleExpandedChange(builder.id, value)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

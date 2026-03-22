"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ListingCard from "../ListingCard";
import {
  buildTabStorageKey,
  normalizeTab,
} from "../../../shared/communityBuilderState";
import PlanCard from "./PlanCard";
import type { BuilderCardData, BuilderPlanCard } from "./types";
import styles from "./CommunitySections.module.css";

type Props = {
  communityId: string;
  builder: BuilderCardData;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
};

type BuilderTab = "plans" | "inventory";

type PreviewState = {
  url: string;
  planName: string;
  kind: "pdf" | "image";
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePlanToken(value: unknown): string {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isPdfUrl(url: string): boolean {
  const cleaned = cleanText(url);
  if (!cleaned) return false;
  try {
    const parsed = new URL(cleaned, "https://buildrootz.local");
    return parsed.pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return cleaned.toLowerCase().split("?")[0].endsWith(".pdf");
  }
}

function planMatchesHome(plan: BuilderPlanCard, home: BuilderCardData["inventoryHomes"][number]): boolean {
  const planTokens = new Set(
    [plan.id, plan.planCatalogId, plan.keepupFloorPlanId]
      .map((token) => normalizePlanToken(token))
      .filter(Boolean),
  );

  const homeTokens = [home.planCatalogId, home.keepupFloorPlanId, home.planNumber]
    .map((token) => normalizePlanToken(token))
    .filter(Boolean);

  if (homeTokens.some((token) => planTokens.has(token))) {
    return true;
  }

  const normalizedHomePlanName = normalizePlanToken(home.planName);
  const normalizedPlanName = normalizePlanToken(plan.name);
  if (normalizedHomePlanName && normalizedPlanName) {
    return (
      normalizedHomePlanName === normalizedPlanName ||
      normalizedHomePlanName.includes(normalizedPlanName) ||
      normalizedPlanName.includes(normalizedHomePlanName)
    );
  }

  return false;
}

export default function BuilderCard({
  communityId,
  builder,
  expanded,
  onExpandedChange,
}: Props) {
  const tabStorageKey = useMemo(
    () => buildTabStorageKey(communityId, builder.id),
    [communityId, builder.id],
  );
  const [activeTab, setActiveTab] = useState<BuilderTab>("plans");
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [planFilter, setPlanFilter] = useState<{ planId: string; planName: string } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const saved = normalizeTab(window.localStorage.getItem(tabStorageKey)) as BuilderTab;
    const frame = window.requestAnimationFrame(() => setActiveTab(saved));
    return () => window.cancelAnimationFrame(frame);
  }, [tabStorageKey]);

  useEffect(() => {
    if (!preview || typeof window === "undefined") return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPreview(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [preview]);

  const plans = useMemo(
    () => (Array.isArray(builder.plans) ? builder.plans : []),
    [builder.plans],
  );
  const inventoryHomes = useMemo(
    () => (Array.isArray(builder.inventoryHomes) ? builder.inventoryHomes : []),
    [builder.inventoryHomes],
  );

  const filteredHomes = useMemo(() => {
    if (!planFilter) return inventoryHomes;
    const selectedPlan = plans.find((plan) => cleanText(plan.id) === cleanText(planFilter.planId));
    if (!selectedPlan) return inventoryHomes;
    return inventoryHomes.filter((home) => planMatchesHome(selectedPlan, home));
  }, [inventoryHomes, planFilter, plans]);

  const communitySummary = useMemo(
    () =>
      builder.community
        ? {
            name: cleanText(builder.community.name) || undefined,
            slug: cleanText(builder.community.slug) || undefined,
            city: cleanText(builder.community.city) || undefined,
            state: cleanText(builder.community.state) || undefined,
            mapImage: cleanText(builder.community.mapImage) || undefined,
          }
        : null,
    [builder.community],
  );

  const handleTabChange = (next: BuilderTab) => {
    setActiveTab(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(tabStorageKey, next);
    }
  };

  const handlePreview = (plan: BuilderPlanCard) => {
    const url = cleanText(plan.previewUrl) || cleanText(plan.fileUrl);
    if (!url) return;
    setPreview({ url, planName: plan.name, kind: isPdfUrl(url) ? "pdf" : "image" });
  };

  const handleViewHomes = (plan: BuilderPlanCard) => {
    setPlanFilter({ planId: plan.id, planName: plan.name });
    handleTabChange("inventory");
  };

  return (
    <article className={styles.builderCard}>
      <div className={styles.builderHeaderRow}>
        <div className={styles.builderTitleRow}>
          {builder.logoUrl ? (
            <img src={builder.logoUrl} alt={`${builder.name} logo`} className={styles.builderLogo} />
          ) : (
            <div className={styles.builderLogoFallback}>{builder.name.slice(0, 1).toUpperCase()}</div>
          )}
          <div>
            <h3 className={styles.builderName}>
              {builder.slug ? (
                <Link href={`/builder/${encodeURIComponent(builder.slug)}`} className={styles.builderNameLink}>
                  {builder.name}
                </Link>
              ) : (
                builder.name
              )}
            </h3>
            <p className={styles.builderModelAddress}>
              Model Address : {cleanText(builder.modelAddress) || "\u2014"}
            </p>
          </div>
        </div>

        <button
          type="button"
          className={styles.collapseToggle}
          onClick={() => onExpandedChange(!expanded)}
          aria-expanded={expanded}
          aria-label={expanded ? `Collapse ${builder.name}` : `Expand ${builder.name}`}
        >
          {expanded ? "Collapse" : "Expand"}
          <span className={`${styles.chevron} ${expanded ? styles.chevronUp : ""}`} aria-hidden="true" />
        </button>
      </div>

      <div className={styles.builderMetrics}>
        {builder.metrics.map((metric) => (
          <div key={metric.label} className={styles.metric}>
            <div className={styles.metricLabel}>{metric.label}</div>
            <div className={styles.metricValue}>{metric.value}</div>
          </div>
        ))}
      </div>

      {expanded ? (
        <div className={styles.builderBrowserPanel}>
          <div className={styles.builderTabs} role="tablist" aria-label={`${builder.name} content tabs`}>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === "plans" ? styles.tabBtnActive : ""}`}
              role="tab"
              aria-selected={activeTab === "plans"}
              onClick={() => handleTabChange("plans")}
            >
              Plans ({plans.length})
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === "inventory" ? styles.tabBtnActive : ""}`}
              role="tab"
              aria-selected={activeTab === "inventory"}
              onClick={() => handleTabChange("inventory")}
            >
              Quick Move-In ({inventoryHomes.length})
            </button>
          </div>

          {activeTab === "plans" ? (
            plans.length ? (
              <div className={styles.planGrid}>
                {plans.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    onPreview={handlePreview}
                    onViewHomes={handleViewHomes}
                    queueContext={{
                      builderId: builder.id,
                      communityId,
                    }}
                  />
                ))}
              </div>
            ) : (
              <p className={styles.emptyState}>No floor plans published for this builder yet.</p>
            )
          ) : (
            <div className={styles.inventoryTabPanel}>
              {planFilter ? (
                <div className={styles.planFilterChip}>
                  <span>Filtered by: {planFilter.planName}</span>
                  <button type="button" onClick={() => setPlanFilter(null)} aria-label="Clear plan filter">
                    x
                  </button>
                </div>
              ) : null}

              {filteredHomes.length ? (
                <div className={styles.inventoryGrid}>
                  {filteredHomes.map((home) => (
                    <ListingCard
                      key={home.id}
                      home={home}
                      variant="compact"
                      showSaveButton
                      community={communitySummary}
                      builder={{
                        builderName: builder.name,
                        builderSlug: builder.slug,
                        logoUrl: builder.logoUrl,
                      }}
                    />
                  ))}
                </div>
              ) : (
                <p className={styles.emptyState}>No quick move-in homes available right now.</p>
              )}
            </div>
          )}
        </div>
      ) : null}

      {preview ? (
        <div className={styles.previewModalBackdrop} onClick={() => setPreview(null)} role="presentation">
          <div className={styles.previewModal} onClick={(event) => event.stopPropagation()}>
            <div className={styles.previewModalHeader}>
              <p className={styles.previewModalTitle}>{preview.planName}</p>
              <button type="button" onClick={() => setPreview(null)} className={styles.previewModalClose}>
                Close
              </button>
            </div>
            {preview.kind === "pdf" ? (
              <iframe
                title={`${preview.planName} preview`}
                src={preview.url}
                className={styles.previewFrame}
              />
            ) : (
              <img
                src={preview.url}
                alt={`${preview.planName} floor plan preview`}
                className={styles.previewImage}
              />
            )}
            <a href={preview.url} target="_blank" rel="noreferrer" className={styles.previewExternalLink}>
              Open in new tab
            </a>
          </div>
        </div>
      ) : null}
    </article>
  );
}


"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import NavBar from "../../components/NavBar";
import { useAuth } from "../../components/AuthProvider";
import WorkspaceQueueButton from "../../components/workspace/WorkspaceQueueButton";
import { getWorkspaceAdapter } from "../../lib/workspace/getWorkspaceAdapter";
import { buildWorkspaceSubjectHref } from "../../lib/workspace/subjectLinks";
import {
  extractWorkspaceQueueItems,
  getEmptyWorkspaceStorageSnapshot,
  getWorkspaceSubjectKey,
  sanitizeWorkspaceDecision,
  sanitizeWorkspaceLabels,
  sanitizeWorkspaceStorageSnapshot,
} from "../../lib/workspace/storage";
import { subscribeWorkspaceSync } from "../../lib/workspace/sync";
import type {
  WorkspaceDecisionSentiment,
  WorkspaceStorageSnapshot,
  WorkspaceSubjectContextRefs,
  WorkspaceSubjectState,
  WorkspaceSubjectType,
} from "../../lib/workspace/types";
import styles from "./page.module.css";

type QueueFilter = "all" | WorkspaceSubjectType;

type WorkspaceQueuedSubject = {
  subjectType: WorkspaceSubjectType;
  subjectId: string;
  title: string;
  subtitle?: string | null;
  addedAt: number;
  notesCount: number;
  labels: string[];
  decisionSentiment: WorkspaceDecisionSentiment | null;
  decisionChecksCount: number;
  decisionScore: number | null;
  href: string | null;
  contextRefs?: WorkspaceSubjectContextRefs;
};

const FILTERS: Array<{ id: QueueFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "listing", label: "Listings" },
  { id: "floorPlan", label: "Floor Plans" },
  { id: "community", label: "Communities" },
  { id: "builder", label: "Builders" },
];

const SUBJECT_TYPE_LABELS: Record<WorkspaceSubjectType, string> = {
  listing: "Listing",
  floorPlan: "Floor Plan",
  community: "Community",
  builder: "Builder",
};

const SENTIMENT_LABELS: Record<WorkspaceDecisionSentiment, string> = {
  love: "Love It",
  maybe: "Maybe",
  pass: "Pass",
};

const addedDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function buildContextRefs(subject: WorkspaceSubjectState | undefined): WorkspaceSubjectContextRefs | undefined {
  if (!subject) return undefined;
  const next: WorkspaceSubjectContextRefs = {};
  if (subject.builderId) next.builderId = subject.builderId;
  if (subject.communityId) next.communityId = subject.communityId;
  if (subject.listingId) next.listingId = subject.listingId;
  if (subject.floorPlanId) next.floorPlanId = subject.floorPlanId;
  if (!next.builderId && !next.communityId && !next.listingId && !next.floorPlanId) return undefined;
  return next;
}

function formatAddedAt(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return "recently";
  return addedDateFormatter.format(new Date(timestamp));
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

export default function WorkspacePage() {
  const { user } = useAuth();
  const isAuthenticated = Boolean(user);
  const userId = typeof user?.id === "string" ? user.id : null;
  const workspaceAdapter = useMemo(
    () => getWorkspaceAdapter({ isAuthenticated, userId }),
    [isAuthenticated, userId],
  );

  const [activeFilter, setActiveFilter] = useState<QueueFilter>("all");
  const [snapshot, setSnapshot] = useState<WorkspaceStorageSnapshot>(() => getEmptyWorkspaceStorageSnapshot());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadRequestRef = useRef(0);

  const refreshSnapshot = useCallback(async () => {
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;

    try {
      const nextSnapshot = await workspaceAdapter.loadAll();
      if (loadRequestRef.current !== requestId) return;
      setSnapshot(sanitizeWorkspaceStorageSnapshot(nextSnapshot));
      setError(null);
    } catch (loadError) {
      if (loadRequestRef.current !== requestId) return;
      setSnapshot(getEmptyWorkspaceStorageSnapshot());
      setError(loadError instanceof Error ? loadError.message : "Unable to load workspace right now.");
    } finally {
      if (loadRequestRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, [workspaceAdapter]);

  useEffect(() => {
    setIsLoading(true);
    void refreshSnapshot();
  }, [refreshSnapshot]);

  useEffect(() => {
    return subscribeWorkspaceSync(() => {
      void refreshSnapshot();
    });
  }, [refreshSnapshot]);

  const queuedItems = useMemo<WorkspaceQueuedSubject[]>(() => {
    const queue = extractWorkspaceQueueItems(snapshot);
    return queue.map((item) => {
      const subjectKey = getWorkspaceSubjectKey(item.subjectType, item.subjectId);
      const subject = snapshot.subjects[subjectKey];
      const notesCount = Array.isArray(subject?.notes) ? subject.notes.length : 0;
      const labels = sanitizeWorkspaceLabels(subject?.labels);
      const decision = sanitizeWorkspaceDecision(subject?.decision);

      return {
        subjectType: item.subjectType,
        subjectId: item.subjectId,
        title: item.title,
        subtitle: item.subtitle ?? null,
        addedAt: item.addedAt,
        notesCount,
        labels,
        decisionSentiment: decision.sentiment,
        decisionChecksCount: decision.checks.length,
        decisionScore: decision.score,
        href: buildWorkspaceSubjectHref(item.subjectType, item.subjectId),
        contextRefs: buildContextRefs(subject),
      };
    });
  }, [snapshot]);

  const countsByType = useMemo<Record<WorkspaceSubjectType, number>>(
    () =>
      queuedItems.reduce<Record<WorkspaceSubjectType, number>>(
        (accumulator, item) => {
          accumulator[item.subjectType] += 1;
          return accumulator;
        },
        {
          listing: 0,
          floorPlan: 0,
          community: 0,
          builder: 0,
        },
      ),
    [queuedItems],
  );

  const visibleItems = useMemo(
    () =>
      activeFilter === "all"
        ? queuedItems
        : queuedItems.filter((item) => item.subjectType === activeFilter),
    [activeFilter, queuedItems],
  );

  const currentFilterLabel = FILTERS.find((filter) => filter.id === activeFilter)?.label || "Items";
  const persistenceHint = workspaceAdapter.supportsCrossDeviceSync
    ? "Saved to your account."
    : "Saved on this browser.";

  return (
    <div className={styles.page}>
      <NavBar />
      <main className={styles.container}>
        <header className={styles.header}>
          <div className={styles.headerBody}>
            <p className={styles.kicker}>My Workspace</p>
            <h1 className={styles.title}>Queue review</h1>
            <p className={styles.subhead}>
              Review everything you marked to revisit across listings, floor plans, communities, and
              builders.
            </p>
            <p className={styles.hint}>{persistenceHint}</p>
          </div>

          <div className={styles.summaryPanel}>
            <div className={styles.summaryCell}>
              <span className={styles.summaryLabel}>Total queued</span>
              <strong className={styles.summaryValue}>{queuedItems.length}</strong>
            </div>
            <div className={styles.summaryGrid}>
              <span className={styles.summaryChip}>Listings: {countsByType.listing}</span>
              <span className={styles.summaryChip}>Floor plans: {countsByType.floorPlan}</span>
              <span className={styles.summaryChip}>Communities: {countsByType.community}</span>
              <span className={styles.summaryChip}>Builders: {countsByType.builder}</span>
            </div>
            {!isAuthenticated ? (
              <div className={styles.accountCta}>
                <p className={styles.accountCtaText}>
                  Your workspace is saved on this browser. Create an account to sync across devices.
                </p>
                <div className={styles.accountCtaActions}>
                  <Link href="/signup" className={styles.accountCtaPrimary}>
                    Sign up
                  </Link>
                  <Link href="/login" className={styles.accountCtaSecondary}>
                    Log in
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
        </header>

        <section className={styles.filters} aria-label="Queue filters">
          {FILTERS.map((filter) => {
            const count =
              filter.id === "all" ? queuedItems.length : countsByType[filter.id as WorkspaceSubjectType];
            const isActive = activeFilter === filter.id;
            return (
              <button
                key={filter.id}
                type="button"
                className={`${styles.filterButton} ${isActive ? styles.filterButtonActive : ""}`}
                onClick={() => setActiveFilter(filter.id)}
                aria-pressed={isActive}
              >
                <span>{filter.label}</span>
                <span className={styles.filterCount}>{count}</span>
              </button>
            );
          })}
        </section>

        {error ? (
          <section className={styles.errorBox} role="alert">
            {error}
          </section>
        ) : null}

        {isLoading ? <p className={styles.status}>Loading workspace...</p> : null}

        {!isLoading && queuedItems.length === 0 ? (
          <section className={styles.emptyCard}>
            <h2>Your queue is empty</h2>
            <p>
              Queue listings, floor plans, communities, or builders while browsing to build your
              decision shortlist.
            </p>
            <Link href="/listings" className={styles.emptyCta}>
              Browse homes
            </Link>
          </section>
        ) : null}

        {!isLoading && queuedItems.length > 0 && visibleItems.length === 0 ? (
          <section className={styles.emptyCard}>
            <h2>No queued {currentFilterLabel.toLowerCase()}</h2>
            <p>Try another filter, or queue more items while you browse.</p>
          </section>
        ) : null}

        {!isLoading && visibleItems.length > 0 ? (
          <section className={styles.list} aria-label="Queued items">
            {visibleItems.map((item) => {
              const visibleLabels = item.labels.slice(0, 4);
              const additionalLabels = Math.max(item.labels.length - visibleLabels.length, 0);

              return (
                <article
                  key={`${item.subjectType}:${item.subjectId}`}
                  className={`${styles.itemCard} ${item.href ? styles.itemCardLinked : ""}`}
                  data-subject-type={item.subjectType}
                >
                  {item.href ? (
                    <Link href={item.href} className={styles.itemCardLink} aria-label={`Open ${item.title}`}>
                      <span className={styles.visuallyHidden}>Open {item.title}</span>
                    </Link>
                  ) : null}
                  <div className={styles.itemTop}>
                    <div className={styles.itemMain}>
                      <div className={styles.itemBadges}>
                        <span className={styles.subjectBadge}>{SUBJECT_TYPE_LABELS[item.subjectType]}</span>
                        <span className={styles.queueBadge}>In Queue</span>
                      </div>
                      <p className={styles.itemTitlePlain}>{item.title}</p>
                      {item.subtitle ? <p className={styles.itemSubtitle}>{item.subtitle}</p> : null}
                      <p className={styles.itemMeta}>Queued on {formatAddedAt(item.addedAt)}</p>
                    </div>

                    <div className={styles.queueButtonWrap}>
                      <WorkspaceQueueButton
                        subjectType={item.subjectType}
                        subjectId={item.subjectId}
                        title={item.title}
                        subtitle={item.subtitle}
                        contextRefs={item.contextRefs}
                        className={styles.queueButton}
                        activeClassName={styles.queueButtonActive}
                      />
                    </div>
                  </div>

                  <div className={styles.summaryRow}>
                    <span className={styles.summaryTag}>
                      {item.notesCount} {pluralize(item.notesCount, "note", "notes")}
                    </span>
                    {visibleLabels.map((label) => (
                      <span key={label} className={styles.summaryTag}>
                        {label}
                      </span>
                    ))}
                    {additionalLabels > 0 ? (
                      <span className={styles.summaryTag}>+{additionalLabels} labels</span>
                    ) : null}
                    {item.decisionSentiment ? (
                      <span className={styles.summaryTag}>{SENTIMENT_LABELS[item.decisionSentiment]}</span>
                    ) : null}
                    {item.decisionChecksCount > 0 ? (
                      <span className={styles.summaryTag}>
                        {item.decisionChecksCount}{" "}
                        {pluralize(item.decisionChecksCount, "check", "checks")}
                      </span>
                    ) : null}
                    {item.decisionScore ? (
                      <span className={styles.summaryTag}>Score {item.decisionScore}/5</span>
                    ) : null}
                  </div>

                  {item.href ? <div className={styles.itemFooter}>Open {SUBJECT_TYPE_LABELS[item.subjectType]}</div> : null}
                </article>
              );
            })}
          </section>
        ) : null}
      </main>
    </div>
  );
}

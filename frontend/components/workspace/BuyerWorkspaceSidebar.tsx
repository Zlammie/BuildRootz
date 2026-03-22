"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../AuthProvider";
import { createLocalStorageWorkspaceAdapter } from "@/lib/workspace/adapters/localStorageAdapter";
import type { WorkspaceStorageAdapter } from "@/lib/workspace/adapters/types";
import { getWorkspaceDecisionChecks } from "@/lib/workspace/decisionChecks";
import { getWorkspaceAdapter } from "@/lib/workspace/getWorkspaceAdapter";
import { buildWorkspaceSubjectHref } from "@/lib/workspace/subjectLinks";
import {
  buildWorkspaceSnapshotFingerprint,
  hasMeaningfulWorkspaceData,
  mergeWorkspaceSnapshots,
  workspaceSnapshotsEqual,
} from "@/lib/workspace/importMerge";
import {
  hasSeenWorkspaceImportFingerprint,
  markWorkspaceImportCompleted,
  markWorkspaceImportDismissed,
} from "@/lib/workspace/importTracking";
import {
  createWorkspaceNoteId,
  extractWorkspaceQueueItems,
  getEmptyWorkspaceStorageSnapshot,
  getWorkspaceSubjectKey,
  sanitizeWorkspaceStorageSnapshot,
  sanitizeWorkspaceDecision,
  sanitizeWorkspaceLabels,
  sanitizeWorkspaceSubjectState,
} from "@/lib/workspace/storage";
import {
  createWorkspaceSyncSourceId,
  emitWorkspaceSync,
  subscribeWorkspaceSync,
} from "@/lib/workspace/sync";
import type {
  WorkspaceDecisionState,
  WorkspaceDecisionSentiment,
  WorkspaceStorageSnapshot,
  WorkspaceSubject,
  WorkspaceSubjectContextRefs,
  WorkspaceSubjectState,
  WorkspaceSubjectType,
} from "@/lib/workspace/types";
import styles from "./BuyerWorkspaceSidebar.module.css";

type WorkspaceSection = "queue" | "notes" | "labels" | "decision";

type BuyerWorkspaceSidebarProps = {
  subjectType: WorkspaceSubjectType;
  subjectId: string;
  title: string;
  subtitle?: string | null;
  contextRefs?: WorkspaceSubjectContextRefs;
};

const NAV_ITEMS: Array<{ id: WorkspaceSection; label: string }> = [
  { id: "queue", label: "Queue" },
  { id: "notes", label: "Notes" },
  { id: "labels", label: "Labels" },
  { id: "decision", label: "Decision" },
];

const LABEL_OPTIONS = ["Favorite", "Maybe", "Needs Tour", "Backup"] as const;

const SENTIMENT_OPTIONS: Array<{ value: WorkspaceDecisionSentiment; label: string }> = [
  { value: "love", label: "Love It" },
  { value: "maybe", label: "Maybe" },
  { value: "pass", label: "Pass" },
];

const SUBJECT_TYPE_LABELS: Record<WorkspaceSubjectType, string> = {
  listing: "Listing",
  community: "Community",
  builder: "Builder",
  floorPlan: "Floor Plan",
};

const SUBJECT_NOTE_LABELS: Record<WorkspaceSubjectType, string> = {
  listing: "listing",
  community: "community",
  builder: "builder",
  floorPlan: "floor plan",
};

function classNames(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(" ");
}

function cleanOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function buildSubjectContextRefs(
  subjectType: WorkspaceSubjectType,
  subjectId: string,
  overrides?: WorkspaceSubjectContextRefs,
): WorkspaceSubjectContextRefs {
  const next: WorkspaceSubjectContextRefs = {};
  const subjectRefId = cleanOptionalString(subjectId);

  if (subjectType === "builder" && subjectRefId) next.builderId = subjectRefId;
  if (subjectType === "community" && subjectRefId) next.communityId = subjectRefId;
  if (subjectType === "listing" && subjectRefId) next.listingId = subjectRefId;
  if (subjectType === "floorPlan" && subjectRefId) next.floorPlanId = subjectRefId;

  const builderId = cleanOptionalString(overrides?.builderId);
  if (builderId) next.builderId = builderId;
  const communityId = cleanOptionalString(overrides?.communityId);
  if (communityId) next.communityId = communityId;
  const listingId = cleanOptionalString(overrides?.listingId);
  if (listingId) next.listingId = listingId;
  const floorPlanId = cleanOptionalString(overrides?.floorPlanId);
  if (floorPlanId) next.floorPlanId = floorPlanId;

  return next;
}

function formatShortDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function buildDecisionSummary(decision: WorkspaceDecisionState): string {
  const sentiment = decision.sentiment
    ? SENTIMENT_OPTIONS.find((option) => option.value === decision.sentiment)?.label
    : null;

  const parts = [
    sentiment ? `Sentiment: ${sentiment}` : "Sentiment: not set",
    `${decision.checks.length} checks selected`,
    decision.score ? `Score: ${decision.score}/5` : "Score: not set",
  ];

  return parts.join(" | ");
}

function WorkspaceGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="6" width="16" height="12" rx="3" />
      <path d="M9 6V4.8A1.8 1.8 0 0 1 10.8 3h2.4A1.8 1.8 0 0 1 15 4.8V6" />
      <path d="M4 11.5h16" />
    </svg>
  );
}

export default function BuyerWorkspaceSidebar({
  subjectType,
  subjectId,
  title,
  subtitle,
  contextRefs,
}: BuyerWorkspaceSidebarProps) {
  const { user } = useAuth();
  const isAuthenticated = Boolean(user);
  const adapterKey = isAuthenticated ? "remote" : "local";
  const userId = typeof user?.id === "string" ? user.id : null;
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeSection, setActiveSection] = useState<WorkspaceSection>("queue");
  const [noteDraft, setNoteDraft] = useState("");
  const [workspaceHydrated, setWorkspaceHydrated] = useState(false);
  const [hydratedAdapterKey, setHydratedAdapterKey] = useState<string | null>(null);
  const [importCandidate, setImportCandidate] = useState<{
    fingerprint: string;
    localSnapshot: WorkspaceStorageSnapshot;
  } | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const workspaceAdapter = useMemo<WorkspaceStorageAdapter>(
    () => getWorkspaceAdapter({ isAuthenticated, userId }),
    [isAuthenticated, userId],
  );
  const syncSourceIdRef = useRef<string>(createWorkspaceSyncSourceId("sidebar"));
  const [workspaceStorage, setWorkspaceStorage] = useState<WorkspaceStorageSnapshot>(() =>
    getEmptyWorkspaceStorageSnapshot(),
  );

  const normalizedSubjectId = useMemo(() => {
    const trimmed = subjectId.trim();
    return trimmed || subjectId;
  }, [subjectId]);

  const subject = useMemo<WorkspaceSubject>(
    () => ({ subjectType, subjectId: normalizedSubjectId }),
    [normalizedSubjectId, subjectType],
  );
  const subjectKey = useMemo(
    () => getWorkspaceSubjectKey(subject.subjectType, subject.subjectId),
    [subject.subjectType, subject.subjectId],
  );
  const subjectContextRefs = useMemo(
    () => buildSubjectContextRefs(subject.subjectType, subject.subjectId, contextRefs),
    [contextRefs, subject.subjectId, subject.subjectType],
  );
  const subjectDecisionChecks = useMemo(
    () => getWorkspaceDecisionChecks(subject.subjectType),
    [subject.subjectType],
  );
  const subjectDecisionCheckIds = useMemo(
    () => new Set(subjectDecisionChecks.map((check) => check.id)),
    [subjectDecisionChecks],
  );
  const subjectTypeLabel = SUBJECT_TYPE_LABELS[subject.subjectType];
  const noteSubjectLabel = SUBJECT_NOTE_LABELS[subject.subjectType];

  const currentRecord = useMemo<WorkspaceSubjectState>(
    () => workspaceStorage.subjects[subjectKey] ?? {},
    [subjectKey, workspaceStorage.subjects],
  );
  const queueItems = useMemo(() => extractWorkspaceQueueItems(workspaceStorage), [workspaceStorage]);
  const queuedForCurrent = Boolean(currentRecord.queue?.queued);
  const notesForCurrent = useMemo(() => {
    const notes = Array.isArray(currentRecord.notes) ? [...currentRecord.notes] : [];
    notes.sort((a, b) => b.createdAt - a.createdAt);
    return notes;
  }, [currentRecord.notes]);
  const selectedLabels = useMemo(
    () => sanitizeWorkspaceLabels(currentRecord.labels),
    [currentRecord.labels],
  );
  const decision = useMemo(() => {
    const sanitized = sanitizeWorkspaceDecision(currentRecord.decision);
    return {
      ...sanitized,
      checks: sanitized.checks.filter((check) => subjectDecisionCheckIds.has(check)),
    };
  }, [currentRecord.decision, subjectDecisionCheckIds]);
  const decisionSummary = buildDecisionSummary(decision);
  const contextSummary = useMemo(() => {
    const summary: string[] = [];

    if (queuedForCurrent) summary.push("In Queue");
    if (notesForCurrent.length) {
      summary.push(`${notesForCurrent.length} note${notesForCurrent.length === 1 ? "" : "s"}`);
    }
    if (selectedLabels.length) {
      summary.push(`${selectedLabels.length} label${selectedLabels.length === 1 ? "" : "s"}`);
    }

    const activeSentiment = SENTIMENT_OPTIONS.find((option) => option.value === decision.sentiment);
    if (activeSentiment) summary.push(activeSentiment.label);

    return summary.join(" | ");
  }, [decision.sentiment, notesForCurrent.length, queuedForCurrent, selectedLabels.length]);
  const workspaceSignalCount =
    queueItems.length +
    notesForCurrent.length +
    selectedLabels.length +
    (decision.sentiment ? 1 : 0);

  useEffect(() => {
    let cancelled = false;

    workspaceAdapter
      .loadAll()
      .then((snapshot) => {
        if (cancelled) return;
        setWorkspaceStorage(snapshot);
        setWorkspaceHydrated(true);
        setHydratedAdapterKey(adapterKey);
      })
      .catch(() => {
        if (cancelled) return;
        setWorkspaceStorage(getEmptyWorkspaceStorageSnapshot());
        setWorkspaceHydrated(false);
        setHydratedAdapterKey(null);
      });

    return () => {
      cancelled = true;
    };
  }, [adapterKey, workspaceAdapter]);

  useEffect(() => {
    if (!workspaceHydrated || hydratedAdapterKey !== adapterKey) return;
    workspaceAdapter.saveAll(workspaceStorage).catch(() => {
      // Ignore transient save errors to keep sidebar responsive.
    });
  }, [adapterKey, hydratedAdapterKey, workspaceAdapter, workspaceHydrated, workspaceStorage]);

  useEffect(() => {
    let cancelled = false;

    if (!userId || adapterKey !== "remote" || hydratedAdapterKey !== adapterKey || !workspaceHydrated) {
      return () => {
        cancelled = true;
      };
    }

    const localAdapter = createLocalStorageWorkspaceAdapter();
    localAdapter
      .loadAll()
      .then((localSnapshot) => {
        if (cancelled) return;
        if (!hasMeaningfulWorkspaceData(localSnapshot)) {
          setImportCandidate(null);
          return;
        }

        const fingerprint = buildWorkspaceSnapshotFingerprint(localSnapshot);
        if (hasSeenWorkspaceImportFingerprint(userId, fingerprint)) {
          setImportCandidate(null);
          return;
        }

        const merged = mergeWorkspaceSnapshots(localSnapshot, workspaceStorage);
        if (workspaceSnapshotsEqual(merged, workspaceStorage)) {
          markWorkspaceImportCompleted(userId, fingerprint);
          setImportCandidate(null);
          return;
        }

        setImportCandidate({
          fingerprint,
          localSnapshot,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setImportCandidate(null);
      });

    return () => {
      cancelled = true;
    };
  }, [adapterKey, hydratedAdapterKey, userId, workspaceHydrated, workspaceStorage]);

  const showImportPrompt =
    Boolean(importCandidate) &&
    Boolean(userId) &&
    adapterKey === "remote" &&
    workspaceHydrated &&
    hydratedAdapterKey === adapterKey;

  async function handleImportWorkspace() {
    if (!importCandidate || !user?.id) return;

    setImportError(null);
    setIsImporting(true);

    try {
      const remoteSnapshot = await workspaceAdapter.loadAll();
      const mergedSnapshot = mergeWorkspaceSnapshots(importCandidate.localSnapshot, remoteSnapshot);

      if (!workspaceSnapshotsEqual(mergedSnapshot, remoteSnapshot)) {
        await workspaceAdapter.saveAll(mergedSnapshot);
        setWorkspaceStorage(mergedSnapshot);
        emitWorkspaceSync({
          sourceId: syncSourceIdRef.current,
        });
      }

      markWorkspaceImportCompleted(user.id, importCandidate.fingerprint);
      setImportCandidate(null);
      setImportStatus("Workspace imported to your account.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to import workspace right now.";
      setImportError(message);
    } finally {
      setIsImporting(false);
    }
  }

  function handleDismissWorkspaceImport() {
    if (!importCandidate || !user?.id) return;
    markWorkspaceImportDismissed(user.id, importCandidate.fingerprint);
    setImportCandidate(null);
  }

  function updateCurrentSubject(updater: (record: WorkspaceSubjectState) => WorkspaceSubjectState) {
    setWorkspaceStorage((prev) => {
      const prevRecord = prev.subjects[subjectKey] ?? {};
      const nextRecord = sanitizeWorkspaceSubjectState(updater(prevRecord));
      const nextSubjects = { ...prev.subjects };

      if (!nextRecord) {
        delete nextSubjects[subjectKey];
      } else {
        const contextualRecord: WorkspaceSubjectState = {
          ...nextRecord,
          ...subjectContextRefs,
        };
        nextSubjects[subjectKey] = { ...contextualRecord, updatedAt: Date.now() };
      }

      return {
        ...prev,
        subjects: nextSubjects,
      };
    });
    emitWorkspaceSync({
      sourceId: syncSourceIdRef.current,
      subjectType: subject.subjectType,
      subjectId: subject.subjectId,
    });
  }

  function handleQueueToggle() {
    if (queuedForCurrent) {
      updateCurrentSubject((prev) => {
        const next = { ...prev };
        delete next.queue;
        return next;
      });
      return;
    }

    updateCurrentSubject((prev) => ({
      ...prev,
      queue: {
        queued: true,
        title,
        subtitle: subtitle || null,
        addedAt: Date.now(),
      },
    }));
  }

  function handleAddNote() {
    const text = noteDraft.trim();
    if (!text) return;

    updateCurrentSubject((prev) => ({
      ...prev,
      notes: [
        {
          id: createWorkspaceNoteId(),
          text,
          createdAt: Date.now(),
        },
        ...(prev.notes ?? []),
      ],
    }));
    setNoteDraft("");
  }

  function handleDeleteNote(noteId: string) {
    updateCurrentSubject((prev) => ({
      ...prev,
      notes: (prev.notes ?? []).filter((note) => note.id !== noteId),
    }));
  }

  function toggleLabel(label: string) {
    updateCurrentSubject((prev) => {
      const labels = sanitizeWorkspaceLabels(prev.labels);
      const nextLabels = labels.includes(label)
        ? labels.filter((value) => value !== label)
        : [...labels, label];
      return {
        ...prev,
        labels: nextLabels,
      };
    });
  }

  function setDecisionSentiment(sentiment: WorkspaceDecisionSentiment) {
    updateCurrentSubject((prev) => {
      const currentDecision = sanitizeWorkspaceDecision(prev.decision);
      const nextSentiment = currentDecision.sentiment === sentiment ? null : sentiment;
      return {
        ...prev,
        decision: {
          ...currentDecision,
          sentiment: nextSentiment,
        },
      };
    });
  }

  function toggleDecisionCheck(checkId: string) {
    updateCurrentSubject((prev) => {
      const currentDecision = sanitizeWorkspaceDecision(prev.decision);
      const checks = currentDecision.checks.includes(checkId)
        ? currentDecision.checks.filter((value) => value !== checkId)
        : [...currentDecision.checks, checkId];
      return {
        ...prev,
        decision: {
          ...currentDecision,
          checks,
        },
      };
    });
  }

  function setDecisionScore(score: number) {
    updateCurrentSubject((prev) => {
      const currentDecision = sanitizeWorkspaceDecision(prev.decision);
      return {
        ...prev,
        decision: {
          ...currentDecision,
          score: currentDecision.score === score ? null : score,
        },
      };
    });
  }

  useEffect(() => {
    return subscribeWorkspaceSync((detail) => {
      if (detail.sourceId && detail.sourceId === syncSourceIdRef.current) return;
      workspaceAdapter
        .loadAll()
        .then((snapshot) => {
          setWorkspaceStorage(sanitizeWorkspaceStorageSnapshot(snapshot));
          setWorkspaceHydrated(true);
          setHydratedAdapterKey(adapterKey);
        })
        .catch(() => {
          // Ignore refresh errors; current in-memory state remains usable.
        });
    });
  }, [adapterKey, workspaceAdapter]);

  return (
    <aside
      className={classNames(
        styles.sidebar,
        isExpanded ? styles.sidebarExpanded : styles.sidebarCollapsed,
      )}
    >
      <div className={styles.stickyShell}>
        {!isExpanded ? (
          <div className={styles.rail}>
            <button
              type="button"
              className={styles.railBtn}
              onClick={() => setIsExpanded(true)}
              aria-label="Open workspace"
            >
              <span className={styles.railTop}>
                <span className={styles.railIcon} aria-hidden="true">
                  <WorkspaceGlyph />
                </span>
                {workspaceSignalCount > 0 ? (
                  <span className={styles.railBadge}>{workspaceSignalCount}</span>
                ) : null}
              </span>
              <span className={styles.railLabel}>Workspace</span>
            </button>
          </div>
        ) : (
          <div className={styles.panel}>
            <header className={styles.header}>
              <div>
                <h3 className={styles.title}>Your Workspace</h3>
                <p className={styles.headerIntro}>
                  Keep queue items, notes, labels, and decisions for this {noteSubjectLabel} in one place.
                </p>
                <p className={styles.contextType}>{subjectTypeLabel}</p>
                <p className={styles.contextTitle}>{title}</p>
                {subtitle ? <p className={styles.contextMeta}>{subtitle}</p> : null}
                {contextSummary ? <p className={styles.contextSummary}>{contextSummary}</p> : null}
              </div>
              <button
                type="button"
                className={styles.toggleBtn}
                onClick={() => setIsExpanded(false)}
                aria-label="Collapse workspace"
              >
                {">"}
              </button>
            </header>

            <nav className={styles.nav} aria-label="Workspace sections">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={classNames(
                    styles.navBtn,
                    activeSection === item.id && styles.navBtnActive,
                  )}
                  aria-pressed={activeSection === item.id}
                  onClick={() => setActiveSection(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            <div className={styles.content}>
              {showImportPrompt ? (
                <section className={styles.importPrompt}>
                  <p className={styles.importTitle}>Import your saved workspace?</p>
                  <p className={styles.importBody}>
                    We found notes, labels, queue items, or decisions saved on this browser. Add them
                    to your account so they sync across devices.
                  </p>
                  <div className={styles.importActions}>
                    <button
                      type="button"
                      className={styles.primaryBtn}
                      onClick={handleImportWorkspace}
                      disabled={isImporting}
                    >
                      {isImporting ? "Importing..." : "Import"}
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryBtn}
                      onClick={handleDismissWorkspaceImport}
                      disabled={isImporting}
                    >
                      Not now
                    </button>
                  </div>
                  {importError ? <p className={styles.importError}>{importError}</p> : null}
                </section>
              ) : null}

              {adapterKey === "remote" && importStatus ? (
                <p className={styles.importSuccess}>{importStatus}</p>
              ) : null}

              <p className={styles.persistHint}>
                {workspaceAdapter.supportsCrossDeviceSync
                  ? "Synced to your account across devices."
                  : "Saved on this browser for quick return."}
              </p>
              {!isAuthenticated ? (
                <section className={styles.upgradePrompt}>
                  <p className={styles.upgradeTitle}>Sync this workspace across devices</p>
                  <p className={styles.upgradeBody}>
                    Create an account to keep your queue, notes, labels, and decisions on phone and
                    desktop.
                  </p>
                  <div className={styles.upgradeActions}>
                    <Link href="/signup" className={styles.upgradePrimaryLink}>
                      Sign up
                    </Link>
                    <Link href="/login" className={styles.upgradeSecondaryLink}>
                      Log in
                    </Link>
                  </div>
                </section>
              ) : null}

              {activeSection === "queue" ? (
                <section className={styles.section}>
                  <button type="button" className={styles.primaryBtn} onClick={handleQueueToggle}>
                    {queuedForCurrent ? "Remove from Queue" : "Add to Queue"}
                  </button>
                  {queueItems.length ? (
                    <ul className={styles.queueList}>
                      {queueItems.map((item) => {
                        const itemHref = buildWorkspaceSubjectHref(item.subjectType, item.subjectId);
                        return (
                          <li key={`${item.subjectType}:${item.subjectId}`} className={styles.queueItem}>
                            {itemHref ? (
                              <Link href={itemHref} className={styles.queueLink}>
                                <span className={styles.queueTitle}>{item.title}</span>
                                {item.subtitle ? <span className={styles.queueMeta}>{item.subtitle}</span> : null}
                                <span className={styles.queueMeta}>Added {formatShortDate(item.addedAt)}</span>
                              </Link>
                            ) : (
                              <>
                                <div className={styles.queueTitle}>{item.title}</div>
                                {item.subtitle ? <div className={styles.queueMeta}>{item.subtitle}</div> : null}
                                <div className={styles.queueMeta}>Added {formatShortDate(item.addedAt)}</div>
                              </>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className={styles.empty}>Queue is empty for this session.</p>
                  )}
                </section>
              ) : null}

              {activeSection === "notes" ? (
                <section className={styles.section}>
                  <textarea
                    className={styles.textarea}
                    rows={4}
                    value={noteDraft}
                    onChange={(event) => setNoteDraft(event.target.value)}
                    placeholder={`Capture what stood out about this ${noteSubjectLabel}...`}
                  />
                  <button
                    type="button"
                    className={styles.primaryBtn}
                    onClick={handleAddNote}
                    disabled={!noteDraft.trim()}
                  >
                    Add Note
                  </button>
                  {notesForCurrent.length ? (
                    <ul className={styles.noteList}>
                      {notesForCurrent.map((note) => (
                        <li key={note.id} className={styles.noteItem}>
                          <p className={styles.noteText}>{note.text}</p>
                          <div className={styles.noteRow}>
                            <span className={styles.noteMeta}>{formatShortDate(note.createdAt)}</span>
                            <button
                              type="button"
                              className={styles.inlineBtn}
                              onClick={() => handleDeleteNote(note.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className={styles.empty}>No notes yet for this {noteSubjectLabel}.</p>
                  )}
                </section>
              ) : null}

              {activeSection === "labels" ? (
                <section className={styles.section}>
                  <div className={styles.labelGrid}>
                    {LABEL_OPTIONS.map((label) => {
                      const isActive = selectedLabels.includes(label);
                      return (
                        <button
                          key={label}
                          type="button"
                          className={classNames(styles.labelChip, isActive && styles.labelChipActive)}
                          onClick={() => toggleLabel(label)}
                          aria-pressed={isActive}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <p className={styles.selectedLine}>
                    {selectedLabels.length
                      ? `Selected: ${selectedLabels.join(", ")}`
                      : "No labels selected yet."}
                  </p>
                </section>
              ) : null}

              {activeSection === "decision" ? (
                <section className={styles.section}>
                  <div className={styles.decisionGroup}>
                    <p className={styles.sectionLabel}>Overall Sentiment</p>
                    <div className={styles.sentimentGrid}>
                      {SENTIMENT_OPTIONS.map((option) => {
                        const isActive = decision.sentiment === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            className={classNames(
                              styles.sentimentBtn,
                              isActive && styles.sentimentBtnActive,
                            )}
                            aria-pressed={isActive}
                            onClick={() => setDecisionSentiment(option.value)}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className={styles.decisionGroup}>
                    <p className={styles.sectionLabel}>Quick Checklist</p>
                    <div className={styles.checkList}>
                      {subjectDecisionChecks.map((check) => {
                        const checked = decision.checks.includes(check.id);
                        return (
                          <button
                            key={check.id}
                            type="button"
                            className={classNames(styles.checkRow, checked && styles.checkRowActive)}
                            onClick={() => toggleDecisionCheck(check.id)}
                            aria-pressed={checked}
                          >
                            <span className={classNames(styles.checkBox, checked && styles.checkBoxActive)}>
                              {checked ? "x" : ""}
                            </span>
                            <span className={styles.checkText}>{check.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className={styles.decisionGroup}>
                    <p className={styles.sectionLabel}>Optional Score</p>
                    <div className={styles.stars}>
                      {[1, 2, 3, 4, 5].map((value) => {
                        const isActive = (decision.score ?? 0) >= value;
                        return (
                          <button
                            key={value}
                            type="button"
                            className={classNames(styles.starBtn, isActive && styles.starBtnActive)}
                            onClick={() => setDecisionScore(value)}
                            aria-label={`Set score to ${value}`}
                          >
                            *
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <p className={styles.selectedLine}>{decisionSummary}</p>
                </section>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

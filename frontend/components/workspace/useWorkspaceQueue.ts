"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../AuthProvider";
import { getWorkspaceAdapter } from "@/lib/workspace/getWorkspaceAdapter";
import { sanitizeWorkspaceSubjectState } from "@/lib/workspace/storage";
import {
  createWorkspaceSyncSourceId,
  emitWorkspaceSync,
  subscribeWorkspaceSync,
} from "@/lib/workspace/sync";
import type {
  WorkspaceSubjectContextRefs,
  WorkspaceSubjectState,
  WorkspaceSubjectType,
} from "@/lib/workspace/types";

type UseWorkspaceQueueOptions = {
  subjectType: WorkspaceSubjectType;
  subjectId: string;
  title: string;
  subtitle?: string | null;
  contextRefs?: WorkspaceSubjectContextRefs;
};

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

export function useWorkspaceQueue({
  subjectType,
  subjectId,
  title,
  subtitle,
  contextRefs,
}: UseWorkspaceQueueOptions) {
  const { user } = useAuth();
  const isAuthenticated = Boolean(user);
  const adapterKey = isAuthenticated ? "remote" : "local";
  const userId = typeof user?.id === "string" ? user.id : null;
  const workspaceAdapter = useMemo(
    () => getWorkspaceAdapter({ isAuthenticated, userId }),
    [isAuthenticated, userId],
  );
  const normalizedSubjectId = useMemo(() => {
    const trimmed = cleanOptionalString(subjectId);
    return trimmed || "";
  }, [subjectId]);
  const subjectContextRefs = useMemo(
    () => buildSubjectContextRefs(subjectType, normalizedSubjectId, contextRefs),
    [contextRefs, normalizedSubjectId, subjectType],
  );
  const syncSourceIdRef = useRef<string>(createWorkspaceSyncSourceId("queue"));

  const [subjectState, setSubjectState] = useState<WorkspaceSubjectState | null>(null);
  const [isPending, setIsPending] = useState(false);

  const reloadSubjectState = useCallback(async () => {
    if (!normalizedSubjectId) {
      setSubjectState(null);
      return;
    }

    try {
      const next = await workspaceAdapter.loadSubject(subjectType, normalizedSubjectId);
      setSubjectState(next ? sanitizeWorkspaceSubjectState(next) : null);
    } catch {
      setSubjectState(null);
    }
  }, [normalizedSubjectId, subjectType, workspaceAdapter]);

  useEffect(() => {
    let cancelled = false;

    if (!normalizedSubjectId) {
      setSubjectState(null);
      return () => {
        cancelled = true;
      };
    }

    reloadSubjectState().then(() => {
      if (cancelled) return;
    });

    return () => {
      cancelled = true;
    };
  }, [adapterKey, normalizedSubjectId, reloadSubjectState]);

  useEffect(() => {
    if (!normalizedSubjectId) return () => {};

    return subscribeWorkspaceSync((detail) => {
      if (detail.sourceId && detail.sourceId === syncSourceIdRef.current) return;
      if (detail.subjectType && detail.subjectType !== subjectType) return;
      if (detail.subjectId && detail.subjectId !== normalizedSubjectId) return;
      void reloadSubjectState();
    });
  }, [normalizedSubjectId, reloadSubjectState, subjectType]);

  const isQueued = Boolean(subjectState?.queue?.queued && subjectState?.queue?.title);

  const toggleQueue = useCallback(async () => {
    if (!normalizedSubjectId) return;
    if (isPending) return;

    setIsPending(true);
    try {
      const currentState =
        subjectState ??
        (await workspaceAdapter.loadSubject(subjectType, normalizedSubjectId)) ??
        {};
      const nextState: WorkspaceSubjectState = { ...currentState };

      if (currentState.queue?.queued && currentState.queue.title) {
        delete nextState.queue;
      } else {
        const normalizedTitle = cleanOptionalString(title) || "Saved item";
        nextState.queue = {
          queued: true,
          title: normalizedTitle,
          subtitle: cleanOptionalString(subtitle) || null,
          addedAt: Date.now(),
        };
      }

      Object.assign(nextState, subjectContextRefs);
      const sanitized = sanitizeWorkspaceSubjectState(nextState);

      if (!sanitized) {
        await workspaceAdapter.removeSubject(subjectType, normalizedSubjectId);
        setSubjectState(null);
        emitWorkspaceSync({
          sourceId: syncSourceIdRef.current,
          subjectType,
          subjectId: normalizedSubjectId,
        });
        return;
      }

      await workspaceAdapter.saveSubject(subjectType, normalizedSubjectId, sanitized);
      setSubjectState(sanitized);
      emitWorkspaceSync({
        sourceId: syncSourceIdRef.current,
        subjectType,
        subjectId: normalizedSubjectId,
      });
    } finally {
      setIsPending(false);
    }
  }, [
    isPending,
    normalizedSubjectId,
    subjectContextRefs,
    subjectState,
    subjectType,
    subtitle,
    title,
    workspaceAdapter,
  ]);

  return {
    isQueued,
    isPending,
    toggleQueue,
  };
}

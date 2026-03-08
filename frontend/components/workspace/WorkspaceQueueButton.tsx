"use client";

import type { WorkspaceSubjectContextRefs, WorkspaceSubjectType } from "@/lib/workspace/types";
import { useWorkspaceQueue } from "./useWorkspaceQueue";

type WorkspaceQueueButtonProps = {
  subjectType: WorkspaceSubjectType;
  subjectId: string;
  title: string;
  subtitle?: string | null;
  contextRefs?: WorkspaceSubjectContextRefs;
  className?: string;
  activeClassName?: string;
  queuedLabel?: string;
  idleLabel?: string;
};

function classNames(...names: Array<string | undefined | null | false>): string {
  return names.filter(Boolean).join(" ");
}

export default function WorkspaceQueueButton({
  subjectType,
  subjectId,
  title,
  subtitle,
  contextRefs,
  className,
  activeClassName,
  queuedLabel = "In Queue",
  idleLabel = "Queue",
}: WorkspaceQueueButtonProps) {
  const { isQueued, isPending, toggleQueue } = useWorkspaceQueue({
    subjectType,
    subjectId,
    title,
    subtitle,
    contextRefs,
  });

  return (
    <button
      type="button"
      className={classNames(className, isQueued && activeClassName)}
      aria-pressed={isQueued}
      aria-label={isQueued ? "Remove from queue" : "Add to queue"}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void toggleQueue();
      }}
      disabled={isPending}
    >
      {isPending ? "Saving..." : isQueued ? `\u2713 ${queuedLabel}` : `+ ${idleLabel}`}
    </button>
  );
}

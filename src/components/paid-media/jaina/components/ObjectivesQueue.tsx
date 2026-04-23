"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  CheckCircle2Icon,
  CircleIcon,
  ListChecksIcon,
  Loader2Icon,
  XCircleIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { JainaObjective } from "@/lib/jaina/schemas";

type ObjectivesQueueProps = {
  objectives: JainaObjective[];
  isStreaming: boolean;
};

function StatusIcon({ status }: { status: JainaObjective["status"] }) {
  return (
    <AnimatePresence mode="wait">
      {status === "completed" ? (
        <motion.span
          key="completed"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="shrink-0"
        >
          <CheckCircle2Icon className="size-3.5 text-emerald-500" aria-hidden="true" />
        </motion.span>
      ) : status === "in_progress" ? (
        <motion.span
          key="in_progress"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="shrink-0"
        >
          <Loader2Icon className="size-3.5 animate-spin text-blue-500" aria-hidden="true" />
        </motion.span>
      ) : status === "failed" ? (
        <motion.span
          key="failed"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="shrink-0"
        >
          <XCircleIcon className="size-3.5 text-destructive" aria-hidden="true" />
        </motion.span>
      ) : (
        <motion.span
          key="pending"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="shrink-0"
        >
          <CircleIcon className="size-3.5 text-muted-foreground/40" aria-hidden="true" />
        </motion.span>
      )}
    </AnimatePresence>
  );
}

export function ObjectivesQueue({ objectives, isStreaming }: ObjectivesQueueProps) {
  if (objectives.length === 0) return null;

  const completedCount = objectives.filter((o) => o.status === "completed").length;
  const total = objectives.length;

  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5 flex flex-col gap-1.5">
      {/* Header */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ListChecksIcon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="font-medium text-foreground/80">
          {total} objective{total !== 1 ? "s" : ""}
        </span>
        <span aria-hidden="true">·</span>
        <span>
          {completedCount}/{total} done
        </span>
        {isStreaming && (
          <>
            <span aria-hidden="true">·</span>
            <span className="ml-auto flex items-center gap-1 text-emerald-500 font-medium">
              <span
                className="inline-block size-1.5 rounded-full bg-emerald-500 animate-pulse"
                aria-hidden="true"
              />
              live
            </span>
          </>
        )}
      </div>

      {/* Objective list */}
      <ul className="flex flex-col gap-1" role="list">
        {objectives.map((objective) => (
          <li key={objective.id} className="flex items-start gap-2 py-0.5">
            <div className="mt-px flex h-4 items-center">
              <StatusIcon status={objective.status} />
            </div>
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "text-xs leading-snug",
                  objective.status === "completed" &&
                    "line-through text-muted-foreground opacity-60",
                  objective.status === "failed" && "line-through text-destructive"
                )}
              >
                {objective.title}
              </p>
              {objective.description ? (
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground/60">
                  {objective.description}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

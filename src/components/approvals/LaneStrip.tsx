"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useApprovalsStore } from "@/lib/approvals/store";
import type { RuleAction } from "@/lib/approvals/types";
import { actionTypeLabel, formatRelativeTime, scopeLabel } from "./formatters";
import { getActionIcon } from "./actionIcons";

type Props = {
  actions: RuleAction[];
  focusedId: string | null;
  onFocus: (id: string) => void;
};

const SPRING = { type: "spring" as const, stiffness: 300, damping: 30 };

export function LaneStrip({ actions, focusedId, onFocus }: Props) {
  const pendingDecisions = useApprovalsStore((s) => s.pendingDecisions);
  const reduceMotion = useReducedMotion();

  const focusedIndex = Math.max(
    0,
    actions.findIndex((a) => a.id === focusedId),
  );

  const advance = React.useCallback(
    (delta: number) => {
      if (!actions.length) return;
      const next = Math.max(0, Math.min(actions.length - 1, focusedIndex + delta));
      const id = actions[next]?.id;
      if (id) onFocus(id);
    },
    [actions, focusedIndex, onFocus],
  );

  React.useEffect(() => {
    function handler(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "j" || event.key === "ArrowRight") {
        event.preventDefault();
        advance(1);
      } else if (key === "k" || event.key === "ArrowLeft") {
        event.preventDefault();
        advance(-1);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [advance]);

  if (!actions.length) return null;

  const listVariants: Variants = reduceMotion
    ? {}
    : {
        visible: { transition: { staggerChildren: 0.04, delayChildren: 0.05 } },
      };

  const itemVariants: Variants = reduceMotion
    ? {}
    : {
        hidden: { opacity: 0, y: 6 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0, 0, 0.2, 1] } },
      };

  return (
    <div className="group/lane relative flex items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(
          "h-7 w-7 shrink-0 transition-opacity duration-150",
          "opacity-0 group-hover/lane:opacity-100 focus-visible:opacity-100",
        )}
        onClick={() => advance(-1)}
        disabled={focusedIndex <= 0}
        aria-label="Previous action"
        tabIndex={-1}
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
      </Button>

      <div className="relative flex-1 overflow-hidden">
        <motion.ul
          className="flex items-stretch gap-1.5 overflow-x-auto pb-1"
          role="list"
          initial="hidden"
          animate="visible"
          variants={listVariants}
        >
          <AnimatePresence initial={false}>
            {actions.map((action) => {
              const isFocused = action.id === focusedId;
              const optimistic = pendingDecisions[action.id];
              const Icon = getActionIcon(action.action_type);
              return (
                <motion.li
                  key={action.id}
                  layout={!reduceMotion}
                  variants={itemVariants}
                  exit={reduceMotion ? undefined : { opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
                  transition={SPRING}
                  className="shrink-0"
                >
                  <button
                    type="button"
                    onClick={() => onFocus(action.id)}
                    className={cn(
                      "flex h-14 w-44 flex-col items-start justify-between rounded-md border bg-card px-2.5 py-1.5 text-left",
                      "transition-colors duration-150",
                      "hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isFocused && "border-primary bg-accent/40",
                      optimistic && "opacity-40",
                    )}
                    aria-current={isFocused ? "true" : undefined}
                    aria-label={`${actionTypeLabel(action.action_type)} · ${scopeLabel(action)}`}
                  >
                    <div className="flex w-full items-center justify-between gap-1">
                      <span className="flex items-center gap-1.5 truncate text-[11px] font-medium uppercase tracking-wide text-foreground">
                        <Icon className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                        <span className="truncate">{actionTypeLabel(action.action_type)}</span>
                      </span>
                      <span className="font-data text-[10px] tabular-nums text-muted-foreground">
                        {formatRelativeTime(action.created_at)}
                      </span>
                    </div>
                    <div className="w-full truncate font-data text-[11px] text-muted-foreground">
                      {scopeLabel(action)}
                    </div>
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </motion.ul>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(
          "h-7 w-7 shrink-0 transition-opacity duration-150",
          "opacity-0 group-hover/lane:opacity-100 focus-visible:opacity-100",
        )}
        onClick={() => advance(1)}
        disabled={focusedIndex >= actions.length - 1}
        aria-label="Next action"
        tabIndex={-1}
      >
        <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
      </Button>

      <div className="ml-1 shrink-0 font-data text-xs tabular-nums text-muted-foreground">
        {focusedIndex + 1} / {actions.length}
      </div>
    </div>
  );
}

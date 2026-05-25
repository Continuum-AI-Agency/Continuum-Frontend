"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { useApprove, useReject } from "@/lib/approvals/queries";
import { useApprovalsStore } from "@/lib/approvals/store";
import type { RuleAction } from "@/lib/approvals/types";
import { actionTypeLabel } from "./formatters";
import { RejectDialog } from "./RejectDialog";

type DecisionActionsHandle = {
  approve: () => Promise<void>;
  openReject: () => void;
};

type Props = {
  action: RuleAction;
  brandId: string;
  onAdvance: () => void;
  bindGlobalKeys?: boolean;
};

export const DecisionActions = React.forwardRef<DecisionActionsHandle, Props>(
  function DecisionActions({ action, brandId, onAdvance, bindGlobalKeys = true }, ref) {
    const approve = useApprove(brandId);
    const reject = useReject(brandId);
    const markOptimistic = useApprovalsStore((s) => s.markOptimistic);
    const clearOptimistic = useApprovalsStore((s) => s.clearOptimistic);
    const optimistic = useApprovalsStore((s) => s.pendingDecisions[action.id]);
    const [rejectOpen, setRejectOpen] = React.useState(false);
    const reduceMotion = useReducedMotion();

    const busy = approve.isPending || reject.isPending || Boolean(optimistic);

    const runApprove = React.useCallback(async () => {
      if (busy) return;
      markOptimistic(action.id, "approve");
      onAdvance();
      try {
        const result = await approve.mutateAsync({ ruleActionId: action.id });
        if (!result.ok) {
          toast.error(`Approve failed · ${result.error ?? "Meta call rejected"}`);
        } else if (result.alreadyExecuted) {
          toast.info("Action was already executed.");
        } else {
          toast.success(`Approved · ${actionTypeLabel(action.action_type)}`);
        }
      } catch (err) {
        toast.error(`Approve failed · ${(err as Error).message}`);
      } finally {
        clearOptimistic(action.id);
      }
    }, [action, approve, busy, clearOptimistic, markOptimistic, onAdvance]);

    const runReject = React.useCallback(
      async (reason: string) => {
        markOptimistic(action.id, "reject");
        setRejectOpen(false);
        onAdvance();
        try {
          const result = await reject.mutateAsync({ ruleActionId: action.id, reason });
          if (!result.ok) {
            toast.error(`Reject failed · ${result.error ?? "Unknown error"}`);
          } else {
            toast.success(`Rejected · ${actionTypeLabel(action.action_type)}`);
          }
        } catch (err) {
          toast.error(`Reject failed · ${(err as Error).message}`);
        } finally {
          clearOptimistic(action.id);
        }
      },
      [action, clearOptimistic, markOptimistic, onAdvance, reject],
    );

    React.useImperativeHandle(
      ref,
      () => ({
        approve: runApprove,
        openReject: () => setRejectOpen(true),
      }),
      [runApprove],
    );

    React.useEffect(() => {
      if (!bindGlobalKeys) return;
      function handler(event: KeyboardEvent) {
        const target = event.target as HTMLElement | null;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        const key = event.key.toLowerCase();
        if (event.key === "Enter" || key === "a") {
          event.preventDefault();
          void runApprove();
        } else if (key === "r") {
          event.preventDefault();
          setRejectOpen(true);
        }
      }
      window.addEventListener("keydown", handler);
      return () => window.removeEventListener("keydown", handler);
    }, [bindGlobalKeys, runApprove]);

    return (
      <>
        <motion.button
          type="button"
          onClick={runApprove}
          disabled={busy}
          whileTap={reduceMotion || busy ? undefined : { scale: 0.97 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className={cn(
            buttonVariants({ size: "lg" }),
            "min-w-[10rem] gap-2",
          )}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
          ) : (
            <CheckCircle2 className="h-4 w-4" strokeWidth={1.5} />
          )}
          <span>Approve</span>
        </motion.button>

        <RejectDialog
          open={rejectOpen}
          onOpenChange={setRejectOpen}
          onConfirm={runReject}
          busy={reject.isPending}
          actionLabel={actionTypeLabel(action.action_type)}
        />
      </>
    );
  },
);

export type { DecisionActionsHandle };

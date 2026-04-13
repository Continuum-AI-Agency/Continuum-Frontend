"use client";

import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2Icon, CircleIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Plan,
  PlanContent,
  PlanDescription,
  PlanHeader,
  PlanTitle,
  PlanTrigger,
} from "@/components/ai-elements/plan";
import { stagger, listItem } from "@/components/ui/Motion";
import type { JainaPlan } from "../types";

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

type PlanSectionProps = {
  plan: JainaPlan;
  isStreaming: boolean;
  onPlanFeedback?: (payload: { planId: string; approved: boolean; reason?: string }) => void;
};

export function PlanSection({ plan, isStreaming, onPlanFeedback }: PlanSectionProps) {
  return (
    <Plan status={plan.status} isStreaming={isStreaming}>
      <PlanHeader>
        <PlanTitle>{plan.title}</PlanTitle>
        <PlanDescription>{plan.description}</PlanDescription>
        <PlanTrigger />
      </PlanHeader>
      <PlanContent>
        <motion.div className="space-y-4" initial="hidden" animate="visible" variants={stagger}>
          {plan.steps.map((step, index) => (
            <motion.div key={index} variants={listItem} className="flex items-start gap-3 text-sm">
              <div className="mt-0.5">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={step.status}
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.5, opacity: 0 }}
                    transition={{ duration: 0.15, ease: EASE_OUT_EXPO }}
                  >
                    {step.status === "completed" && <CheckCircle2Icon className="size-4 text-emerald-500" />}
                    {step.status === "in_progress" && <Loader2Icon className="size-4 animate-spin text-indigo-500" />}
                    {step.status === "pending" && <CircleIcon className="size-4 text-muted-foreground/30" />}
                  </motion.div>
                </AnimatePresence>
              </div>
              <div>
                <div className="font-medium text-foreground">{step.title}</div>
                {step.description ? (
                  <div className="text-xs text-muted-foreground">
                    {step.description}
                  </div>
                ) : null}
              </div>
            </motion.div>
          ))}
          {plan.status === "awaiting_approval" ? (
            <div className="flex justify-end gap-2 pt-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  onPlanFeedback?.({
                    planId: plan.id,
                    approved: false,
                    reason: "Rejected by user",
                  })
                }
              >
                Reject
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  onPlanFeedback?.({
                    planId: plan.id,
                    approved: true,
                    reason: "Proceed",
                  })
                }
              >
                Approve Plan
              </Button>
            </div>
          ) : null}
        </motion.div>
      </PlanContent>
    </Plan>
  );
}

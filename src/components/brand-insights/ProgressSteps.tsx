"use client";

import { Check, Circle, X } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export interface Step {
  id?: string;
  label?: string;
  status?: "completed" | "current" | "pending";
}

type ProgressStepsProps = {
  data?: {
    steps?: Step[];
  };
  progressPercent?: number;
};

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function ProgressSteps({ data, progressPercent }: ProgressStepsProps) {
  const steps = data?.steps ?? [];
  if (steps.length === 0) return null;

  const derivedPercent = (() => {
    if (typeof progressPercent === "number") return clampPercent(progressPercent);
    const completedCount = steps.filter((step) => step.status === "completed").length;
    const hasCurrent = steps.some((step) => step.status === "current");
    const partial = hasCurrent ? 0.5 : 0;
    return clampPercent(((completedCount + partial) / steps.length) * 100);
  })();

  return (
    <div className="w-full space-y-2">
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex min-w-full items-center gap-2 whitespace-nowrap">
          {steps.map((step, index) => {
            const stepStatus = step.status ?? "pending";
            const isCurrent = stepStatus === "current";
            const isCompleted = stepStatus === "completed";
            const isCompletedTerminal = isCompleted && step.id === "completed";
            const isFailedTerminal = (isCurrent || isCompleted) && step.id === "failed";

            return (
              <div key={step.id ?? `${step.label ?? "step"}-${index}`} className="flex items-center gap-2">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs",
                      isCompleted && !isCompletedTerminal && !isFailedTerminal && "bg-foreground text-background",
                      isCurrent && "border-2 border-foreground",
                      stepStatus === "pending" && "border border-muted-foreground/40 text-muted-foreground",
                      isCompletedTerminal && "bg-emerald-600 text-white",
                      isFailedTerminal && "bg-destructive text-destructive-foreground"
                    )}
                  >
                    {isFailedTerminal ? (
                      <X className="h-3 w-3" />
                    ) : isCompleted ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Circle className="h-2.5 w-2.5" />
                    )}
                  </div>
                  {step.label && (
                    <span
                      className={cn(
                        "text-xs",
                        isCurrent && "font-semibold text-foreground",
                        stepStatus === "pending" && "text-muted-foreground"
                      )}
                    >
                      {step.label}
                    </span>
                  )}
                </div>
                {index < steps.length - 1 && <div className="h-px w-4 bg-border" />}
              </div>
            );
          })}
        </div>
      </div>
      <div className="space-y-1">
        <Progress value={derivedPercent} className="h-2" />
        <p className="text-muted-foreground text-[11px] font-medium tabular-nums">{Math.round(derivedPercent)}%</p>
      </div>
    </div>
  );
}

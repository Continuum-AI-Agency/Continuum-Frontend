import { Check } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import type { ShellPillId } from "./OnboardingShell";

export type StepperState = "done" | "active" | "pending";

type StepperStep = { id: ShellPillId; label: string; description: string; state: StepperState };

type OnboardingStepperProps = {
  steps: StepperStep[];
  onStepClick?: (id: ShellPillId) => void;
};

export function OnboardingStepper({ steps, onStepClick }: OnboardingStepperProps) {
  return (
    <ol className="flex w-full items-stretch justify-center gap-0">
      {steps.map((step, index) => {
        const interactive = step.state !== "pending" && onStepClick;
        const isLast = index === steps.length - 1;
        return (
          <li key={step.id} className="flex flex-1 items-center gap-3">
            <button
              type="button"
              disabled={!interactive}
              onClick={interactive ? () => onStepClick(step.id) : undefined}
              className={cn(
                "group flex flex-1 items-center gap-3 text-left transition-opacity",
                !interactive && "cursor-default",
                interactive && "hover:opacity-80"
              )}
            >
              <motion.span
                layout
                transition={{ type: "spring", stiffness: 380, damping: 28 }}
                className={cn(
                  "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold",
                  step.state === "done" && "bg-primary text-primary-foreground",
                  step.state === "active" &&
                    "bg-[var(--cs-violet,#5a39ff)] text-white ring-4 ring-[color-mix(in_srgb,var(--cs-violet,#5a39ff)_18%,transparent)]",
                  step.state === "pending" && "border border-border bg-white text-muted-foreground dark:bg-card"
                )}
              >
                {step.state === "done" ? (
                  <motion.span
                    initial={{ scale: 0, rotate: -90 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 460, damping: 22 }}
                  >
                    <Check className="h-4 w-4" weight="bold" />
                  </motion.span>
                ) : (
                  <motion.span
                    key={`${step.id}-${step.state}`}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2 }}
                  >
                    {index + 1}
                  </motion.span>
                )}
              </motion.span>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "truncate text-[13px] font-semibold leading-tight transition-colors",
                    step.state === "active" && "text-foreground",
                    step.state === "done" && "text-foreground",
                    step.state === "pending" && "text-muted-foreground"
                  )}
                >
                  {step.label}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{step.description}</p>
              </div>
            </button>
            {isLast ? null : (
              <div className="relative h-px flex-1 overflow-hidden bg-border">
                <motion.span
                  initial={false}
                  animate={{ scaleX: step.state === "done" ? 1 : 0 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  style={{ transformOrigin: "left center" }}
                  className="absolute inset-0 bg-primary"
                />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

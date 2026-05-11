import { AnimatePresence, motion } from "motion/react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useProcessingChoreography } from "./useProcessingChoreography";

export function DnaProgressPill() {
  const { steps, progressPercent, allComplete, latestSparkLabel } = useProcessingChoreography();
  const inFlight = steps.find((s) => s.status === "running");
  const headlineLabel = allComplete
    ? "Your Brand DNA is ready"
    : latestSparkLabel
      ? latestSparkLabel
      : inFlight
        ? inFlight.label
        : "Preparing your Brand DNA…";

  return (
    <Card
      className={cn(
        "flex w-full items-center gap-3 border-[#e5e7eb] px-4 py-3 shadow-sm transition-colors",
        allComplete && "border-[color-mix(in_srgb,var(--ob-teal)_30%,transparent)] bg-[color-mix(in_srgb,var(--ob-teal)_4%,white)]"
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          allComplete ? "bg-[var(--ob-teal)] text-white" : "bg-[color-mix(in_srgb,var(--ob-violet)_10%,transparent)] text-[var(--ob-violet)]"
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          {allComplete ? (
            <motion.span
              key="check"
              initial={{ scale: 0, rotate: -90 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 460, damping: 22 }}
            >
              <Check className="h-4 w-4" />
            </motion.span>
          ) : (
            <motion.span
              key="loader"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, rotate: 360 }}
              exit={{ opacity: 0 }}
              transition={{
                opacity: { duration: 0.2 },
                rotate: { duration: 1.4, ease: "linear", repeat: Infinity },
              }}
            >
              <Loader2 className="h-4 w-4" />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p
            className={cn(
              "truncate text-[12px] font-semibold",
              allComplete ? "text-[var(--ob-teal)]" : "text-[#0b1220]"
            )}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={headlineLabel}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18 }}
                className="inline-flex items-center gap-1.5"
              >
                {allComplete ? <Sparkles className="h-3 w-3" /> : null}
                {headlineLabel}
              </motion.span>
            </AnimatePresence>
          </p>
          <span className="shrink-0 text-[10px] font-semibold tabular-nums text-[#94a3b8]">
            {Math.round(progressPercent)}%
          </span>
        </div>
        <Progress value={progressPercent} className="mt-1.5 h-1" />
      </div>
    </Card>
  );
}

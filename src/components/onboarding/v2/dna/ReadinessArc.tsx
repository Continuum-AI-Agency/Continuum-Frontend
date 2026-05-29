"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

type ReadinessArcProps = {
  score: number | null | undefined;
  size?: number;
  strokeWidth?: number;
  className?: string;
};

function toneFor(score: number | null | undefined): {
  stroke: string;
  text: string;
} {
  if (score == null) return { stroke: "stroke-muted", text: "text-muted-foreground" };
  if (score >= 70) return { stroke: "stroke-[var(--cs-success,#53a88a)]", text: "text-[var(--cs-success,#53a88a)]" };
  if (score >= 40) return { stroke: "stroke-[var(--cs-warning,#cb8e00)]", text: "text-[var(--cs-warning,#cb8e00)]" };
  return { stroke: "stroke-[var(--cs-error,#ef4444)]", text: "text-[var(--cs-error,#ef4444)]" };
}

export function ReadinessArc({ score, size = 96, strokeWidth = 8, className }: ReadinessArcProps) {
  const safeScore = typeof score === "number" ? Math.max(0, Math.min(100, score)) : null;
  const tone = toneFor(safeScore);
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const progress = safeScore == null ? 0 : safeScore / 100;

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-border"
        />
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          pathLength={1}
          className={tone.stroke}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: progress }}
          transition={{ type: "spring", stiffness: 80, damping: 18 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("text-[24px] font-bold font-mono tabular-nums leading-none", tone.text)}>
          {safeScore == null ? "—" : Math.round(safeScore)}
        </span>
        <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
          / 100
        </span>
      </div>
    </div>
  );
}

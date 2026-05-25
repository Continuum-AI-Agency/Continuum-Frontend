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
  if (score == null) return { stroke: "stroke-slate-300", text: "text-[#94a3b8]" };
  if (score >= 70) return { stroke: "stroke-emerald-500", text: "text-emerald-600" };
  if (score >= 40) return { stroke: "stroke-amber-500", text: "text-amber-600" };
  return { stroke: "stroke-rose-500", text: "text-rose-600" };
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
          className="stroke-slate-200"
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
        <span className={cn("text-[24px] font-bold tabular-nums leading-none", tone.text)}>
          {safeScore == null ? "—" : Math.round(safeScore)}
        </span>
        <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#94a3b8]">
          / 100
        </span>
      </div>
    </div>
  );
}

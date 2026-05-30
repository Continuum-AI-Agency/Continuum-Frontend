"use client";

import { useEffect, useRef, useState } from "react";

import { TRENDS_STAGE_PROGRESS } from "@continuum/contracts";

// Sorted, de-duped progress anchors the backend emits (1, 8, 34, ... 100).
const PROGRESS_ANCHORS = Array.from(new Set(Object.values(TRENDS_STAGE_PROGRESS))).sort((a, b) => a - b);

// When the backend gives no remaining_ms (early frames), pace the creep across a
// single stage gap over roughly this long so the bar keeps moving believably.
const STAGE_CREEP_MS = 4000;

const NOMINAL_TOTAL_MS = 90000;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Upper bound the display may creep to before the next real checkpoint arrives:
 * just under the next anchor above `target`, so we never claim a stage is done
 * before the backend says so. Terminal/last anchor creeps straight to 100.
 */
export function ceilingForTarget(target: number): number {
  const next = PROGRESS_ANCHORS.find((anchor) => anchor > target);
  if (next === undefined) return 100;
  return Math.max(target, next - 1);
}

/**
 * Pure stepping function (exported for tests). Advances the displayed percent
 * monotonically toward `ceiling`, paced by the backend ETA when available.
 */
export function nextDisplayPercent(params: {
  current: number;
  target: number;
  ceiling: number;
  dtMs: number;
  remainingMs?: number;
}): number {
  const { current, target, ceiling, dtMs, remainingMs } = params;
  const base = Math.max(current, target);
  if (base >= ceiling) return Math.min(ceiling, 100);

  const speedPerMs =
    typeof remainingMs === "number" && remainingMs > 0
      ? (100 - base) / remainingMs
      : (ceiling - base) / STAGE_CREEP_MS;

  const step = Math.max(0, speedPerMs * Math.max(0, dtMs));
  return Math.min(ceiling, base + step);
}

type SmoothTrendProgressInput = {
  targetPercent: number;
  remainingMs?: number;
  isTerminal?: boolean;
};

/**
 * Smooths the discrete backend progress checkpoints into a continuously moving
 * bar and derives an ETA. Honors prefers-reduced-motion by snapping to the real
 * checkpoint values without the creep animation.
 */
export function useSmoothTrendProgress({
  targetPercent,
  remainingMs,
  isTerminal = false,
}: SmoothTrendProgressInput): { displayPercent: number; etaSeconds: number | null } {
  const [displayPercent, setDisplayPercent] = useState(targetPercent);
  const frameRef = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);
  const reducedMotion = prefersReducedMotion();

  useEffect(() => {
    if (isTerminal) {
      setDisplayPercent(targetPercent >= 100 ? 100 : targetPercent);
      return;
    }

    if (reducedMotion) {
      setDisplayPercent((current) => Math.max(current, targetPercent));
      return;
    }

    const ceiling = ceilingForTarget(targetPercent);

    const tick = (now: number) => {
      const last = lastTickRef.current ?? now;
      const dtMs = now - last;
      lastTickRef.current = now;

      setDisplayPercent((current) =>
        nextDisplayPercent({ current, target: targetPercent, ceiling, dtMs, remainingMs })
      );
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      lastTickRef.current = null;
    };
  }, [targetPercent, remainingMs, isTerminal, reducedMotion]);

  const etaSeconds = (() => {
    if (isTerminal) return 0;
    if (typeof remainingMs === "number" && remainingMs >= 0) {
      return Math.max(0, Math.round(remainingMs / 1000));
    }
    const fractionLeft = Math.max(0, 100 - displayPercent) / 100;
    return Math.round((fractionLeft * NOMINAL_TOTAL_MS) / 1000);
  })();

  return { displayPercent, etaSeconds };
}

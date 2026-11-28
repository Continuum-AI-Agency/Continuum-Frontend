'use client';

import { AnimatePresence, motion } from 'motion/react';
import { Pill, PillIndicator } from '@/components/kibo-ui/pill';

const RING_SIZE = 28;
const STROKE_WIDTH = 2.5;
const RADIUS = RING_SIZE / 2 - STROKE_WIDTH / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const labelVariants = {
  enter: { opacity: 0, y: 6 },
  center: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.15, ease: [0.25, 1, 0.5, 1] as const },
  },
  exit: {
    opacity: 0,
    y: -6,
    transition: { duration: 0.15, ease: [0.25, 1, 0.5, 1] as const },
  },
};

function clampPercent(v: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(v) ? v : 0));
}

type TrendGenerationProgressProps = {
  progressPercent: number;
  currentLabel: string;
  isError?: boolean;
  errorMessage?: string;
  etaSeconds?: number | null;
};

function formatEta(seconds: number): string {
  if (seconds <= 0) return 'almost done';
  if (seconds < 60) return `~${seconds}s left`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `~${minutes}m left` : `~${minutes}m ${rest}s left`;
}

/**
 * A Trends generation: a header (Trends · status) over the ring, stage and estimate.
 *
 * No elapsed time: the live generation state carries no start time (the SSE events have a
 * per-event `created_at`, and only the recent-runs read has `started_at`). No Stop, because
 * generations have no cancel path, and no Open, because this renders on the Trends tab itself.
 */
export function TrendGenerationProgress({
  progressPercent,
  currentLabel,
  isError = false,
  errorMessage,
  etaSeconds,
}: TrendGenerationProgressProps) {
  const pct = clampPercent(progressPercent);
  const showEta = !isError && typeof etaSeconds === 'number' && pct < 100;
  const offset = CIRCUMFERENCE * (1 - pct / 100);
  const center = RING_SIZE / 2;

  const finished = !isError && pct >= 100;

  return (
    <div className="flex w-full flex-col gap-1.5" data-testid="trend-generation-progress">
      <div className="flex items-center gap-2 text-xs" data-testid="trend-generation-header">
        <p className="min-w-0 flex-1 truncate text-muted-foreground">Trends</p>
        <Pill className="shrink-0">
          <PillIndicator
            variant={isError ? 'error' : finished ? 'success' : 'info'}
            pulse={!isError && !finished}
          />
          {isError ? 'Failed' : finished ? 'Done' : 'Generating'}
        </Pill>
      </div>
      <div className="flex h-9 w-full items-center gap-2.5 rounded-lg border border-border/50 bg-muted/30 px-3">
        <svg
          width={RING_SIZE}
          height={RING_SIZE}
          viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
          className="shrink-0"
          aria-hidden="true"
        >
          <circle
            cx={center}
            cy={center}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE_WIDTH}
            className="stroke-muted-foreground/20"
          />
          <circle
            cx={center}
            cy={center}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${center} ${center})`}
            style={{
              stroke: isError ? 'var(--destructive)' : 'var(--primary)',
              transition: 'stroke-dashoffset 600ms ease, stroke 300ms ease',
            }}
          />
        </svg>

        <div className="flex min-w-0 flex-1 items-center overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={isError ? '__error__' : currentLabel}
              variants={labelVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="truncate text-xs font-medium text-foreground"
            >
              {isError ? (errorMessage ?? 'Generation failed') : currentLabel}
            </motion.span>
          </AnimatePresence>
        </div>

        {showEta && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground/80">
            {formatEta(etaSeconds as number)}
          </span>
        )}

        {!isError && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {Math.round(pct)}%
          </span>
        )}
      </div>
    </div>
  );
}

'use client';

// Shared pieces for the agent-ui cards: the full-bleed stat band, rolling figures, the
// transform-only bar with an optional tooltip, a score ring and model initials.

import type { ReactNode } from 'react';
import { NumberFlowValue } from '@/components/ui/number-flow-value';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type Stat = { label: string; value: ReactNode; hint?: ReactNode; danger?: boolean };

/** A hairline band of figures spanning the card edge to edge — structure from dividers, not boxes. */
export function StatBand({ stats, className }: { stats: Stat[]; className?: string }) {
  return (
    <dl
      className={cn('grid divide-x divide-border/60 border-y border-border/60', className)}
      style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}
    >
      {stats.map((stat) => (
        <div key={stat.label} className="flex min-w-0 flex-col gap-0.5 px-4 py-2.5">
          <dt className="truncate text-3xs font-medium uppercase tracking-wide text-muted-foreground">
            {stat.label}
          </dt>
          <dd
            className={cn(
              'truncate font-mono text-sm font-semibold tabular-nums',
              stat.danger && 'text-destructive',
            )}
          >
            {stat.value}
          </dd>
          {stat.hint && <dd className="truncate text-3xs text-muted-foreground">{stat.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}

export function RollingUsd({ value }: { value: number }) {
  const digits = value > 0 && value < 0.01 ? 4 : 2;
  return (
    <NumberFlowValue
      value={value}
      format={{
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }}
    />
  );
}

export function RollingTokens({ value }: { value: number }) {
  return (
    <NumberFlowValue value={value} format={{ notation: 'compact', maximumFractionDigits: 1 }} />
  );
}

/** A bar from `from` to `from + share` of its track, moved by transform only so it glides. The
 *  scaled bar itself is the tooltip target, so hovering the empty track shows nothing. */
export function SpanBar({
  from,
  share,
  className,
  tooltip,
}: {
  from: number;
  share: number;
  className?: string;
  tooltip?: ReactNode;
}) {
  const bar = (
    <span
      className={cn(
        'absolute inset-y-0 left-0 w-full origin-left rounded-[3px] transition-transform duration-300 ease-out motion-reduce:transition-none',
        className,
      )}
      style={{ transform: `scaleX(${Math.max(share, 0.004)})` }}
    />
  );
  return (
    <span
      aria-hidden={!tooltip}
      className="absolute inset-0 transition-transform duration-300 ease-out motion-reduce:transition-none"
      style={{ transform: `translateX(${from * 100}%)` }}
    >
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger render={bar} />
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      ) : (
        bar
      )}
    </span>
  );
}

/** Label/value rows for a tooltip or hover card. */
export function DetailRows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-2xs">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="opacity-70">{label}</dt>
          <dd className="text-right font-mono tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const RING_R = 15;
const RING_C = 2 * Math.PI * RING_R;

/** A 0–1 score as a ring with its percentage in the middle. */
export function ScoreRing({ score, emphasis = false }: { score: number; emphasis?: boolean }) {
  const pct = Math.round(Math.min(1, Math.max(0, score)) * 100);
  return (
    <span
      className="relative grid size-10 shrink-0 place-items-center"
      role="img"
      aria-label={`Score ${pct}`}
    >
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="18" cy="18" r={RING_R} fill="none" strokeWidth="3" className="stroke-muted" />
        <circle
          cx="18"
          cy="18"
          r={RING_R}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={RING_C}
          strokeDashoffset={RING_C * (1 - pct / 100)}
          className={cn(
            'transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none',
            emphasis ? 'stroke-primary' : 'stroke-muted-foreground/50',
          )}
        />
      </svg>
      <span
        className={cn('font-mono text-2xs font-semibold tabular-nums', emphasis && 'text-primary')}
      >
        {pct}
      </span>
    </span>
  );
}

/** "Veo 3.1" → "V3", "Kling 2.5" → "K2", "Founder story" → "FS". */
export function initials(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

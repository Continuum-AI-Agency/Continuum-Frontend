// TUFFUI (https://tuffui.com) · MIT License · Copyright (c) 2026 TUFFUI contributors
// Free to use. If it helps you, you can support it: https://ko-fi.com/yurigokoryan
'use client';

import { ArrowDownRight, ArrowUpRight, Minus } from '@phosphor-icons/react';
import { MotionConfig, motion } from 'motion/react';
import { useId } from 'react';
import { ProgressBar } from '@/components/ui/progress-bar';
import { RollingNumber } from '@/components/ui/rolling-number';
import { StatusPill } from '@/components/ui/status-pill';
import { Panel, Shell, ShellHeader } from '@/components/ui/surface';
import { EASE_IN_OUT, EASE_OUT } from '@/lib/motion-tokens';
import { cn } from '@/lib/utils';

export type Stat = {
  id: string;
  label: string;
  /** Preformatted value, e.g. "$48.2k" or "1,204". Rolls when it changes. */
  value: string;
  /** Change vs. the previous period, in percent. */
  delta?: number;
  /** Whether a rise is good (revenue) or bad (latency, churn). */
  higherIsBetter?: boolean;
  /** Recent values, oldest first, for the sparkline. */
  trend?: number[];
  /** Progress toward a target, 0–1, with its label (e.g. "Goal $60k"). */
  goal?: { ratio: number; label: string };
  hint?: string;
  /** Overrides the tone derived from `delta` and `higherIsBetter`, e.g. a report's own severity. */
  tone?: StatTone;
  /** Pill text when there is no `delta`, e.g. "risk". */
  status?: string;
};

export type StatTone = 'positive' | 'negative' | 'neutral' | 'warning';

export type StatGridProps = {
  data: Stat[];
  title?: string;
  subtitle?: string;
  /** Show sparklines when stats carry a trend. */
  sparklines?: boolean;
  onSelect?: (stat: Stat) => void;
  className?: string;
};

export function StatGrid({
  data,
  title,
  subtitle,
  sparklines = true,
  onSelect,
  className,
}: StatGridProps) {
  return (
    <MotionConfig reducedMotion="user">
      <Shell className={cn('max-w-2xl', className)}>
        {title && <ShellHeader title={title} subtitle={subtitle} />}
        <div
          className={cn(
            'grid gap-1.5',
            data.length > 2 ? 'grid-cols-1 @xs:grid-cols-2' : 'grid-cols-1 @md:grid-cols-2',
          )}
        >
          {data.map((stat, i) => (
            <StatCard
              key={stat.id}
              stat={stat}
              index={i}
              sparkline={sparklines}
              onSelect={onSelect}
            />
          ))}
        </div>
      </Shell>
    </MotionConfig>
  );
}

function StatCard({
  stat,
  index,
  sparkline,
  onSelect,
}: {
  stat: Stat;
  index: number;
  sparkline: boolean;
  onSelect?: (stat: Stat) => void;
}) {
  const { delta, higherIsBetter = true } = stat;
  const flat = delta === undefined || Math.abs(delta) < 0.05;
  const good = !flat && delta > 0 === higherIsBetter;
  const tone: StatTone = stat.tone ?? (flat ? 'neutral' : good ? 'positive' : 'negative');
  const DeltaIcon = flat ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;
  const Root = onSelect ? motion.button : motion.div;

  return (
    <Root
      type={onSelect ? 'button' : undefined}
      onClick={onSelect ? () => onSelect(stat) : undefined}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: EASE_OUT, delay: index * 0.05 }}
      className={cn(
        'text-left',
        onSelect && 'rounded-2xl transition-[scale] duration-150 ease-out active:scale-[0.98]',
      )}
    >
      <Panel className="flex h-full flex-col gap-2 p-4">
        <p className="text-[0.8125rem] text-muted-foreground">{stat.label}</p>
        <div className="flex items-end justify-between gap-3">
          <RollingNumber
            value={stat.value}
            className="text-[1.625rem] leading-none font-medium tracking-tight"
          />
          {sparkline && stat.trend && stat.trend.length > 1 && (
            <Sparkline values={stat.trend} tone={tone} />
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {delta !== undefined ? (
            <StatusPill size="sm" tone={tone} icon={DeltaIcon} iconWeight="bold">
              <RollingNumber value={`${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`} />
              <span className="sr-only">{flat ? 'flat' : good ? ', better' : ', worse'}</span>
            </StatusPill>
          ) : (
            stat.status && (
              <StatusPill size="sm" tone={tone}>
                {stat.status}
              </StatusPill>
            )
          )}
          {stat.hint && <span className="truncate">{stat.hint}</span>}
        </div>
        {stat.goal && (
          <div className="mt-1 flex flex-col gap-1.5">
            <ProgressBar
              value={stat.goal.ratio}
              max={1}
              size="sm"
              striped
              tone={stat.goal.ratio >= 1 ? 'positive' : 'brand'}
              label={`${stat.label}: ${stat.goal.label}`}
              valueText={`${Math.round(stat.goal.ratio * 100)}% of ${stat.goal.label}`}
            />
            <p className="flex justify-between text-xs text-muted-foreground">
              <span>{stat.goal.label}</span>
              <span className="tabular-nums">{Math.round(stat.goal.ratio * 100)}%</span>
            </p>
          </div>
        )}
      </Panel>
    </Root>
  );
}

const toneColor: Record<StatTone, string> = {
  positive: 'var(--positive)',
  negative: 'var(--negative)',
  neutral: 'var(--muted-foreground)',
  warning: 'var(--warning)',
};

/** Tiny trend line; the last point is marked so "now" is easy to find. */
function Sparkline({ values, tone }: { values: number[]; tone: StatTone }) {
  const id = useId().replace(/:/g, '');
  const w = 72;
  const h = 28;
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const pts = values.map(
    (v, i) =>
      [(i / (values.length - 1)) * (w - 4) + 2, h - 3 - ((v - min) / span) * (h - 6)] as const,
  );
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  const [lx, ly] = pts[pts.length - 1];
  const color = toneColor[tone];

  return (
    <svg width={w} height={h} aria-hidden="true" className="shrink-0 overflow-visible">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.22" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path
        animate={{ d: `${d}L${pts.at(-1)![0]},${h}L${pts[0][0]},${h}Z` }}
        transition={{ duration: 0.4, ease: EASE_IN_OUT }}
        fill={`url(#${id})`}
      />
      <motion.path
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1, d }}
        transition={{
          pathLength: { duration: 0.7, ease: EASE_OUT },
          d: { duration: 0.4, ease: EASE_IN_OUT },
        }}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <motion.circle
        animate={{ cx: lx, cy: ly }}
        transition={{ duration: 0.4, ease: EASE_IN_OUT }}
        r={2.5}
        fill={color}
      />
    </svg>
  );
}

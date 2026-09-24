'use client';

// Brand readiness as a bklit radar. Every mark is computed from the scorer's
// output: the solid polygon is the current score per dimension, the dashed ghost
// is `reachable` (the shape if the next moves land), the hub ring is mean
// evidence coverage, and an axis the scorer could not answer is a hatched spoke
// with no dot — never a confident zero.

import { motion, useReducedMotion } from 'motion/react';
import { useId } from 'react';
import { RadarArea } from '@/components/charts/radar-area';
import { RadarChart } from '@/components/charts/radar-chart';
import { useRadarStable } from '@/components/charts/radar-context';
import { RadarGrid } from '@/components/charts/radar-grid';
import type { ReadinessAnalysis, ReadinessDimension } from '@/lib/onboarding/agentClient';
import { cn } from '@/lib/utils';
import {
  type AxisConfidence,
  axisConfidence,
  DIMENSION_DISPLAY_ORDER,
  DIMENSION_LABELS,
  meanCoverage,
} from './utils';

// px: room outside the rings for the axis labels, and where the labels anchor.
const MARGIN = 76;
const LABEL_GAP = 12;
// The hub keeps the centre free for the overall score; 0 sits on its edge.
const HUB_RATIO = 0.3;

export type RadarAxis = {
  key: ReadinessDimension;
  label: string;
  score: number;
  reachable: number | null;
  confidence: AxisConfidence;
};

export function radarAxes(readiness: ReadinessAnalysis): RadarAxis[] {
  return DIMENSION_DISPLAY_ORDER.map((key) => {
    const dim = readiness.dimensions[key];
    return {
      key,
      label: DIMENSION_LABELS[key],
      score: dim.score,
      reachable: dim.reachable ?? null,
      confidence: axisConfidence(dim),
    };
  });
}

const METRICS = DIMENSION_DISPLAY_ORDER.map((key) => ({ key, label: DIMENSION_LABELS[key] }));
const noop = () => {};

type Props = {
  /** null draws the empty frame only: loading, not scored, or failed. No number anywhere. */
  readiness: ReadinessAnalysis | null;
  pending?: boolean;
  activeDimension: ReadinessDimension | null;
  pinnedDimension: ReadinessDimension | null;
  ledgerId?: string;
  onPreview: (dimension: ReadinessDimension | null) => void;
  onSelect: (dimension: ReadinessDimension) => void;
};

export function ReadinessRadarChart({
  readiness,
  pending = false,
  activeDimension,
  pinnedDimension,
  ledgerId,
  onPreview,
  onSelect,
}: Props) {
  const reduceMotion = useReducedMotion() ?? false;
  const axes = readiness ? radarAxes(readiness) : null;
  const unknownKeys = new Set(axes?.filter((a) => a.confidence === 'unknown').map((a) => a.key));
  const measuredKeys = new Set(axes?.filter((a) => a.confidence === 'measured').map((a) => a.key));
  const hasReachable = axes?.some((a) => a.reachable !== null) ?? false;
  const anyScored = axes !== null && unknownKeys.size < axes.length;
  const coverage = readiness ? meanCoverage(readiness) : null;

  const current = axes
    ? {
        label: 'Current',
        color: 'var(--primary)',
        values: Object.fromEntries(axes.map((a) => [a.key, a.score])),
      }
    : null;
  const reachable =
    axes && hasReachable
      ? {
          label: 'Reachable',
          color: 'var(--muted-foreground)',
          values: Object.fromEntries(axes.map((a) => [a.key, a.reachable ?? a.score])),
        }
      : null;
  // Ghost first so the measured polygon draws on top of it.
  const data = [reachable, current].filter((s) => s !== null);

  return (
    <div
      className="relative mx-auto aspect-square w-full max-w-[36rem]"
      data-testid="readiness-radar"
    >
      <RadarChart
        animate={!reduceMotion}
        data={data}
        enterTransition={reduceMotion ? { duration: 0 } : undefined}
        hoveredIndex={null}
        innerRadiusRatio={HUB_RATIO}
        levels={4}
        margin={MARGIN}
        metrics={METRICS}
        onHoverChange={noop}
        className={cn(pending && 'motion-safe:animate-pulse')}
      >
        <RadarGrid showLabels={false} />
        <Spokes axes={axes} activeDimension={activeDimension} />
        {reachable ? (
          <RadarArea
            fillOpacity={0}
            index={0}
            showGlow={false}
            showPoints={false}
            skipKeys={unknownKeys}
            strokeDasharray="5 4"
          />
        ) : null}
        {current ? (
          <RadarArea
            index={data.length - 1}
            pointKeys={measuredKeys}
            showGlow={false}
            skipKeys={unknownKeys}
          />
        ) : null}
        <CoverageHub coverage={coverage} />
        <HitSectors onPreview={onPreview} onSelect={onSelect} />
      </RadarChart>

      {readiness && anyScored ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-2xl font-semibold leading-none tabular-nums text-foreground sm:text-3xl"
            data-testid="readiness-overall"
          >
            {Math.round(readiness.overall_score)}
          </span>
          <span className="sr-only">out of 100 overall readiness</span>
        </div>
      ) : null}

      {METRICS.map((metric, index) => {
        const axis = axes?.[index] ?? null;
        return (
          <AxisLabel
            active={activeDimension === metric.key}
            axis={axis}
            index={index}
            key={metric.key}
            label={metric.label}
            ledgerId={ledgerId}
            metricKey={metric.key}
            onPreview={onPreview}
            onSelect={onSelect}
            pinned={pinnedDimension === metric.key}
          />
        );
      })}
    </div>
  );
}

function angleOf(index: number): number {
  return (index * Math.PI * 2) / METRICS.length - Math.PI / 2;
}

function AxisLabel({
  axis,
  index,
  label,
  metricKey,
  active,
  pinned,
  ledgerId,
  onPreview,
  onSelect,
}: {
  axis: RadarAxis | null;
  index: number;
  label: string;
  metricKey: ReadinessDimension;
  active: boolean;
  pinned: boolean;
  ledgerId?: string;
  onPreview: (dimension: ReadinessDimension | null) => void;
  onSelect: (dimension: ReadinessDimension) => void;
}) {
  const angle = angleOf(index);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const inset = MARGIN - LABEL_GAP;
  // Anchor the label's near edge at the point just past the outer ring, so it
  // grows away from the chart at every angle.
  const tx = cos > 0.3 ? '0%' : cos < -0.3 ? '-100%' : '-50%';
  const ty = sin > 0.3 ? '0%' : sin < -0.3 ? '-100%' : '-50%';
  const align = cos > 0.3 ? 'text-left' : cos < -0.3 ? 'text-right' : 'text-center';
  const style = {
    left: `calc(50% + ${cos.toFixed(4)} * (50% - ${inset}px))`,
    top: `calc(50% + ${sin.toFixed(4)} * (50% - ${inset}px))`,
    transform: `translate(${tx}, ${ty})`,
  };

  const content = !axis ? null : axis.confidence === 'unknown' ? (
    <span className="block text-2xs text-muted-foreground">No evidence</span>
  ) : (
    <span className="block">
      <span
        className={cn(
          'text-sm font-semibold tabular-nums',
          axis.confidence === 'thin' ? 'text-muted-foreground' : 'text-foreground',
        )}
      >
        {Math.round(axis.score)}
      </span>
      {axis.reachable !== null && axis.reachable > axis.score ? (
        <span className="text-2xs tabular-nums text-muted-foreground">
          {' '}
          → {Math.round(axis.reachable)}
        </span>
      ) : null}
      {axis.confidence === 'thin' ? (
        <span className="block text-3xs text-muted-foreground">thin evidence</span>
      ) : null}
    </span>
  );

  const description = !axis
    ? label
    : axis.confidence === 'unknown'
      ? `${label}: no evidence to score`
      : `${label}: ${Math.round(axis.score)} of 100${axis.confidence === 'thin' ? ', thin evidence' : ''}`;

  return (
    <button
      type="button"
      aria-controls={axis ? ledgerId : undefined}
      aria-label={description}
      aria-pressed={axis ? pinned : undefined}
      className={cn(
        'absolute max-w-[5.25rem] rounded-md sm:max-w-[7rem] px-1.5 py-0.5 leading-tight outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50',
        align,
        axis ? 'cursor-pointer hover:bg-muted' : 'cursor-default',
        active && 'bg-muted',
      )}
      data-confidence={axis?.confidence}
      data-dimension={metricKey}
      data-testid="radar-axis"
      disabled={!axis}
      onBlur={() => onPreview(null)}
      onClick={() => axis && onSelect(metricKey)}
      onFocus={() => axis && onPreview(metricKey)}
      onPointerEnter={() => axis && onPreview(metricKey)}
      onPointerLeave={() => onPreview(null)}
      style={style}
    >
      <span
        className={cn(
          'block text-2xs font-medium sm:text-xs',
          active ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {label}
      </span>
      {content}
    </button>
  );
}

/** Measured spokes are hairlines; unanswerable ones are a dashed, hatched band. */
function Spokes({
  axes,
  activeDimension,
}: {
  axes: RadarAxis[] | null;
  activeDimension: ReadinessDimension | null;
}) {
  const { metrics, yScale, getAngle } = useRadarStable();
  const hatchId = useId();
  const inner = yScale(0);
  const outer = yScale(100);
  return (
    <g>
      <defs>
        <pattern
          height={5}
          id={hatchId}
          patternTransform="rotate(45)"
          patternUnits="userSpaceOnUse"
          width={5}
        >
          <line stroke="var(--muted-foreground)" strokeWidth={1.5} x1={0} x2={0} y1={0} y2={5} />
        </pattern>
      </defs>
      {metrics.map((metric, i) => {
        const degrees = (getAngle(i) * 180) / Math.PI;
        const axis = axes?.[i];
        const uncertain = axis ? axis.confidence !== 'measured' : false;
        const active = activeDimension === metric.key;
        return (
          <g
            data-hatched={uncertain || undefined}
            data-spoke={metric.key}
            key={metric.key}
            transform={`rotate(${degrees})`}
          >
            {uncertain ? (
              <rect
                fill={`url(#${hatchId})`}
                height={10}
                opacity={active ? 0.6 : 0.35}
                width={outer - inner}
                x={inner}
                y={-5}
              />
            ) : null}
            <line
              stroke={active ? 'var(--primary)' : 'var(--border)'}
              strokeDasharray={uncertain ? '3 3' : undefined}
              strokeWidth={active ? 1.5 : 1}
              x1={inner}
              x2={outer}
              y1={0}
              y2={0}
            />
          </g>
        );
      })}
    </g>
  );
}

/** The hub ring: its arc is the mean share of criteria the scorer could answer. */
function CoverageHub({ coverage }: { coverage: number | null }) {
  const { yScale } = useRadarStable();
  const reduceMotion = useReducedMotion();
  const r = yScale(0) - 5;
  if (r <= 0) return null;
  const circumference = 2 * Math.PI * r;
  return (
    <g data-coverage={coverage ?? undefined} data-testid="coverage-ring">
      <circle fill="none" r={r} stroke="var(--border)" strokeWidth={3} />
      {coverage !== null ? (
        <motion.circle
          animate={{ strokeDashoffset: circumference * (1 - coverage) }}
          fill="none"
          initial={{ strokeDashoffset: circumference }}
          r={r}
          stroke="var(--muted-foreground)"
          strokeDasharray={circumference}
          strokeLinecap="round"
          strokeWidth={3}
          transform="rotate(-90)"
          transition={{ duration: reduceMotion ? 0 : 0.7, ease: [0.16, 1, 0.3, 1] }}
        />
      ) : null}
    </g>
  );
}

/** Pointer targets: hovering anywhere in an axis's slice previews that dimension. */
function HitSectors({
  onPreview,
  onSelect,
}: {
  onPreview: (dimension: ReadinessDimension | null) => void;
  onSelect: (dimension: ReadinessDimension) => void;
}) {
  const { metrics, yScale, getAngle, data } = useRadarStable();
  if (data.length === 0) return null;
  const r = yScale(100) + LABEL_GAP;
  const half = Math.PI / metrics.length;
  return (
    <g onPointerLeave={() => onPreview(null)}>
      {metrics.map((metric, i) => {
        const a0 = getAngle(i) - half;
        const a1 = getAngle(i) + half;
        const d = `M 0 0 L ${r * Math.cos(a0)} ${r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${r * Math.cos(a1)} ${r * Math.sin(a1)} Z`;
        const key = metric.key as ReadinessDimension;
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: pointer shortcut only; the axis label buttons carry keyboard and screen-reader access
          <path
            className="cursor-pointer"
            d={d}
            fill="transparent"
            key={metric.key}
            onClick={() => onSelect(key)}
            onPointerEnter={() => onPreview(key)}
          />
        );
      })}
    </g>
  );
}

// TUFFUI (https://tuffui.com) · MIT License · Copyright (c) 2026 TUFFUI contributors
// Free to use. If it helps you, you can support it: https://ko-fi.com/yurigokoryan
'use client';

import { Polygon } from '@phosphor-icons/react';
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { Panel, Shell, ShellHeader } from '@/components/ui/surface';
import { EASE_OUT, enter, exit } from '@/lib/motion-tokens';
import { cn } from '@/lib/utils';

export type RadarSeries = {
  id: string;
  label: string;
  /** One value per axis, on the `0…max` scale. */
  values: number[];
  /** Any CSS color. Defaults to the brand color. */
  color?: string;
};

export type RadarMember = {
  id: string;
  /** Short label drawn in the tooltip and legend, e.g. initials. */
  label: string;
  /** Full name for screen readers. Defaults to `label`. */
  name?: string;
  /** One value per axis, on the `0…max` scale. */
  values: number[];
  /** Any CSS color. Defaults to a categorical palette. */
  color?: string;
};

export type RadarChartProps = {
  /** One label per axis, clockwise from the top. Five to eight read best. */
  axes: string[];
  /** Top of the scale; the outer ring. */
  max: number;
  /** The filled polygon, e.g. a team average. */
  series: RadarSeries;
  /** A dashed polygon to measure against, e.g. the bar for a level. */
  baseline?: { label: string; values: number[] };
  /** Individual values drawn as dots on each spoke, without polygons. */
  members?: RadarMember[];
  title: string;
  subtitle?: string;
  /** Number in the header and the line next to it. */
  headline?: { value: string; caption?: string };
  format?: (value: number) => string;
  onSelect?: (axis: number) => void;
  className?: string;
};

const GAP = 12;
const LINE = 16;
const PAD = 6;
const MAX_R = 124;
const MIN_R = 48;
const TIP = 196;
const palette = ['var(--brand)', '#1a9e8c', '#bf5af2', '#b8862b'];

const round = (n: number) => Math.round(n * 100) / 100;

// Rough text widths at 12px, so labels can be fitted before they render.
const sansW = (s: string) => s.length * 6.3;
const WRAP = 84;
const monoW = (s: string) => s.length * 7.3;

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  // null until measured: the chart draws once at its real width, so entrance
  // animations don't tween from a guessed size.
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width ?? 400, width !== null] as const;
}

/**
 * A polygon over a handful of axes on a fixed scale. One filled series, an
 * optional dashed bar to beat, and every member as a dot on each spoke — so
 * the average and the spread read at once.
 */
export function RadarChart({
  axes,
  max,
  series,
  baseline,
  members = [],
  title,
  subtitle,
  headline,
  format = (v) => v.toFixed(1),
  onSelect,
  className,
}: RadarChartProps) {
  const reduce = useReducedMotion();
  const id = useId();
  const [ref, width, measured] = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const [fromKeyboard, setFromKeyboard] = useState(false);

  const n = axes.length;
  const brand = series.color ?? 'var(--brand)';
  const people = members.map((m, i) => ({
    ...m,
    color: m.color ?? palette[i % palette.length],
  }));
  const angles = axes.map((_, i) => {
    const a = (i / Math.max(n, 1)) * 2 * Math.PI;
    return { dx: Math.sin(a), dy: -Math.cos(a) };
  });
  const values = axes.map((_, i) => format(series.values[i] ?? 0));

  // Narrow cards wrap names by word and put the value on its own line.
  const wrapped = axes.map((label) =>
    label.split(' ').reduce<string[]>((acc, word) => {
      const last = acc[acc.length - 1];
      if (last && sansW(`${last} ${word}`) <= WRAP) acc[acc.length - 1] = `${last} ${word}`;
      else acc.push(word);
      return acc;
    }, []),
  );

  // Fit the radius so every label stays inside the card.
  const fit = (stacked: boolean) =>
    Math.min(
      MAX_R,
      ...angles.map(({ dx }, i) => {
        const w = stacked
          ? Math.max(...wrapped[i].map(sansW), monoW(values[i]))
          : sansW(axes[i]) + 4 + monoW(values[i]);
        if (Math.abs(dx) < 0.15) return (width / 2 - PAD) * 2 >= w ? MAX_R : MIN_R;
        return (width / 2 - w - PAD) / Math.abs(dx) - GAP;
      }),
    );
  const stacked = fit(false) < 96 && fit(true) > fit(false);
  const R = Math.max(MIN_R, Math.floor(fit(stacked)));
  const lines = axes.map((_, i) => (stacked ? wrapped[i].length + 1 : 1));

  // Vertical room each label needs past the polygon, above and below.
  const reach = (side: 1 | -1) =>
    Math.max(
      R,
      ...angles.map(({ dx, dy }, i) => {
        const d = (R + GAP) * dy * side;
        return Math.abs(dx) < 0.15 ? d + (d > 0 ? lines[i] * LINE : 0) : d + (lines[i] * LINE) / 2;
      }),
    );
  const top = reach(-1) + PAD;
  const height = Math.ceil(top + reach(1) + PAD);
  const cx = round(width / 2);
  const cy = round(top);

  const at = (i: number, r: number) =>
    [round(cx + r * angles[i].dx), round(cy + r * angles[i].dy)] as const;
  const scale = (v: number) => (Math.min(Math.max(v, 0), max) / max) * R;
  const shape = (vals: number[], k = 1) =>
    axes
      .map((_, i) => {
        const [x, y] = at(i, scale(vals[i] ?? 0) * k);
        return `${i ? 'L' : 'M'}${x} ${y}`;
      })
      .join('') + 'Z';
  const ring = (r: number) => shape(axes.map(() => r));

  const steps = Number.isInteger(max) && max <= 10 ? max : 4;
  const rings = Array.from({ length: steps }, (_, k) => ((k + 1) / steps) * max);

  // Members on the same value sit side by side across the spoke.
  const dots = axes.flatMap((_, i) => {
    const groups = new Map<number, typeof people>();
    for (const m of people) {
      const v = m.values[i] ?? 0;
      groups.set(v, [...(groups.get(v) ?? []), m]);
    }
    return [...groups].flatMap(([v, group]) =>
      group.map((m, k) => {
        const [x, y] = at(i, scale(v));
        const off = (k - (group.length - 1) / 2) * 7;
        return {
          key: `${m.id}-${i}`,
          axis: i,
          color: m.color,
          x: round(x - angles[i].dy * off),
          y: round(y + angles[i].dx * off),
        };
      }),
    );
  });

  const select = (index: number | null, keyboard: boolean) => {
    setFromKeyboard(keyboard);
    setActive(index);
    if (index !== null) onSelect?.(index);
  };

  // A visually hidden range input is the keyboard surface: arrows, Home and End move between
  // axes natively, and its value text is what a screen reader hears.
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') return select(null, true);
    if (active !== null || !n) return;
    // Nothing is selected yet: the first arrow lands on an end, not one past the input's value.
    const first: Record<string, number> = {
      ArrowRight: 0,
      ArrowUp: 0,
      ArrowLeft: n - 1,
      ArrowDown: n - 1,
      Home: 0,
      End: n - 1,
    };
    if (!(event.key in first)) return;
    event.preventDefault();
    select(first[event.key], true);
  };

  const wedge = (i: number) => {
    const far = R + GAP + 160;
    const half = Math.PI / Math.max(n, 1);
    const a = (i / Math.max(n, 1)) * 2 * Math.PI;
    const p = (t: number) => `${round(cx + far * Math.sin(t))} ${round(cy - far * Math.cos(t))}`;
    return `M${cx} ${cy}L${p(a - half)}L${p(a)}L${p(a + half)}Z`;
  };

  const best = axes.length
    ? axes[series.values.indexOf(Math.max(...series.values.slice(0, n)))]
    : '';
  const tip = active === null ? null : at(active, scale(series.values[active] ?? 0));
  const readout = (i: number) =>
    [
      `${axes[i]}: ${series.label} ${values[i]}`,
      baseline && `${baseline.label} ${format(baseline.values[i] ?? 0)}`,
      ...people.map((m) => `${m.name ?? m.label} ${format(m.values[i] ?? 0)}`),
    ]
      .filter(Boolean)
      .join(', ');
  const memberLine = (i: number) =>
    people.map((m) => `${m.label} ${format(m.values[i] ?? 0)}`).join(' · ');

  return (
    <MotionConfig reducedMotion="user">
      <Shell className={cn('max-w-xl', className)}>
        <ShellHeader
          icon={Polygon}
          title={title}
          subtitle={subtitle}
          aside={
            headline && (
              <p className="flex items-baseline gap-1.5">
                <span className="text-xl font-medium tracking-tight tabular-nums">
                  {headline.value}
                </span>
                {headline.caption && (
                  <span className="text-xs text-muted-foreground">{headline.caption}</span>
                )}
              </p>
            )
          }
        />
        <Panel className="p-4">
          <div
            ref={ref}
            className="relative rounded-xl outline-offset-4 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring"
          >
            <input
              type="range"
              min={0}
              max={Math.max(n - 1, 0)}
              step={1}
              value={active ?? 0}
              aria-label={`${title}. Use arrow keys to read each axis.`}
              aria-valuetext={active === null ? 'No axis selected' : readout(active)}
              onChange={(event) => select(Number(event.target.value), true)}
              onKeyDown={onKeyDown}
              onBlur={() => fromKeyboard && setActive(null)}
              className="sr-only"
            />
            <svg
              key={measured ? 'measured' : 'guess'}
              visibility={measured ? undefined : 'hidden'}
              role="img"
              aria-label={`${title}: ${series.label} ${axes.map((a, i) => `${a} ${values[i]}`).join(', ')}. Strongest on ${best}.`}
              width={width}
              height={height}
              className="block overflow-visible"
              onPointerLeave={() => select(null, false)}
            >
              <defs>
                <pattern id={`${id}-grain`} width={8} height={8} patternUnits="userSpaceOnUse">
                  <circle cx={4} cy={4} r={0.75} className="fill-foreground/15" />
                </pattern>
              </defs>

              <path d={ring(max)} fill={`url(#${id}-grain)`} />
              {rings.map((r) => (
                <path
                  key={r}
                  d={ring(r)}
                  fill="none"
                  className="stroke-foreground/10"
                  strokeLinejoin="round"
                />
              ))}
              {axes.map((_, i) => {
                const [x, y] = at(i, R);
                return (
                  <line
                    key={i}
                    x1={cx}
                    y1={cy}
                    x2={x}
                    y2={y}
                    className={cn(
                      'transition-[stroke] duration-150',
                      active === i ? 'stroke-foreground/30' : 'stroke-foreground/10',
                      fromKeyboard && 'duration-0',
                    )}
                  />
                );
              })}

              {baseline && (
                <path
                  d={shape(baseline.values)}
                  fill="none"
                  className="stroke-foreground/45"
                  strokeWidth={1.25}
                  strokeDasharray="4 4"
                  strokeLinejoin="round"
                />
              )}

              <motion.path
                initial={{ d: shape(series.values, 0.9), opacity: 0 }}
                animate={{ d: shape(series.values), opacity: 1 }}
                transition={{ duration: 0.3, ease: EASE_OUT }}
                style={{ fill: brand, stroke: brand }}
                fillOpacity={0.2}
                strokeWidth={1.75}
                strokeLinejoin="round"
              />

              <motion.g
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.25, ease: EASE_OUT, delay: reduce ? 0 : 0.15 }}
              >
                {dots.map((d) => (
                  <circle
                    key={d.key}
                    cx={d.x}
                    cy={d.y}
                    r={3}
                    style={{ fill: d.color }}
                    className={cn(
                      'transition-opacity duration-150',
                      active !== null && active !== d.axis && 'opacity-35',
                      fromKeyboard && 'duration-0',
                    )}
                  />
                ))}
                {axes.map((_, i) => {
                  const [x, y] = at(i, scale(series.values[i] ?? 0));
                  return active === i ? (
                    <circle key={i} cx={x} cy={y} r={5} className="fill-foreground" />
                  ) : (
                    <circle key={i} cx={x} cy={y} r={3.5} style={{ fill: brand }} />
                  );
                })}
              </motion.g>

              {axes.map((label, i) => {
                const { dx, dy } = angles[i];
                const [x, y] = at(i, R + GAP);
                const middle = Math.abs(dx) < 0.15;
                const anchor = middle ? 'middle' : dx > 0 ? 'start' : 'end';
                // Top labels grow upward, bottom ones downward, side ones center.
                const first = middle
                  ? dy < 0
                    ? -(lines[i] - 1) * LINE
                    : LINE * 0.5
                  : (-(lines[i] - 1) * LINE) / 2;
                const on = active === i;
                return (
                  <text
                    key={i}
                    x={x}
                    y={round(y + first)}
                    dy={middle && dy < 0 ? 0 : '0.32em'}
                    textAnchor={anchor}
                    fontSize="12"
                    className={cn(
                      'transition-[fill] duration-150',
                      on ? 'fill-foreground' : 'fill-muted-foreground',
                      fromKeyboard && 'duration-0',
                    )}
                  >
                    {stacked
                      ? wrapped[i].map((line, k) => (
                          <tspan key={k} x={x} dy={k ? LINE : undefined}>
                            {line}
                          </tspan>
                        ))
                      : label}
                    <tspan
                      {...(stacked ? { x, dy: LINE } : { dx: 4 })}
                      className={cn(
                        'font-mono tabular-nums',
                        on ? 'fill-foreground' : 'fill-muted-foreground',
                      )}
                    >
                      {values[i]}
                    </tspan>
                  </text>
                );
              })}

              {axes.map((_, i) => (
                <path
                  key={i}
                  d={wedge(i)}
                  fill="transparent"
                  onPointerEnter={() => select(i, false)}
                />
              ))}
            </svg>

            <AnimatePresence>
              {active !== null && tip && (
                <motion.div
                  key="tip"
                  initial={fromKeyboard ? false : { opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1, transition: enter }}
                  exit={{ opacity: 0, transition: exit }}
                  className="pointer-events-none absolute z-10 rounded-xl bg-surface-raised px-3 py-2 text-xs"
                  style={{
                    width: Math.min(TIP, width),
                    left: Math.min(Math.max(tip[0] - TIP / 2, 0), Math.max(width - TIP, 0)),
                    // Below the vertex on the top half, above it on the bottom.
                    ...(tip[1] <= cy
                      ? { top: tip[1] + 12, transformOrigin: 'top center' }
                      : {
                          bottom: height - tip[1] + 12,
                          transformOrigin: 'bottom center',
                        }),
                  }}
                >
                  <p className="flex gap-3">
                    <span className="flex-1 font-medium">{axes[active]}</span>
                    <span className="font-mono tabular-nums">{values[active]}</span>
                  </p>
                  {people.length > 0 && (
                    <p className="mt-1 font-mono text-[0.8125rem] text-foreground tabular-nums">
                      {memberLine(active)}
                    </p>
                  )}
                  {baseline && (
                    <p className="mt-1 flex gap-3 text-muted-foreground">
                      <span className="flex-1">{baseline.label}</span>
                      <span className="font-mono tabular-nums">
                        {format(baseline.values[active] ?? 0)}
                      </span>
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="size-2 rounded-full"
                style={{ background: brand }}
              />
              {series.label}
            </span>
            {baseline && (
              <span className="flex items-center gap-1.5">
                <svg aria-hidden="true" width={12} height={2} className="overflow-visible">
                  <line
                    x1={0}
                    y1={1}
                    x2={12}
                    y2={1}
                    className="stroke-foreground/45"
                    strokeWidth={1.25}
                    strokeDasharray="3 2"
                  />
                </svg>
                {baseline.label}
              </span>
            )}
            {people.map((m) => (
              <span key={m.id} className="flex items-center gap-1.5" title={m.name}>
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full"
                  style={{ background: m.color }}
                />
                {m.label}
              </span>
            ))}
          </div>

          <table className="sr-only">
            <caption>{title}</caption>
            <thead>
              <tr>
                <th scope="col">Axis</th>
                <th scope="col">{series.label}</th>
                {baseline && <th scope="col">{baseline.label}</th>}
                {people.map((m) => (
                  <th key={m.id} scope="col">
                    {m.name ?? m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {axes.map((axis, i) => (
                <tr key={axis}>
                  <th scope="row">{axis}</th>
                  <td>{values[i]}</td>
                  {baseline && <td>{format(baseline.values[i] ?? 0)}</td>}
                  {people.map((m) => (
                    <td key={m.id}>{format(m.values[i] ?? 0)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </Shell>
    </MotionConfig>
  );
}

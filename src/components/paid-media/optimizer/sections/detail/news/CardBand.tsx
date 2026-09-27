'use client';

// The band: the middle of every news card, tinted in the card's tone, growing (`flex-1`) to
// take whatever height the row gives the card. The card's own evidence fills it and the figure
// sits in its top-left corner, so the number and its proof read as one object.
//
// Every visual is drawn in a 100 × 100 box stretched to the band (`preserveAspectRatio=none`,
// strokes kept crisp by `vector-effect`), and every label is positioned in % inside it. The
// area is sized by the card, never by the chart. Shapes stay in the lower part of the box so
// the top-left corner is free for the figure. Which visual a card draws, and why, is decided
// in ./cardVisual; this file only draws it.

import type * as React from 'react';
import { cn } from '@/lib/utils';
import { figureProps, formatCurrency, formatPercent } from '../../../format';
import type { CardFigure, CardTone, CardVisual } from './cardVisual';
import { resultNoun } from './cardVisual';

const BAND_TONE: Record<CardTone, string> = {
  bad: 'bg-destructive/5 border-destructive/15',
  primary: 'bg-primary/5 border-primary/15',
  warn: 'bg-warning/5 border-warning/15',
  neutral: 'bg-muted/40 border-border/60',
};

type Align = 'start' | 'middle' | 'end';
type Anchor = 'above' | 'center' | 'below';

const ALIGN: Record<Align, string> = {
  start: '',
  middle: '-translate-x-1/2',
  end: '-translate-x-full',
};
const ANCHOR: Record<Anchor, string> = {
  above: '-translate-y-full',
  center: '-translate-y-1/2',
  below: '',
};

const TEXT_TONE = {
  muted: 'text-muted-foreground',
  bad: 'text-destructive',
  // `text-primary` is this app's foreground utility, not the brand colour.
  primary: 'text-(--primary)',
  warn: 'text-warning',
  good: 'text-success',
  fill: 'text-foreground/75',
} as const;

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const pct = (n: number): string => `${clamp(n, 0, 100).toFixed(2)}%`;

/** A label placed in % inside the box. */
function Label({
  x,
  y,
  align = 'start',
  anchor = 'above',
  tone = 'muted',
  strong = false,
  children,
}: {
  x: number;
  y: number;
  align?: Align;
  anchor?: Anchor;
  tone?: keyof typeof TEXT_TONE;
  strong?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'pointer-events-none absolute whitespace-nowrap font-mono tabular-nums leading-tight',
        strong ? 'font-semibold text-sm' : 'text-xs',
        TEXT_TONE[tone],
        ALIGN[align],
        ANCHOR[anchor],
      )}
      data-testid="band-label"
      style={{ left: pct(x), top: pct(y) }}
    >
      {children}
    </span>
  );
}

/** The stretched drawing surface. */
function Surface({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <svg
      aria-hidden
      className="absolute inset-0 size-full overflow-visible"
      preserveAspectRatio="none"
      viewBox="0 0 100 100"
    >
      <title>{title}</title>
      {children}
    </svg>
  );
}

const CRISP = { vectorEffect: 'non-scaling-stroke' } as const;

type DrawArgs = { currency: string | null; resultLabel: string };

function CostVsReference({
  visual,
  currency,
  resultLabel,
}: DrawArgs & { visual: Extract<CardVisual, { kind: 'cost_vs_reference' }> }) {
  const top = Math.max(visual.value, visual.line, visual.reference ?? 0) * 1.12;
  const x = (v: number) => (v / top) * 100;
  return (
    <>
      <Surface title="this ad set against the reference">
        <rect
          className="fill-destructive/30"
          height={13}
          style={CRISP}
          width={x(visual.value)}
          x={0}
          y={58}
        />
        {visual.reference != null ? (
          <rect
            className="fill-muted-foreground/20"
            height={13}
            style={CRISP}
            width={x(visual.reference)}
            x={0}
            y={84}
          />
        ) : null}
        <line
          className="stroke-destructive"
          strokeDasharray="4 3"
          strokeWidth={1.25}
          style={CRISP}
          x1={x(visual.line)}
          x2={x(visual.line)}
          y1={47}
          y2={100}
        />
      </Surface>
      <Label tone="bad" x={0.5} y={56.8}>
        {formatCurrency(visual.value, currency)} / {resultNoun(resultLabel)} · this ad set
      </Label>
      {visual.reference != null ? (
        <Label x={0.5} y={83.2}>
          {formatCurrency(visual.reference, currency)} · the reference
        </Label>
      ) : null}
      <Label align="end" tone="bad" x={99.5} y={46}>
        {visual.multiple != null ? `${visual.multiple}× line` : 'line'} ·{' '}
        {formatCurrency(visual.line, currency)}
      </Label>
    </>
  );
}

function SpendBlocks({
  visual,
  currency,
  resultLabel,
}: DrawArgs & { visual: Extract<CardVisual, { kind: 'spend_blocks' }> }) {
  const whole = Math.floor(visual.blocks);
  const part = visual.blocks - whole;
  const count = Math.ceil(visual.blocks);
  const pitch = Math.min(7.4, 96 / Math.max(1, count));
  const width = pitch * 0.865;
  const noun = resultNoun(resultLabel);
  return (
    <>
      <Surface title="spend in results at target">
        {Array.from({ length: count }, (_, i) => (
          <rect
            className="fill-muted-foreground/20 stroke-muted-foreground/45"
            height={36}
            // biome-ignore lint/suspicious/noArrayIndexKey: blocks are positional by nature
            key={i}
            strokeWidth={1}
            style={CRISP}
            width={i < whole ? width : width * part}
            x={i * pitch}
            y={55.6}
          />
        ))}
        <line
          className="stroke-destructive"
          strokeWidth={2.5}
          style={CRISP}
          x1={0}
          x2={100}
          y1={98.2}
          y2={98.2}
        />
      </Surface>
      <Label x={0.5} y={54.4}>
        {formatCurrency(visual.spent, currency)} = {visual.blocks}{' '}
        {visual.blocks === 1 ? noun : `${noun}s`} at target
      </Label>
      <Label align="end" strong tone="bad" x={99.5} y={96.4}>
        0 {resultLabel.toLowerCase()}
      </Label>
    </>
  );
}

function CtrStep({
  visual,
  resultLabel,
}: DrawArgs & { visual: Extract<CardVisual, { kind: 'ctr_step' }> }) {
  const split = ((visual.baseWindowDays - visual.recentWindowDays) / visual.baseWindowDays) * 100;
  const recentY = clamp(50 + (1 - visual.recent / visual.base) * 50, 12, 100);
  const cost = visual.costChangePct;
  return (
    <>
      <Surface title="click-through rate stepping down">
        <rect className="fill-muted-foreground/20" height={50} width={split} x={0} y={50} />
        {recentY > 50 ? (
          <rect
            className="fill-destructive/10"
            height={recentY - 50}
            width={100 - split}
            x={split}
            y={50}
          />
        ) : null}
        <rect
          className="fill-destructive/30"
          height={100 - recentY}
          width={100 - split}
          x={split}
          y={recentY}
        />
        <line
          className="stroke-muted-foreground"
          strokeDasharray="4 3"
          strokeWidth={1.25}
          style={CRISP}
          x1={0}
          x2={100}
          y1={50}
          y2={50}
        />
        <line
          className="stroke-destructive"
          strokeWidth={2}
          style={CRISP}
          x1={split}
          x2={split}
          y1={50}
          y2={recentY}
        />
        <line
          className="stroke-destructive"
          strokeWidth={2}
          style={CRISP}
          x1={split}
          x2={100}
          y1={recentY}
          y2={recentY}
        />
      </Surface>
      <Label x={0.5} y={49}>
        {visual.baseWindowDays}-day CTR {formatPercent(visual.base, { fractionDigits: 2 })}
      </Label>
      <Label align="end" anchor="center" strong tone="bad" x={split - 1.5} y={(50 + recentY) / 2}>
        {formatPercent(visual.changePct, { signed: true })}
      </Label>
      <Label align="end" anchor="below" tone="bad" x={99.5} y={recentY + 1.5}>
        {visual.recentWindowDays} days {formatPercent(visual.recent, { fractionDigits: 2 })}
      </Label>
      {cost != null ? (
        <Label x={1.5} y={98.2}>
          cost per {resultNoun(resultLabel)} {formatPercent(cost, { signed: true })}
        </Label>
      ) : null}
    </>
  );
}

function BudgetMove({
  visual,
  currency,
}: DrawArgs & { visual: Extract<CardVisual, { kind: 'budget_move' }> }) {
  const top = Math.max(visual.from, visual.to, visual.wanted ?? 0, visual.cap ?? 0) * 1.1;
  const h = (v: number) => (v / top) * 55;
  const up = visual.to >= visual.from;
  const columns: {
    x: number;
    value: number;
    word: string;
    className: string;
    tone: 'fill' | 'primary' | 'muted';
  }[] = [
    { x: 4, value: visual.from, word: 'now', className: 'fill-muted-foreground/20', tone: 'fill' },
    {
      x: 36,
      value: visual.to,
      word: 'next',
      className: up ? 'fill-primary/30' : 'fill-destructive/25',
      tone: 'primary',
    },
  ];
  return (
    <>
      <Surface title="daily budget now and next">
        {columns.map((column) => (
          <rect
            className={column.className}
            height={h(column.value)}
            key={column.word}
            width={24}
            x={column.x}
            y={100 - h(column.value)}
          />
        ))}
        {visual.wanted != null ? (
          <rect
            className="fill-none stroke-primary"
            height={h(visual.wanted)}
            strokeDasharray="4 3"
            strokeWidth={1.25}
            style={CRISP}
            width={24}
            x={68}
            y={100 - h(visual.wanted)}
          />
        ) : null}
        {visual.cap != null ? (
          <line
            className="stroke-foreground/80"
            strokeDasharray="4 3"
            strokeWidth={1.25}
            style={CRISP}
            x1={30}
            x2={100}
            y1={100 - h(visual.cap)}
            y2={100 - h(visual.cap)}
          />
        ) : null}
      </Surface>
      {columns.map((column) => (
        <Label
          align="middle"
          key={`${column.word}-value`}
          tone={column.tone === 'primary' ? 'primary' : 'muted'}
          x={column.x + 12}
          y={100 - h(column.value) - 1.5}
        >
          {formatCurrency(column.value, currency)}
        </Label>
      ))}
      {columns.map((column) => (
        <Label align="middle" key={column.word} tone="fill" x={column.x + 12} y={98.2}>
          {column.word}
        </Label>
      ))}
      {visual.wanted != null ? (
        <>
          <Label align="middle" x={80} y={100 - h(visual.wanted) - 1.5}>
            {formatCurrency(visual.wanted, currency)}
          </Label>
          <Label align="middle" x={80} y={98.2}>
            wanted
          </Label>
        </>
      ) : null}
      {visual.cap != null ? (
        <Label x={31} y={100 - h(visual.cap) - 1}>
          cap {formatCurrency(visual.cap, currency)}
        </Label>
      ) : null}
    </>
  );
}

function Range({
  visual,
  currency,
}: DrawArgs & { visual: Extract<CardVisual, { kind: 'range' }> }) {
  const marks = [visual.low, visual.high, visual.target ?? visual.low];
  const lo = Math.min(...marks) * 0.75;
  const hi = Math.max(...marks) * 1.08;
  const x = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const over = visual.target != null && visual.estimate != null && visual.estimate > visual.target;
  return (
    <>
      <Surface title="the ad set’s cost range against the target">
        <line
          className="stroke-border"
          strokeWidth={1}
          style={CRISP}
          x1={0}
          x2={100}
          y1={71.2}
          y2={71.2}
        />
        <rect
          className={over ? 'fill-warning/30' : 'fill-primary/30'}
          height={14.4}
          width={x(visual.high) - x(visual.low)}
          x={x(visual.low)}
          y={64}
        />
        {visual.estimate != null ? (
          <line
            className={over ? 'stroke-warning' : 'stroke-primary'}
            strokeWidth={2.5}
            style={CRISP}
            x1={x(visual.estimate)}
            x2={x(visual.estimate)}
            y1={58}
            y2={84.4}
          />
        ) : null}
        {visual.target != null ? (
          <line
            className="stroke-foreground/80"
            strokeDasharray="4 3"
            strokeWidth={1.25}
            style={CRISP}
            x1={x(visual.target)}
            x2={x(visual.target)}
            y1={55.6}
            y2={86.8}
          />
        ) : null}
      </Surface>
      <Label align="end" anchor="center" x={x(visual.low) - 1} y={71.2}>
        {formatCurrency(visual.low, currency)}
      </Label>
      <Label anchor="center" x={x(visual.high) + 1} y={71.2}>
        {formatCurrency(visual.high, currency)}
      </Label>
      {visual.estimate != null ? (
        <Label align="end" tone={over ? 'warn' : 'primary'} x={x(visual.estimate) + 1} y={54.4}>
          est. {formatCurrency(visual.estimate, currency)}
        </Label>
      ) : null}
      {visual.target != null ? (
        <Label align="middle" anchor="below" x={x(visual.target)} y={88}>
          target {formatCurrency(visual.target, currency)}
        </Label>
      ) : null}
    </>
  );
}

function CostLine({
  visual,
  currency,
  resultLabel,
}: DrawArgs & { visual: Extract<CardVisual, { kind: 'cost_line' }> }) {
  const values = [
    ...visual.points.map((point) => point.cost),
    ...(visual.target != null ? [visual.target] : []),
  ];
  const lo = Math.min(...values) * 0.92;
  const hi = Math.max(...values) * 1.04;
  const y = (v: number) => 95 - ((v - lo) / (hi - lo)) * 50;
  const step = 100 / Math.max(1, visual.points.length - 1);
  const xy = visual.points.map((point, i) => ({ x: i * step, y: y(point.cost) }));
  const line = xy.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  const targetY = visual.target != null ? y(visual.target) : null;
  const shaded =
    targetY != null
      ? [
          `0,${targetY.toFixed(2)}`,
          ...xy.map((p) => `${p.x.toFixed(2)},${Math.min(p.y, targetY).toFixed(2)}`),
          `100,${targetY.toFixed(2)}`,
        ].join(' ')
      : null;
  const last = visual.points[visual.points.length - 1];
  const lastXY = xy[xy.length - 1];
  const over = visual.target != null && visual.overall != null && visual.overall > visual.target;
  return (
    <>
      <Surface title="cost per result against the target">
        {shaded ? <polygon className="fill-warning/20" points={shaded} /> : null}
        {targetY != null ? (
          <line
            className="stroke-foreground/80"
            strokeDasharray="4 3"
            strokeWidth={1.25}
            style={CRISP}
            x1={0}
            x2={100}
            y1={targetY}
            y2={targetY}
          />
        ) : null}
        {visual.overall != null ? (
          <line
            className="stroke-muted-foreground"
            strokeDasharray="1.5 3"
            strokeWidth={1.25}
            style={CRISP}
            x1={0}
            x2={100}
            y1={y(visual.overall)}
            y2={y(visual.overall)}
          />
        ) : null}
        <polyline
          className={cn('fill-none', over ? 'stroke-warning' : 'stroke-primary')}
          points={line}
          strokeLinejoin="round"
          strokeWidth={2}
          style={CRISP}
        />
      </Surface>
      {visual.overall != null ? (
        <Label x={0.5} y={y(visual.overall) - 1}>
          portfolio {formatCurrency(visual.overall, currency)}
        </Label>
      ) : null}
      {targetY != null && visual.target != null ? (
        <Label align="end" anchor="below" x={99.5} y={targetY + 1.5}>
          target {formatCurrency(visual.target, currency)}
        </Label>
      ) : null}
      {last && lastXY ? (
        <Label align="end" anchor="center" tone={over ? 'warn' : 'primary'} x={96} y={lastXY.y}>
          {formatCurrency(last.cost, currency)}
        </Label>
      ) : null}
      <Label x={0.5} y={100}>
        {visual.across === 'ad_sets'
          ? `${visual.points.length} ad sets, cheapest → dearest`
          : `${visual.points.length} priced days`}
        {' · '}cost per {resultNoun(resultLabel)}
      </Label>
    </>
  );
}

function Strip({
  visual,
  currency,
}: DrawArgs & { visual: Extract<CardVisual, { kind: 'strip' }> }) {
  return (
    <div className="absolute inset-0 flex flex-col gap-2 py-1">
      <p
        className="font-mono text-sm font-semibold text-foreground tabular-nums"
        data-testid="band-strip-label"
      >
        {visual.label}
      </p>
      <div className="grid min-h-0 flex-1 auto-cols-fr grid-flow-col gap-1.5">
        {visual.cells.map((cell) => (
          <div
            className="flex flex-col justify-end rounded-md border border-muted-foreground/40 border-dashed bg-muted/60 px-2 py-1.5"
            key={cell.label}
          >
            <span className="font-mono text-foreground text-lg tabular-nums leading-none">
              {cell.kind === 'money'
                ? formatCurrency(cell.value, currency)
                : cell.value.toLocaleString('en-US')}
            </span>
            <span className="text-muted-foreground text-xs">{cell.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** What the visual says, in one sentence, for a reader who cannot see it. */
export function captionFor(
  visual: CardVisual,
  currency: string | null,
  resultLabel: string,
): string {
  const money = (v: number) => formatCurrency(v, currency);
  const noun = resultNoun(resultLabel);
  switch (visual.kind) {
    case 'cost_vs_reference':
      return `Cost per ${noun} ${money(visual.value)} over ${visual.windowDays} days${
        visual.reference != null ? ` against a ${money(visual.reference)} reference` : ''
      }; the line is ${money(visual.line)}`;
    case 'spend_blocks':
      return `${money(visual.spent)} spent in ${visual.windowDays} days, ${visual.blocks} ${noun}s' worth at the ${money(visual.perResult)} target; 0 ${resultLabel.toLowerCase()} came back`;
    case 'ctr_step':
      return `CTR ${formatPercent(visual.base, { fractionDigits: 2 })} over ${visual.baseWindowDays} days, ${formatPercent(visual.recent, { fractionDigits: 2 })} over the last ${visual.recentWindowDays}, ${formatPercent(visual.changePct, { signed: true })}${
        visual.costChangePct != null
          ? `; cost per ${noun} ${formatPercent(visual.costChangePct, { signed: true })}`
          : ''
      }`;
    case 'budget_move':
      return `Daily budget ${money(visual.from)} now, ${money(visual.to)} next cycle${
        visual.wanted != null ? `; the solver wanted ${money(visual.wanted)}` : ''
      }${visual.cap != null ? `, the velocity cap holds it at ${money(visual.cap)}` : ''}`;
    case 'range':
      return `Cost per ${noun} between ${money(visual.low)} and ${money(visual.high)}${
        visual.estimate != null ? `, estimate ${money(visual.estimate)}` : ''
      }${visual.target != null ? `, against a ${money(visual.target)} target` : ''}`;
    case 'cost_line':
      return `Cost per ${noun} across ${visual.points.length} ${visual.across === 'ad_sets' ? 'ad sets' : 'days'}${
        visual.target != null ? ` against a ${money(visual.target)} target` : ''
      }${visual.overall != null ? `; portfolio ${money(visual.overall)}` : ''}`;
    case 'strip':
      return visual.label;
  }
}

function Visual({ visual, ...args }: DrawArgs & { visual: CardVisual }) {
  switch (visual.kind) {
    case 'cost_vs_reference':
      return <CostVsReference visual={visual} {...args} />;
    case 'spend_blocks':
      return <SpendBlocks visual={visual} {...args} />;
    case 'ctr_step':
      return <CtrStep visual={visual} {...args} />;
    case 'budget_move':
      return <BudgetMove visual={visual} {...args} />;
    case 'range':
      return <Range visual={visual} {...args} />;
    case 'cost_line':
      return <CostLine visual={visual} {...args} />;
    case 'strip':
      return <Strip visual={visual} {...args} />;
  }
}

function Figure({
  id,
  figure,
  currency,
}: {
  id: string;
  figure: CardFigure;
  currency: string | null;
}) {
  const body = formatCurrency(figure.value, currency);
  const signed = figure.signed && figure.value > 0 ? `+${body}` : body;
  return (
    <p
      className="absolute top-2.5 left-4 flex flex-wrap items-baseline gap-x-1.5"
      data-testid="news-figure"
    >
      <span
        className="font-medium font-mono text-4xl text-foreground tabular-nums leading-none tracking-tight"
        {...figureProps(
          `news.${id}.figure`,
          figure.value,
          currency,
          'none',
          figure.unit === 'currency_per_day' ? 'per-period' : 'currency',
        )}
      >
        {signed}
      </span>
      <span className="text-muted-foreground text-sm">{figure.label}</span>
    </p>
  );
}

export type CardBandProps = {
  id: string;
  visual: CardVisual;
  figure: CardFigure | null;
  tone: CardTone;
  currency: string | null;
  resultLabel: string;
};

export function CardBand({ id, visual, figure, tone, currency, resultLabel }: CardBandProps) {
  return (
    <div
      className={cn('-mx-4 relative mt-1.5 mb-1 min-h-32 flex-1 border-y', BAND_TONE[tone])}
      data-testid="news-band"
      data-tone={tone}
      data-visual={visual.kind}
    >
      <div
        aria-label={captionFor(visual, currency, resultLabel)}
        className={cn('absolute inset-x-4 bottom-1.5', figure ? 'top-1.5' : 'top-2.5')}
        data-testid="news-visual"
        role="img"
      >
        <Visual currency={currency} resultLabel={resultLabel} visual={visual} />
      </div>
      {figure ? <Figure currency={currency} figure={figure} id={id} /> : null}
    </div>
  );
}

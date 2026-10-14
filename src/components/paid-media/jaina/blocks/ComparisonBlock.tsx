'use client';

import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react';
import { formatValue } from '@/lib/jaina/formatValue';
import type { ComparisonBlockV2 } from '@/lib/jaina/schemas';
import { cn } from '@/lib/utils';
import {
  explicitSeverity,
  fallsAreGood,
  JAINA_TABLE,
  JUDGEMENT_LABEL,
  JUDGEMENT_TEXT,
  judgeDelta,
} from '../reading';
import { BlockHeading } from './BlockHeading';
import { blockFigureAttributes } from './blockFigure';
import { BlockSourcesFooter, CitationChips } from './citations';
import { MediaText } from './mediaText';
import { JAINA_MODULE } from './modules';

type ComparisonBlockProps = { block: ComparisonBlockV2; isStreaming: boolean };
type Pair = ComparisonBlockV2['pairs'][number];

type Side = NonNullable<ComparisonBlockV2['side_a']>;

/**
 * Four columns do not fit a phone's chat column (314px of table in 287px at 390), and a
 * table that scrolls sideways hides the change, which is the point of the block. Below 36rem
 * of its own width the table reads as one card per metric instead: the metric and its change
 * on the first line, then each side's figure under that side's name. Same DOM, so the header
 * cells and the figure stamps are the same at every width.
 */
const NARROW = {
  table: '@max-[36rem]/comparison:block',
  head: '@max-[36rem]/comparison:sr-only',
  body: '@max-[36rem]/comparison:block',
  row: '@max-[36rem]/comparison:grid @max-[36rem]/comparison:grid-cols-[minmax(0,1fr)_auto] @max-[36rem]/comparison:gap-x-3 @max-[36rem]/comparison:gap-y-0.5 @max-[36rem]/comparison:py-2',
  metric:
    '@max-[36rem]/comparison:col-start-1 @max-[36rem]/comparison:row-start-1 @max-[36rem]/comparison:p-0',
  change:
    '@max-[36rem]/comparison:col-start-2 @max-[36rem]/comparison:row-start-1 @max-[36rem]/comparison:p-0',
  // The side's name comes from `data-side` so the cell's own text stays the figure alone.
  leg: '@max-[36rem]/comparison:col-span-2 @max-[36rem]/comparison:flex @max-[36rem]/comparison:justify-between @max-[36rem]/comparison:gap-3 @max-[36rem]/comparison:p-0 @max-[36rem]/comparison:before:min-w-0 @max-[36rem]/comparison:before:truncate @max-[36rem]/comparison:before:text-muted-foreground @max-[36rem]/comparison:before:content-[attr(data-side)]',
} as const;

/**
 * A side's heading: its label, and under it what it was read on when that is not already the
 * label — the window for two entities, the entity for one entity on two windows. A report
 * stored before 2026-10-13 has no sides and keeps `before_label` / `after_label`.
 */
function sideOf(
  side: Side | undefined,
  fallback: string,
): { label: string; detail: string | null } {
  if (!side) return { label: fallback, detail: null };
  const detail = [side.entity, side.window].filter(
    (part): part is string => Boolean(part) && part !== side.label,
  );
  return { label: side.label, detail: detail.length > 0 ? detail.join(' · ') : null };
}

export default function ComparisonBlock({ block }: ComparisonBlockProps) {
  // Two entities read on one window name that window once, under the title, rather than
  // twice in narrow column heads.
  const sharedWindow =
    block.side_a?.window && block.side_a.window === block.side_b?.window
      ? block.side_a.window
      : null;
  const unshared = (side: Side | undefined) =>
    side && sharedWindow ? { ...side, window: null } : side;
  const sideA = sideOf(unshared(block.side_a), block.before_label);
  const sideB = sideOf(unshared(block.side_b), block.after_label);
  const headings = [
    { key: 'metric', label: 'Metric', detail: null, numeric: false },
    { key: 'before', ...sideA, numeric: true },
    { key: 'after', ...sideB, numeric: true },
    ...(block.baseline_label
      ? [{ key: 'baseline', label: block.baseline_label, detail: null, numeric: true }]
      : []),
    { key: 'change', label: 'Change', detail: null, numeric: true },
  ];
  // Money by the one rule (M1): each leg of a money pair prints through `formatMoney` in the
  // pair's own currency, and carries its raw value and currency for the parity checks.
  const leg = (pair: Pair, value: Pair['before'], legKey: string) => (
    <span
      className="whitespace-nowrap"
      {...blockFigureAttributes(`${pair.label} · ${legKey}`, value, pair.currency)}
    >
      {formatValue(value, pair.format ?? undefined, {
        currency: pair.currency ?? undefined,
        percentBasis: pair.percent_basis ?? null,
      })}
    </span>
  );

  return (
    <div className={JAINA_MODULE.neutral} data-jaina-module="block">
      <BlockHeading title={block.title} />
      {sharedWindow ? (
        <p className="-mt-1 mb-2 text-sm text-muted-foreground" data-comparison-window>
          {sharedWindow}
        </p>
      ) : null}
      <div className={cn(JAINA_TABLE.wrap, '@container/comparison')}>
        <table className={cn(JAINA_TABLE.table, NARROW.table)}>
          <thead className={NARROW.head}>
            <tr className={JAINA_TABLE.headRow}>
              {headings.map((heading) => (
                <th
                  key={heading.key}
                  // One alignment per column, and the figure columns sit over their own
                  // figures. This used to read `text-left first:text-left text-right`, two
                  // conflicting utilities on every cell whose winner was decided by the
                  // order Tailwind happened to emit them in — a header row that could not
                  // line up with the body it labels.
                  className={cn(JAINA_TABLE.th, heading.numeric ? 'text-right' : 'text-left')}
                >
                  {heading.label}
                  {heading.detail ? (
                    <span className="block font-normal normal-case tracking-normal">
                      {heading.detail}
                    </span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={NARROW.body}>
            {block.pairs.map((pair, index) => {
              // THE FIX: this column used to colour off `pair.severity` alone, so a change
              // the model did not explicitly judge — which is nearly all of them — rendered
              // in muted ink, and nothing here ever asked which DIRECTION was welcome. A
              // cost per result that fell 12% is good news; the old code had no way to say
              // so. `judgeDelta` keeps the order of authority: an explicit severity wins,
              // then the metric's polarity, then, last, the sign.
              const judgement = judgeDelta({
                change: pair.change,
                goodWhenDown: fallsAreGood(pair.label),
                severity: explicitSeverity(pair.severity),
              });
              const hasChange = pair.change !== null && pair.change !== undefined;
              return (
                <tr key={`${pair.label}-${index}`} className={cn(JAINA_TABLE.row, NARROW.row)}>
                  <td className={cn(JAINA_TABLE.td, 'font-medium text-foreground', NARROW.metric)}>
                    <MediaText>{pair.label}</MediaText>
                    <CitationChips
                      citeIds={pair.cite_ids}
                      citations={block.citations}
                      className="ml-1"
                    />
                  </td>
                  <td
                    className={cn(JAINA_TABLE.td, 'text-right', NARROW.leg)}
                    data-side={sideA.label}
                  >
                    {leg(pair, pair.before, sideA.label)}
                  </td>
                  <td
                    className={cn(JAINA_TABLE.td, 'text-right', NARROW.leg)}
                    data-side={sideB.label}
                  >
                    {leg(pair, pair.after, sideB.label)}
                  </td>
                  {block.baseline_label ? (
                    // The context floor's third leg: the longer baseline the pair is read
                    // against. "—" when this pair has none.
                    <td
                      className={cn(JAINA_TABLE.td, 'text-right text-muted-foreground', NARROW.leg)}
                      data-side={block.baseline_label}
                    >
                      {pair.baseline == null ? '—' : leg(pair, pair.baseline, block.baseline_label)}
                    </td>
                  ) : null}
                  <td
                    className={cn(
                      JAINA_TABLE.td,
                      'text-right',
                      hasChange ? JUDGEMENT_TEXT[judgement] : 'text-muted-foreground',
                      NARROW.change,
                    )}
                    // The colour is the judgement, and a screen reader cannot see it.
                    title={hasChange ? `${pair.label}: ${JUDGEMENT_LABEL[judgement]}` : undefined}
                  >
                    {/* A missing change used to print "0%" — a figure nobody measured,
                        indistinguishable from a real flat period. */}
                    {hasChange ? (
                      <>
                        {pair.change_direction === 'up' && (
                          <ArrowUpIcon className="mr-0.5 inline-block h-3 w-3" />
                        )}
                        {pair.change_direction === 'down' && (
                          <ArrowDownIcon className="mr-0.5 inline-block h-3 w-3" />
                        )}
                        {Math.abs(pair.change as number)}%
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <BlockSourcesFooter citations={block.citations} />
    </div>
  );
}

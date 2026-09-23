'use client';

import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react';
import { formatValue } from '@/lib/jaina/formatValue';
import type { ComparisonBlockV2 } from '@/lib/jaina/schemas';
import { cn } from '@/lib/utils';
import {
  explicitSeverity,
  fallsAreGood,
  JUDGEMENT_LABEL,
  JUDGEMENT_TEXT,
  judgeDelta,
} from '../reading';
import { BlockSourcesFooter, CitationChips } from './citations';
import { MediaText } from './mediaText';

type ComparisonBlockProps = { block: ComparisonBlockV2; isStreaming: boolean };

export default function ComparisonBlock({ block }: ComparisonBlockProps) {
  const headings = [
    { key: 'metric', label: 'Metric', numeric: false },
    { key: 'before', label: block.before_label, numeric: true },
    { key: 'after', label: block.after_label, numeric: true },
    ...(block.baseline_label
      ? [{ key: 'baseline', label: block.baseline_label, numeric: true }]
      : []),
    { key: 'change', label: 'Change', numeric: true },
  ];

  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-foreground">{block.title}</h4>
      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {headings.map((heading) => (
                <th
                  key={heading.key}
                  // One alignment per column, and the figure columns sit over their own
                  // figures. This used to read `text-left first:text-left text-right`, two
                  // conflicting utilities on every cell whose winner was decided by the
                  // order Tailwind happened to emit them in — a header row that could not
                  // line up with the body it labels.
                  className={cn(
                    'bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground',
                    heading.numeric ? 'text-right' : 'text-left',
                  )}
                >
                  {heading.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
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
                <tr
                  key={`${pair.label}-${index}`}
                  className="border-b border-border/30 last:border-0"
                >
                  <td className="px-3 py-2 font-medium text-foreground">
                    <MediaText>{pair.label}</MediaText>
                    <CitationChips
                      citeIds={pair.cite_ids}
                      citations={block.citations}
                      className="ml-1"
                    />
                  </td>
                  <td className="px-3 py-2 tabular-nums text-right">
                    {formatValue(pair.before, pair.format ?? undefined, {
                      percentBasis: pair.percent_basis ?? null,
                    })}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-right">
                    {formatValue(pair.after, pair.format ?? undefined, {
                      percentBasis: pair.percent_basis ?? null,
                    })}
                  </td>
                  {block.baseline_label ? (
                    // The context floor's third leg: the longer baseline the pair is read
                    // against. "—" when this pair has none.
                    <td className="px-3 py-2 tabular-nums text-right text-muted-foreground">
                      {pair.baseline == null
                        ? '—'
                        : formatValue(pair.baseline, pair.format ?? undefined, {
                            percentBasis: pair.percent_basis ?? null,
                          })}
                    </td>
                  ) : null}
                  <td
                    className={cn(
                      'px-3 py-2 text-right tabular-nums',
                      hasChange ? JUDGEMENT_TEXT[judgement] : 'text-muted-foreground',
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

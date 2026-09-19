'use client';

// Recommended actions as a table: priority · entity · action · sizing · evidence. Every
// row is executable on its own — the entity is named, the number is quoted with its
// window. No verdict labels; the sentence does that work.

import { formatValue } from '@/lib/jaina/formatValue';
import type { ActionsBlockV2 } from '@/lib/jaina/schemas';
import { cn } from '@/lib/utils';
import { BlockSourcesFooter, CitationChips } from './citations';

type ActionsBlockProps = { block: ActionsBlockV2; isStreaming: boolean };

const PRIORITY_CLASS: Record<string, string> = {
  P1: 'bg-red-500/10 text-red-600 dark:text-red-400',
  P2: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  P3: 'bg-muted text-muted-foreground',
};

export default function ActionsBlock({ block }: ActionsBlockProps) {
  return (
    <div data-testid="actions-block">
      <h4 className="mb-2 font-semibold text-foreground text-sm">{block.title}</h4>
      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/30 text-left text-muted-foreground text-xs">
              <th className="px-3 py-2 font-medium">Priority</th>
              <th className="px-3 py-2 font-medium">Entity</th>
              <th className="px-3 py-2 font-medium">Action</th>
              <th className="px-3 py-2 font-medium">Size</th>
              <th className="px-3 py-2 font-medium">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row) => {
              const value =
                typeof row.evidence.value === 'number'
                  ? formatValue(
                      row.evidence.value,
                      row.evidence.unit && /^[A-Z]{3}$/.test(row.evidence.unit)
                        ? 'currency'
                        : 'number',
                      row.evidence.unit && /^[A-Z]{3}$/.test(row.evidence.unit)
                        ? { currency: row.evidence.unit }
                        : undefined,
                    )
                  : row.evidence.value;
              return (
                <tr
                  className="border-border/30 border-b align-top last:border-0"
                  key={`${row.priority}|${row.entity.id ?? row.entity.name}|${row.action}`}
                >
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        'inline-block rounded px-1.5 py-0.5 font-medium text-xs',
                        PRIORITY_CLASS[row.priority],
                      )}
                    >
                      {row.priority}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-medium text-foreground">
                    {row.entity.name}
                    {row.entity.kind ? (
                      <span className="ml-1 text-muted-foreground text-xs">{row.entity.kind}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-foreground">
                    {row.action}
                    <CitationChips
                      citeIds={row.cite_ids}
                      citations={block.citations}
                      className="ml-1"
                    />
                  </td>
                  <td className="px-3 py-2 text-muted-foreground tabular-nums">
                    {row.sizing ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground text-xs">
                    {row.evidence.metric} {value}
                    {row.evidence.comparator ? ` ${row.evidence.comparator}` : ''} ·{' '}
                    {row.evidence.window}
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

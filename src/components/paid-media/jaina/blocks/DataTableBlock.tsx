'use client';

import { formatValue } from '@/lib/jaina/formatValue';
import type { DataTableBlockV2 } from '@/lib/jaina/schemas';
import { CreativeCell } from './CreativeCell';
import { EvidenceTooltip } from './EvidenceTooltip';
import { MediaText } from './mediaText';

type DataTableBlockProps = { block: DataTableBlockV2; isStreaming: boolean };

const displayValue = (value: string | number | null | undefined, format?: string | null): string =>
  value == null ? '—' : formatValue(value, format ?? undefined);

export function DataTableBlock({ block }: DataTableBlockProps) {
  const cardFields = block.render_mode === 'creative_cards' ? block.card_fields : null;
  const columnsByKey = new Map(block.columns.map((column) => [column.key, column]));

  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <h4 className="text-sm font-semibold text-foreground">{block.title}</h4>
        <EvidenceTooltip provenance={block.provenance} datasetId={block.dataset_id} />
      </div>
      {cardFields ? (
        <ul
          aria-label={block.title}
          className="grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3"
        >
          {block.rows.map((row, rowIndex) => {
            const titleColumn = columnsByKey.get(cardFields.title);
            const title = displayValue(row[cardFields.title], titleColumn?.format);
            const creativeColumn = columnsByKey.get(cardFields.creative);
            const creativeLabel = displayValue(row[cardFields.creative], creativeColumn?.format);
            const subtitleColumn = cardFields.subtitle
              ? columnsByKey.get(cardFields.subtitle)
              : undefined;

            return (
              <li key={rowIndex}>
                <article
                  aria-label={title}
                  className="h-full overflow-hidden rounded-xl border border-border/60 bg-card"
                >
                  <CreativeCell
                    label={creativeLabel}
                    creative={block.row_meta?.[rowIndex]?.creative}
                    display="card"
                    alt={title}
                  />
                  <div className="space-y-3 p-4">
                    <div>
                      <h5 className="font-semibold leading-snug text-foreground">
                        <MediaText>{title}</MediaText>
                      </h5>
                      {cardFields.subtitle ? (
                        <p className="mt-1 text-sm text-muted-foreground">
                          <MediaText>
                            {displayValue(row[cardFields.subtitle], subtitleColumn?.format)}
                          </MediaText>
                        </p>
                      ) : null}
                    </div>
                    {cardFields.metrics.length > 0 ? (
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                        {cardFields.metrics.map((key) => {
                          const column = columnsByKey.get(key);
                          return (
                            <div key={key} className="min-w-0">
                              <dt className="truncate text-xs text-muted-foreground">
                                {column?.label ?? key}
                              </dt>
                              <dd className="mt-0.5 truncate text-sm font-medium tabular-nums text-foreground">
                                {displayValue(row[key], column?.format)}
                              </dd>
                            </div>
                          );
                        })}
                      </dl>
                    ) : null}
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/30">
                {block.columns.map((column) => (
                  <th
                    key={column.key}
                    className={`px-3 py-2 text-xs font-medium text-muted-foreground text-${column.align ?? 'left'}`}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-border/30 last:border-0">
                  {block.columns.map((column) => {
                    const value = displayValue(row[column.key], column.format);
                    return (
                      <td
                        key={column.key}
                        className="px-3 py-2 tabular-nums"
                        style={{ textAlign: column.align ?? 'left' }}
                      >
                        {column.format === 'creative' ? (
                          <CreativeCell
                            label={value}
                            creative={block.row_meta?.[rowIndex]?.creative}
                          />
                        ) : !column.format || column.format === 'text' ? (
                          <MediaText>{value}</MediaText>
                        ) : (
                          value
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {block.notes && (
        <p className="mt-1.5 text-xs text-muted-foreground/70 italic">{block.notes}</p>
      )}
    </div>
  );
}

export default DataTableBlock;

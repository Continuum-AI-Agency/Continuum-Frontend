'use client';

import {
  type PaidCreativeAudienceEvidence,
  type PaidCreativeAudienceSegment,
  paidCreativeAudienceEvidenceSchema,
  paidCurrencyCodeSchema,
} from '@continuum/contracts';
import { formatValue } from '@/lib/jaina/formatValue';
import type { DataTableBlockV2 } from '@/lib/jaina/schemas';
import { CreativeCell } from './CreativeCell';
import { EvidenceTooltip } from './EvidenceTooltip';
import { MediaText } from './mediaText';

type DataTableBlockProps = { block: DataTableBlockV2; isStreaming: boolean };

const currencyCode = (value: unknown): string | null => {
  const parsed = paidCurrencyCodeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

const displayValue = (
  value: string | number | null | undefined,
  format?: string | null,
  currency?: string | null,
): string => {
  if (value == null) return '—';
  if (format === 'currency' && !currency) {
    return `${formatValue(value, 'number')} (currency unknown)`;
  }
  return formatValue(value, format ?? undefined, currency ? { currency } : undefined);
};

const temporalBasisLabel = (basis: PaidCreativeAudienceEvidence['temporalBasis']): string => {
  if (basis === 'as_of_performance_day') return 'As-of performance-day targeting';
  if (basis === 'current') return 'Current targeting';
  if (basis === 'mixed') return 'Mixed as-of and current targeting';
  return 'Targeting timing unknown';
};

function SegmentEvidence({
  segment,
  currency,
}: {
  segment: PaidCreativeAudienceSegment;
  currency: string | null;
}) {
  return (
    <li className="rounded-md border border-border/60 p-2">
      <p className="font-medium text-foreground">{segment.audienceCellId}</p>
      <dl className="mt-1 grid gap-1 text-xs text-muted-foreground">
        <div>
          <dt className="inline font-medium">Observed: </dt>
          <dd className="inline">{segment.observedAt}</dd>
        </div>
        <div>
          <dt className="inline font-medium">Evidence: </dt>
          <dd className="inline">
            {segment.eligibleAds} eligible ads · {displayValue(segment.spend, 'currency', currency)}
            {segment.spendShare === null
              ? ''
              : ` · ${formatValue(segment.spendShare, 'percent')} of angle spend`}
          </dd>
        </div>
        {segment.ageMin !== null || segment.ageMax !== null ? (
          <div>
            <dt className="inline font-medium">Age: </dt>
            <dd className="inline">
              {segment.ageMin ?? 'unknown'}–{segment.ageMax ?? 'unknown'}
            </dd>
          </div>
        ) : null}
        {segment.genders.length > 0 ? (
          <div>
            <dt className="inline font-medium">Gender codes: </dt>
            <dd className="inline">{segment.genders.join(', ')}</dd>
          </div>
        ) : null}
        {segment.geoNodeIds.length > 0 ? (
          <div>
            <dt className="inline font-medium">Geographies: </dt>
            <dd className="inline">{segment.geoNodeIds.join(', ')}</dd>
          </div>
        ) : null}
        {segment.customAudienceIds.length > 0 ? (
          <div>
            <dt className="inline font-medium">Custom audiences: </dt>
            <dd className="inline">{segment.customAudienceIds.join(', ')}</dd>
          </div>
        ) : null}
        {segment.excludedCustomAudienceIds.length > 0 ? (
          <div>
            <dt className="inline font-medium">Excluded audiences: </dt>
            <dd className="inline">{segment.excludedCustomAudienceIds.join(', ')}</dd>
          </div>
        ) : null}
        {segment.publisherPlatforms.length > 0 ? (
          <div>
            <dt className="inline font-medium">Platforms: </dt>
            <dd className="inline">{segment.publisherPlatforms.join(', ')}</dd>
          </div>
        ) : null}
        {segment.placements.length > 0 ? (
          <div>
            <dt className="inline font-medium">Placements: </dt>
            <dd className="inline">{segment.placements.join(', ')}</dd>
          </div>
        ) : null}
        {segment.devicePlatforms.length > 0 ? (
          <div>
            <dt className="inline font-medium">Devices: </dt>
            <dd className="inline">{segment.devicePlatforms.join(', ')}</dd>
          </div>
        ) : null}
      </dl>
    </li>
  );
}

function AudienceEvidence({
  audience,
  currency,
}: {
  audience: PaidCreativeAudienceEvidence | null;
  currency: string | null;
}) {
  if (!audience) return null;
  if (audience.coverage === 'unknown') {
    return <p className="mt-1 text-xs text-muted-foreground">Audience evidence unknown</p>;
  }

  const coverage = `${audience.coverage[0].toUpperCase()}${audience.coverage.slice(1)}`;
  return (
    <details className="mt-1 text-left text-xs">
      <summary className="cursor-pointer font-medium text-primary">
        Audience evidence: {coverage}
      </summary>
      <div className="mt-2 space-y-2 text-muted-foreground">
        <p>
          {audience.coveredAds} of {audience.eligibleAds} eligible ads
        </p>
        <p>
          {displayValue(audience.coveredSpend, 'currency', currency)} covered spend
          {audience.spendCoverage === null
            ? ''
            : ` (${formatValue(audience.spendCoverage, 'percent')})`}
        </p>
        <p>{temporalBasisLabel(audience.temporalBasis)}</p>
        {audience.label ? <p>{audience.label}</p> : null}
        {audience.source ? <p>Source: {audience.source}</p> : null}
        {audience.segments.length > 0 ? (
          <ul className="space-y-2">
            {audience.segments.map((segment) => (
              <SegmentEvidence key={segment.audienceCellId} segment={segment} currency={currency} />
            ))}
          </ul>
        ) : (
          <p>No measured audience segments supplied.</p>
        )}
      </div>
    </details>
  );
}

export function DataTableBlock({ block }: DataTableBlockProps) {
  const cardFields = block.render_mode === 'creative_cards' ? block.card_fields : null;
  const columnsByKey = new Map(block.columns.map((column) => [column.key, column]));

  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <h4 className="text-sm font-semibold text-foreground">{block.title}</h4>
        <EvidenceTooltip
          provenance={block.provenance}
          datasetId={block.dataset_id}
          evidenceRefs={block.evidence_refs}
        />
      </div>
      {cardFields ? (
        <ul
          aria-label={block.title}
          className="grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3"
        >
          {block.rows.map((row, rowIndex) => {
            const rowCurrency = currencyCode(block.row_meta?.[rowIndex]?.currency);
            const parsedAudience = paidCreativeAudienceEvidenceSchema.safeParse(
              block.row_meta?.[rowIndex]?.audience,
            );
            const audience = parsedAudience.success ? parsedAudience.data : null;
            const titleColumn = columnsByKey.get(cardFields.title);
            const title = displayValue(row[cardFields.title], titleColumn?.format, rowCurrency);
            const creativeColumn = columnsByKey.get(cardFields.creative);
            const creativeLabel = displayValue(
              row[cardFields.creative],
              creativeColumn?.format,
              rowCurrency,
            );
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
                            {displayValue(
                              row[cardFields.subtitle],
                              subtitleColumn?.format,
                              rowCurrency,
                            )}
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
                              <dd className="mt-0.5 text-sm font-medium tabular-nums text-foreground">
                                {displayValue(row[key], column?.format, rowCurrency)}
                                {key === 'audience_coverage' ? (
                                  <AudienceEvidence audience={audience} currency={rowCurrency} />
                                ) : null}
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
              {block.rows.map((row, rowIndex) => {
                const rowMeta = block.row_meta?.[rowIndex];
                // The entity's id, under its name in the first column. The cell
                // used to BE the id (`campaign-1202…`) because the Backend had no
                // name to put there; now that it does, the id still has to stay
                // reachable — it is what a user pastes into Ads Manager.
                const entityId =
                  typeof rowMeta?.entity_id === 'string' ? rowMeta.entity_id : null;
                const rowCurrency = currencyCode(rowMeta?.currency);
                const parsedAudience = paidCreativeAudienceEvidenceSchema.safeParse(
                  rowMeta?.audience,
                );
                const audience = parsedAudience.success ? parsedAudience.data : null;
                return (
                  <tr key={rowIndex} className="border-b border-border/30 last:border-0">
                    {block.columns.map((column, columnIndex) => {
                      const value = displayValue(row[column.key], column.format, rowCurrency);
                      const showEntityId = columnIndex === 0 && entityId !== null;
                      return (
                        <td
                          key={column.key}
                          className="px-3 py-2 tabular-nums"
                          style={{ textAlign: column.align ?? 'left' }}
                        >
                          {column.format === 'creative' ? (
                            <CreativeCell label={value} creative={rowMeta?.creative} />
                          ) : !column.format || column.format === 'text' ? (
                            <>
                              <MediaText>{value}</MediaText>
                              {showEntityId ? (
                                <span className="mt-0.5 block font-mono text-xs text-muted-foreground">
                                  {entityId}
                                </span>
                              ) : null}
                              {column.key === 'audience_coverage' ? (
                                <AudienceEvidence audience={audience} currency={rowCurrency} />
                              ) : null}
                            </>
                          ) : (
                            value
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
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

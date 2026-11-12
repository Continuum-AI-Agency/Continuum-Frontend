'use client';

import {
  type PaidCreativeAudienceEvidence,
  type PaidCreativeAudienceSegment,
  paidCreativeAudienceEvidenceSchema,
  paidCurrencyCodeSchema,
} from '@continuum/contracts';
import { useTranslations } from 'next-intl';
import { formatValue } from '@/lib/jaina/formatValue';
import type { DataTableBlockV2 } from '@/lib/jaina/schemas';
import { cn } from '@/lib/utils';
import { useAnswerLanguage } from '../answerLanguageContext';
import { JAINA_TABLE, JAINA_TYPE } from '../reading';
import { BlockHeading } from './BlockHeading';
import { CreativeCell } from './CreativeCell';
import { MediaText } from './mediaText';
import { JAINA_MODULE } from './modules';

type DataTableBlockProps = { block: DataTableBlockV2; isStreaming: boolean };

const currencyCode = (value: unknown): string | null => {
  const parsed = paidCurrencyCodeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

const displayValue = (
  value: string | number | null | undefined,
  format?: string | null,
  currency?: string | null,
  percentBasis?: 'fraction' | 'points' | null,
  reportLocale: string = 'en',
): string => {
  if (value == null) return '—';
  // Money, known currency or not, is the one rule's (formatValue → contracts formatMoney).
  return formatValue(value, format ?? undefined, {
    locale: reportLocale,
    ...(currency ? { currency } : {}),
    percentBasis: percentBasis ?? null,
  });
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
  const reportLocale = useAnswerLanguage();
  const uiText = useTranslations('scale');
  return (
    <li className="rounded-lg bg-background/70 p-2">
      <p className="font-medium text-foreground">{segment.audienceCellId}</p>
      <dl className="mt-1 grid gap-1 text-xs text-muted-foreground">
        <div>
          <dt className="inline font-medium">{uiText('observed_90cdbe9')}</dt>
          <dd className="inline">{segment.observedAt}</dd>
        </div>
        <div>
          <dt className="inline font-medium">{uiText('evidence_e56d516')}</dt>
          <dd className="inline">
            {uiText.rich('sentence_5e467a009e20', {
              count: segment.eligibleAds,
              spend: displayValue(segment.spend, 'currency', currency, undefined, reportLocale),
              hasShare: segment.spendShare === null ? 'no' : 'yes',
              share:
                segment.spendShare === null
                  ? ''
                  : formatValue(segment.spendShare, 'percent', { locale: reportLocale }),
            })}
          </dd>
        </div>
        {segment.ageMin !== null || segment.ageMax !== null ? (
          <div>
            <dt className="inline font-medium">{uiText('age_f45aa5a')}</dt>
            <dd className="inline">
              {segment.ageMin ?? uiText('unknown_b23a6a8')}–
              {segment.ageMax ?? uiText('unknown_b23a6a8')}
            </dd>
          </div>
        ) : null}
        {segment.genders.length > 0 ? (
          <div>
            <dt className="inline font-medium">{uiText('gender_codes_592e162')}</dt>
            <dd className="inline">{segment.genders.join(', ')}</dd>
          </div>
        ) : null}
        {segment.geoNodeIds.length > 0 ? (
          <div>
            <dt className="inline font-medium">{uiText('geographies_c0ee627')}</dt>
            <dd className="inline">{segment.geoNodeIds.join(', ')}</dd>
          </div>
        ) : null}
        {segment.customAudienceIds.length > 0 ? (
          <div>
            <dt className="inline font-medium">{uiText('custom_audiences_3d6cecf')}</dt>
            <dd className="inline">{segment.customAudienceIds.join(', ')}</dd>
          </div>
        ) : null}
        {segment.excludedCustomAudienceIds.length > 0 ? (
          <div>
            <dt className="inline font-medium">{uiText('excluded_audiences_9626dba')}</dt>
            <dd className="inline">{segment.excludedCustomAudienceIds.join(', ')}</dd>
          </div>
        ) : null}
        {segment.publisherPlatforms.length > 0 ? (
          <div>
            <dt className="inline font-medium">{uiText('platforms_8a1efd6')}</dt>
            <dd className="inline">{segment.publisherPlatforms.join(', ')}</dd>
          </div>
        ) : null}
        {segment.placements.length > 0 ? (
          <div>
            <dt className="inline font-medium">{uiText('placements_021525b')}</dt>
            <dd className="inline">{segment.placements.join(', ')}</dd>
          </div>
        ) : null}
        {segment.devicePlatforms.length > 0 ? (
          <div>
            <dt className="inline font-medium">{uiText('devices_4b233bc')}</dt>
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
  const reportLocale = useAnswerLanguage();
  const uiText = useTranslations('scale');
  if (!audience) return null;
  if (audience.coverage === 'unknown') {
    return (
      <p className="mt-1 text-xs text-muted-foreground">
        {uiText('audience_evidence_unknown_02f2068')}
      </p>
    );
  }

  const coverage = `${audience.coverage[0].toUpperCase()}${audience.coverage.slice(1)}`;
  return (
    <details className="mt-1 text-left text-xs">
      <summary className="cursor-pointer font-medium text-primary-ink">
        {uiText.rich('sentence_d8976db7c984', { v0: coverage })}
      </summary>
      <div className="mt-2 space-y-2 text-muted-foreground">
        <p>
          {uiText.rich('sentence_4c638c02a23f', {
            v0: audience.coveredAds,
            v1: audience.eligibleAds,
          })}
        </p>
        <p>
          {uiText.rich('sentence_646db32c516a', {
            v0: displayValue(audience.coveredSpend, 'currency', currency, undefined, reportLocale),
            v1:
              audience.spendCoverage === null
                ? ''
                : ` (${formatValue(audience.spendCoverage, 'percent', { locale: reportLocale })})`,
          })}
        </p>
        <p>{temporalBasisLabel(audience.temporalBasis)}</p>
        {audience.label ? <p>{audience.label}</p> : null}
        {audience.source ? (
          <p>{uiText.rich('sentence_39489fc9d95e', { v0: audience.source })}</p>
        ) : null}
        {audience.segments.length > 0 ? (
          <ul className="space-y-2">
            {audience.segments.map((segment) => (
              <SegmentEvidence key={segment.audienceCellId} segment={segment} currency={currency} />
            ))}
          </ul>
        ) : (
          <p>{uiText('no_measured_audience_segments_supplied_5aee7de')}</p>
        )}
      </div>
    </details>
  );
}

export function DataTableBlock({ block }: DataTableBlockProps) {
  const reportLocale = useAnswerLanguage();
  const cardFields = block.render_mode === 'creative_cards' ? block.card_fields : null;
  const columnsByKey = new Map(block.columns.map((column) => [column.key, column]));

  // A table is one neutral module; creative cards are each their own module, so the block
  // around them takes no fill.
  return (
    <div
      className={cardFields ? undefined : JAINA_MODULE.neutral}
      data-jaina-module={cardFields ? undefined : 'block'}
    >
      <BlockHeading
        title={block.title}
        provenance={block.provenance}
        datasetId={block.dataset_id}
        evidenceRefs={block.evidence_refs}
      />
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
            const title = displayValue(
              row[cardFields.title],
              titleColumn?.format,
              rowCurrency,
              titleColumn?.percent_basis,
              reportLocale,
            );
            const creativeColumn = columnsByKey.get(cardFields.creative);
            const creativeLabel = displayValue(
              row[cardFields.creative],
              creativeColumn?.format,
              rowCurrency,
              undefined,
              reportLocale,
            );
            const subtitleColumn = cardFields.subtitle
              ? columnsByKey.get(cardFields.subtitle)
              : undefined;

            return (
              <li key={rowIndex}>
                <article
                  aria-label={title}
                  className="h-full overflow-hidden rounded-xl bg-muted/40"
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
                              subtitleColumn?.percent_basis,
                              reportLocale,
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
                              <dt
                                className={cn('truncate text-muted-foreground', JAINA_TYPE.label)}
                              >
                                {column?.label ?? key}
                              </dt>
                              <dd className={cn('mt-0.5 text-foreground', JAINA_TYPE.figure)}>
                                {displayValue(
                                  row[key],
                                  column?.format,
                                  rowCurrency,
                                  column?.percent_basis,
                                  reportLocale,
                                )}
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
        <div className={JAINA_TABLE.wrap}>
          <table className={JAINA_TABLE.table}>
            <thead>
              <tr className={JAINA_TABLE.headRow}>
                {block.columns.map((column) => (
                  <th
                    key={column.key}
                    className={cn(JAINA_TABLE.th, `text-${column.align ?? 'left'}`)}
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
                const entityId = typeof rowMeta?.entity_id === 'string' ? rowMeta.entity_id : null;
                const rowCurrency = currencyCode(rowMeta?.currency);
                const parsedAudience = paidCreativeAudienceEvidenceSchema.safeParse(
                  rowMeta?.audience,
                );
                const audience = parsedAudience.success ? parsedAudience.data : null;
                return (
                  <tr key={rowIndex} className={JAINA_TABLE.row}>
                    {block.columns.map((column, columnIndex) => {
                      const value = displayValue(
                        row[column.key],
                        column.format,
                        rowCurrency,
                        undefined,
                        reportLocale,
                      );
                      const showEntityId = columnIndex === 0 && entityId !== null;
                      return (
                        <td
                          key={column.key}
                          className={JAINA_TABLE.td}
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
        <p className={cn('mt-1.5 italic text-muted-foreground/70', JAINA_TYPE.table)}>
          {block.notes}
        </p>
      )}
    </div>
  );
}

export default DataTableBlock;

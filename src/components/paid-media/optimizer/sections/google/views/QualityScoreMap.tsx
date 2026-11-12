'use client';

import { useLocale, useTranslations } from 'next-intl';

// The Quality Score map (P6 view 5): where the spend sits on the 1–10 scale, the waste said
// first as money, then each keyword with its three components. Read-only; a low-score keyword's
// action is the Optimizer's G11 card.

import { G11_MAX_QUALITY_SCORE, type GoogleKeywordQualityRead } from '@continuum/contracts';
import {
  type InsightColumn,
  InsightDataTable,
} from '@/components/dashboard/datatable/InsightDataTable';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ChartEmpty } from '../../../charts/ChartStates';
import { currencyColumnSuffix, formatCurrency, formatCurrencyInColumn } from '../../../format';
import { windowRangeLabel } from '../../platforms/googleAdsOverviewModel';
import {
  type GoogleReadTarget,
  type GoogleReadWindow,
  useGoogleKeywordQuality,
} from '../googleReads';
import { reasonsOf } from './cell';
import {
  buildQualityScoreMap,
  type QsBand,
  type QsRow,
  type QualityScoreMapModel,
} from './qualityScoreModel';
import { CellText, ReadGate, ReasonNotes, ScopeLine, type ViewRead, viewRead } from './viewParts';

const BAND_TONE: Record<QsBand, string> = {
  low: 'bg-destructive/70',
  mid: 'bg-warning/70',
  high: 'bg-success/70',
};

function ScoreBars({ model, currency }: { model: QualityScoreMapModel; currency: string | null }) {
  const uiText = useTranslations('scale');

  const uiLocale = useLocale();
  const top = Math.max(...model.buckets.map((bucket) => bucket.spend), 1);
  const label = model.buckets
    .filter((bucket) => bucket.keywords > 0)
    .map(
      (bucket) =>
        `Quality Score ${bucket.score}: ${bucket.keywords} keywords, ${formatCurrency(bucket.spend, currency, uiLocale)}`,
    )
    .join('; ');
  return (
    <div className="space-y-1">
      <ol
        aria-label={uiText('template_25d8cc4a497c', { v0: label })}
        className="grid h-16 grid-cols-10 items-end gap-1"
        data-testid="qs-bars"
        role="img"
      >
        {model.buckets.map((bucket) => (
          <li
            className={cn('min-h-px rounded-t-sm', BAND_TONE[bucket.band])}
            data-score={bucket.score}
            key={bucket.score}
            style={{ height: `${(bucket.spend / top) * 100}%` }}
          />
        ))}
      </ol>
      <ol aria-hidden className="grid grid-cols-10 gap-1 text-center text-muted-foreground text-xs">
        {model.buckets.map((bucket) => (
          <li key={bucket.score}>{bucket.score}</li>
        ))}
      </ol>
    </div>
  );
}

function QualityScoreBody({
  read,
  currency,
}: {
  read: GoogleKeywordQualityRead;
  currency: string | null;
}) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  function columns(currency: string | null): InsightColumn<QsRow>[] {
    return [
      {
        id: 'keyword',
        header: uiText('keyword_a668022'),
        cell: (row) => (
          <span className="block min-w-40">
            <span className="flex items-center gap-1.5">
              <span className="font-medium">{row.keyword}</span>
              {row.waste ? (
                <Badge data-testid="qs-waste" variant="destructive">
                  {uiText('waste_f734f9b')}
                </Badge>
              ) : null}
            </span>
            <span className="block text-muted-foreground text-xs">
              {row.matchType} · {row.where}
            </span>
          </span>
        ),
      },
      {
        id: 'score',
        header: 'QS',
        align: 'right',
        sortValue: (row) => Number(row.score.text) || 0,
        cell: (row) => <CellText cell={row.score} />,
      },
      {
        id: 'ctr',
        header: uiText('exp_ctr_e0bfe7e'),
        cell: (row) => <CellText cell={row.expectedCtr} />,
      },
      {
        id: 'relevance',
        header: uiText('ad_relevance_9013bb4'),
        cell: (row) => <CellText cell={row.adRelevance} />,
      },
      {
        id: 'landing',
        header: uiText('landing_page_615e54d'),
        cell: (row) => <CellText cell={row.landingPage} />,
      },
      {
        id: 'spend',
        header: uiText('helper_ffca96014e32', {
          v0: currencyColumnSuffix(currency),
        }),
        align: 'right',
        sortValue: (row) => row.spend,
        cell: (row) => formatCurrencyInColumn(row.spend, currency, uiLocale),
      },
      {
        id: 'conversions',
        header: uiText('conv_d3875d6'),
        align: 'right',
        cell: (row) => <CellText cell={row.conversions} />,
      },
    ];
  }

  const model = buildQualityScoreMap(read, uiLocale, uiText);
  if (model.rows.length === 0) {
    return <ChartEmpty message={uiText('no_keyword_spent_in_this_window_performance_m_3eaae4c')} />;
  }
  const reasons = reasonsOf([
    model.average,
    ...model.rows.flatMap((row) => [
      row.score,
      row.expectedCtr,
      row.adRelevance,
      row.landingPage,
      row.conversions,
    ]),
  ]);
  return (
    <div className="space-y-3">
      <ScopeLine>
        {uiText.rich('sentence_00b921f85fd2', {
          v0: windowRangeLabel(read.range.since, read.range.until, uiLocale),
          v1: model.total,
          v2: model.scored,
          v3: () => <CellText cell={model.average} />,
        })}
      </ScopeLine>
      <p className="text-sm" data-testid="qs-waste-line">
        {model.waste === null ? (
          <>{uiText('waste_can_t_be_told_on_this_account_low_score_303ea70')}</>
        ) : model.waste.keywords > 0 ? (
          <>
            {uiText.rich('sentence_06efc00e6174', {
              spend: () => (
                <span className="font-semibold tabular-nums">
                  {formatCurrency(model.waste?.spend ?? null, currency, uiLocale)}
                </span>
              ),
              count: model.waste.keywords,
              score: G11_MAX_QUALITY_SCORE,
            })}
          </>
        ) : (
          <>
            {uiText.rich('sentence_93a1ef5f9a81', {
              v0: G11_MAX_QUALITY_SCORE,
            })}
          </>
        )}
      </p>
      <ScoreBars currency={currency} model={model} />
      {model.unscored.keywords > 0 ? (
        <p className="text-muted-foreground text-xs" data-testid="qs-unscored">
          {uiText.rich('sentence_befacadea6a8', {
            count: model.unscored.keywords,
            spend: formatCurrency(model.unscored.spend, currency, uiLocale),
          })}
        </p>
      ) : null}
      <InsightDataTable
        columns={columns(currency)}
        defaultSort={{ columnId: 'spend', direction: 'desc' }}
        getRowId={(row) => row.id}
        rows={model.rows}
      />
      {model.hiddenRows > 0 ? (
        <p className="text-muted-foreground text-xs">
          {uiText.rich('sentence_dd24c2392672', {
            v0: model.rows.length,
            v1: model.hiddenRows,
          })}
        </p>
      ) : null}
      <ReasonNotes reasons={reasons} />
    </div>
  );
}

export function QualityScoreMapView({
  read,
  currency,
}: {
  read: ViewRead<GoogleKeywordQualityRead>;
  currency: string | null;
}) {
  return (
    <ReadGate read={read}>
      {(data) => <QualityScoreBody currency={data.currency ?? currency} read={data} />}
    </ReadGate>
  );
}

export function QualityScoreMap({
  currency,
  window,
  ...target
}: GoogleReadTarget & { currency: string | null; window: GoogleReadWindow }) {
  const query = useGoogleKeywordQuality({ ...target, window });
  return <QualityScoreMapView currency={currency} read={viewRead(query)} />;
}

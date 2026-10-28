'use client';

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
  const top = Math.max(...model.buckets.map((bucket) => bucket.spend), 1);
  const label = model.buckets
    .filter((bucket) => bucket.keywords > 0)
    .map(
      (bucket) =>
        `Quality Score ${bucket.score}: ${bucket.keywords} keywords, ${formatCurrency(bucket.spend, currency)}`,
    )
    .join('; ');
  return (
    <div className="space-y-1">
      <ol
        aria-label={`Spend by Quality Score. ${label}`}
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

function columns(currency: string | null): InsightColumn<QsRow>[] {
  return [
    {
      id: 'keyword',
      header: 'Keyword',
      cell: (row) => (
        <span className="block min-w-40">
          <span className="flex items-center gap-1.5">
            <span className="font-medium">{row.keyword}</span>
            {row.waste ? (
              <Badge data-testid="qs-waste" variant="destructive">
                Waste
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
    { id: 'ctr', header: 'Exp. CTR', cell: (row) => <CellText cell={row.expectedCtr} /> },
    { id: 'relevance', header: 'Ad relevance', cell: (row) => <CellText cell={row.adRelevance} /> },
    { id: 'landing', header: 'Landing page', cell: (row) => <CellText cell={row.landingPage} /> },
    {
      id: 'spend',
      header: `Spend${currencyColumnSuffix(currency)}`,
      align: 'right',
      sortValue: (row) => row.spend,
      cell: (row) => formatCurrencyInColumn(row.spend, currency),
    },
    {
      id: 'conversions',
      header: 'Conv.',
      align: 'right',
      cell: (row) => <CellText cell={row.conversions} />,
    },
  ];
}

function QualityScoreBody({
  read,
  currency,
}: {
  read: GoogleKeywordQualityRead;
  currency: string | null;
}) {
  const model = buildQualityScoreMap(read);
  if (model.rows.length === 0) {
    return (
      <ChartEmpty message="No keyword spent in this window. Performance Max, Display and Video campaigns have no keywords." />
    );
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
        {windowRangeLabel(read.range.since, read.range.until)} · the {model.total} keywords that
        spent most · {model.scored} scored · average Quality Score <CellText cell={model.average} />
      </ScopeLine>
      <p className="text-sm" data-testid="qs-waste-line">
        {model.waste === null ? (
          <>
            Waste can't be told on this account: low-score keywords are listed, but its conversions
            aren't counted.
          </>
        ) : model.waste.keywords > 0 ? (
          <>
            <span className="font-semibold tabular-nums">
              {formatCurrency(model.waste.spend, currency)}
            </span>{' '}
            on {model.waste.keywords} {model.waste.keywords === 1 ? 'keyword' : 'keywords'} at
            Quality Score ≤ {G11_MAX_QUALITY_SCORE} with no conversion.
          </>
        ) : (
          <>No keyword at Quality Score ≤ {G11_MAX_QUALITY_SCORE} spent without a conversion.</>
        )}
      </p>
      <ScoreBars currency={currency} model={model} />
      {model.unscored.keywords > 0 ? (
        <p className="text-muted-foreground text-xs" data-testid="qs-unscored">
          {model.unscored.keywords} {model.unscored.keywords === 1 ? 'keyword' : 'keywords'} not
          scored yet ({formatCurrency(model.unscored.spend, currency)}): too little traffic for
          Google to score.
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
          Showing the {model.rows.length} that spent most; {model.hiddenRows} more were read.
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

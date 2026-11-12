'use client';

import { useLocale, useTranslations } from 'next-intl';

// Manage → Attribution (frontend.html §4, decisiones 20): what this portfolio counts its
// results with. Three sources, as hairline-separated rows — each platform's own (the default), GA4, the client's spreadsheet —
// with the one in use marked. The spreadsheet card carries its last read, its coverage, its
// last error, "Re-read now", and the setup flow. Reads come from optimizer_get_portfolio_metrics
// (configured / used / conversions_by_source), so the card and the detail header agree.

import type { AttributionKind, SheetSyncReport } from '@continuum/contracts';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  type PortfolioMetricsState,
  useInvalidatePortfolioMetrics,
  usePortfolioMetrics,
} from '../detail/usePortfolioMetrics';
import {
  capsHoldNonMetaMember,
  usePortfolioPlatformCaps,
} from '../platformCaps/usePortfolioPlatformCaps';
import { MultiPlatformUnavailable } from '../platforms/MultiPlatformUnavailable';
import {
  attributionCopy,
  attributionSourceName,
  configuredSource,
  coverageBarExplanation,
  formatAttributionPercent,
  formatReadAge,
  matchCheckLine,
} from './attributionModel';
import { SheetSetupFlow } from './SheetSetupFlow';
import { type SheetAttributionApi, sheetAttributionApi } from './sheetAttributionApi';

const CARD_COPY: Record<AttributionKind, string> = {
  platform:
    'Meta counts with its pixel and lead forms, Google with its conversions. Each platform is judged by its own count.',
  ga4: "One count for every platform, by source and medium. GA4 arrives 24–48 h late: the Optimizer moves money with the platform's count and reports with GA4.",
  spreadsheet:
    'A sheet with a date, an ad set or campaign, and a conversions count, read every morning. For clients who count leads in their CRM.',
};

type ResyncState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'done'; report: SheetSyncReport }
  | { status: 'unavailable' }
  | { status: 'error'; message: string };

function SourceCard({
  kind,
  inUse,
  children,
}: {
  kind: AttributionKind;
  inUse: boolean;
  children?: React.ReactNode;
}) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  return (
    <div
      className={cn('space-y-1.5 px-3 py-2.5', inUse && 'rounded-md bg-primary/10')}
      data-in-use={inUse}
      data-kind={kind}
      data-testid="attribution-card"
    >
      <p
        className={cn(
          'flex flex-wrap items-center gap-2 font-medium text-xs',
          inUse && 'text-primary-ink',
        )}
      >
        {attributionSourceName(kind, uiText)}
        {kind === 'platform' ? (
          <span className="text-muted-foreground">{uiText('default_37a8eec')}</span>
        ) : null}
        {inUse ? (
          <span className="font-normal text-primary-ink">{uiText('in_use_11cc6e9')}</span>
        ) : null}
      </p>
      <p className="text-muted-foreground text-xs">{attributionCopy(CARD_COPY[kind], uiText)}</p>
      {children}
    </div>
  );
}

export function AttributionSectionView({
  brandId,
  portfolioId,
  metricsState,
  api,
  now,
  onSourceChanged,
  nonMetaMember = false,
}: {
  brandId: string;
  portfolioId: string;
  metricsState: PortfolioMetricsState;
  api: SheetAttributionApi;
  now: Date;
  onSourceChanged: () => void;
  /** Known, from another read, to hold a member off Meta. A Meta-only portfolio gets no note. */
  nonMetaMember?: boolean;
}) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const [settingUp, setSettingUp] = useState(false);
  const [resync, setResync] = useState<ResyncState>({ status: 'idle' });
  const metrics = metricsState.status === 'ready' ? metricsState.metrics : null;
  const configured = metrics?.attribution.configured ?? 'platform';
  const used = metrics?.attribution.used ?? 'platform';
  const sheet =
    metrics && configured === 'spreadsheet'
      ? configuredSource(metrics)
      : (metrics?.conversions_by_source.find((row) => row.kind === 'spreadsheet') ?? null);

  async function rereadNow() {
    setResync({ status: 'running' });
    const outcome = await api.sync(portfolioId, null);
    if (outcome.status === 'ready') {
      setResync({ status: 'done', report: outcome.data });
      onSourceChanged();
    } else if (outcome.status === 'unavailable') setResync({ status: 'unavailable' });
    else setResync({ status: 'error', message: outcome.message });
  }

  return (
    <div className="space-y-2" data-testid="attribution-section">
      {metricsState.status === 'unavailable' && nonMetaMember ? (
        <MultiPlatformUnavailable
          detail={attributionCopy(
            "The source in use can't be read yet; results use each platform's own count.",
            uiText,
          )}
        />
      ) : null}
      <div className="divide-y divide-border/60">
        <SourceCard inUse={used === 'platform'} kind="platform" />
        <SourceCard inUse={used === 'ga4'} kind="ga4">
          {configured !== 'ga4' ? (
            <p className="text-muted-foreground text-xs" data-testid="ga4-unavailable">
              {uiText('choosing_ga4_isn_t_available_yet_86c712a')}
            </p>
          ) : null}
        </SourceCard>
        <SourceCard inUse={used === 'spreadsheet'} kind="spreadsheet">
          {sheet ? (
            <div className="space-y-1 text-xs" data-testid="sheet-status">
              <p>
                {uiText('attributionSheetStatus', {
                  age:
                    formatReadAge(sheet.refreshed_at, now, uiLocale, uiText) ??
                    uiText('attributionNever'),
                  percentage: formatAttributionPercent(sheet.coverage_pct, uiLocale),
                })}
              </p>
              {sheet.error ? (
                <p className="text-destructive" data-testid="sheet-error">
                  {attributionCopy(
                    'The last read failed. Check the sheet connection and try again.',
                    uiText,
                  )}
                </p>
              ) : null}
              {configured === 'spreadsheet' && used !== 'spreadsheet' ? (
                <p className="text-muted-foreground" data-testid="sheet-fallback">
                  {uiText.rich('sentence_801485215264', {
                    v0: coverageBarExplanation(uiText, uiLocale),
                  })}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">{uiText('not_set_up_81e0b57')}</p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {sheet ? (
              <Button
                disabled={resync.status === 'running'}
                onClick={() => void rereadNow()}
                size="sm"
                type="button"
                variant="secondary"
              >
                {uiText('re_read_now_ca3ac49')}
              </Button>
            ) : null}
            {!settingUp ? (
              <Button onClick={() => setSettingUp(true)} size="sm" type="button" variant="outline">
                {sheet ? uiText('change_the_sheet_17e474d') : uiText('connect_a_sheet_db7dd60')}
              </Button>
            ) : null}
          </div>
          {resync.status === 'done' ? (
            <p className="text-xs" data-testid="sheet-resync-result">
              {uiText.rich('sentence_802b92a102d0', {
                v0: matchCheckLine(resync.report, 'adset_name', uiText, uiLocale),
              })}
            </p>
          ) : null}
          {resync.status === 'unavailable' ? (
            <p className="text-muted-foreground text-xs" data-testid="sheet-resync-unavailable">
              {uiText('re_reading_isn_t_available_yet_2c20558')}
            </p>
          ) : null}
          {resync.status === 'error' ? (
            <p className="text-destructive text-xs" role="alert">
              {attributionCopy(
                'The spreadsheet request could not be completed. Check the connection and try again.',
                uiText,
              )}
            </p>
          ) : null}
        </SourceCard>
      </div>
      {settingUp ? (
        <SheetSetupFlow
          api={api}
          brandId={brandId}
          onCancel={() => setSettingUp(false)}
          onSaved={() => {
            setSettingUp(false);
            onSourceChanged();
          }}
          portfolioId={portfolioId}
        />
      ) : null}
      <p className="text-muted-foreground text-xs">
        {uiText('a_change_of_source_is_logged_in_activity_as_a_fbc75b7')}
      </p>
    </div>
  );
}

export function AttributionSection({
  brandId,
  portfolioId,
}: {
  brandId: string;
  portfolioId: string;
}) {
  const metricsState = usePortfolioMetrics(portfolioId);
  const invalidate = useInvalidatePortfolioMetrics(portfolioId);
  const caps = usePortfolioPlatformCaps(portfolioId);
  return (
    <AttributionSectionView
      api={sheetAttributionApi}
      brandId={brandId}
      metricsState={metricsState}
      nonMetaMember={capsHoldNonMetaMember(caps)}
      now={new Date()}
      onSourceChanged={invalidate}
      portfolioId={portfolioId}
    />
  );
}

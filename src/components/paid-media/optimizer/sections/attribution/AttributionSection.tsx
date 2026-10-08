'use client';

// Manage → Attribution (frontend.html §4, decisiones 20): what this portfolio counts its
// results with. Three cards — each platform's own (the default), GA4, the client's spreadsheet —
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
  attributionSourceName,
  COVERAGE_BAR_EXPLAINED,
  configuredSource,
  formatReadAge,
  matchCheckLine,
} from './attributionModel';
import { SheetSetupFlow } from './SheetSetupFlow';
import { type SheetAttributionApi, sheetAttributionApi } from './sheetAttributionApi';

const CARD_COPY: Record<AttributionKind, string> = {
  platform:
    'Meta counts with its pixel and lead forms, Google with its conversions, TikTok with its pixel. Each platform is judged by its own count.',
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
  return (
    <div
      className={cn(
        'space-y-1.5 rounded-md border p-3',
        inUse ? 'border-primary/60 bg-primary/5' : 'border-border/60',
      )}
      data-in-use={inUse}
      data-kind={kind}
      data-testid="attribution-card"
    >
      <p className="flex flex-wrap items-center gap-2 font-medium text-xs">
        {attributionSourceName(kind)}
        {kind === 'platform' ? <span className="text-muted-foreground">default</span> : null}
        {inUse ? (
          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-primary">in use</span>
        ) : null}
      </p>
      <p className="text-muted-foreground text-xs">{CARD_COPY[kind]}</p>
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
        <MultiPlatformUnavailable detail="The source in use can't be read yet; results use each platform's own count." />
      ) : null}
      <div className="grid gap-2 sm:grid-cols-3">
        <SourceCard inUse={used === 'platform'} kind="platform" />
        <SourceCard inUse={used === 'ga4'} kind="ga4">
          {configured !== 'ga4' ? (
            <p className="text-muted-foreground text-xs" data-testid="ga4-unavailable">
              Choosing GA4 isn't available yet.
            </p>
          ) : null}
        </SourceCard>
        <SourceCard inUse={used === 'spreadsheet'} kind="spreadsheet">
          {sheet ? (
            <div className="space-y-1 text-xs" data-testid="sheet-status">
              <p>
                Last read {formatReadAge(sheet.refreshed_at, now) ?? 'never'} ·{' '}
                {Math.round(sheet.coverage_pct * 100)}% covered
              </p>
              {sheet.error ? (
                <p className="text-destructive" data-testid="sheet-error">
                  The last read failed: {sheet.error}
                </p>
              ) : null}
              {configured === 'spreadsheet' && used !== 'spreadsheet' ? (
                <p className="text-muted-foreground" data-testid="sheet-fallback">
                  Not in use right now. {COVERAGE_BAR_EXPLAINED}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">Not set up.</p>
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
                Re-read now
              </Button>
            ) : null}
            {!settingUp ? (
              <Button onClick={() => setSettingUp(true)} size="sm" type="button" variant="outline">
                {sheet ? 'Change the sheet' : 'Connect a sheet'}
              </Button>
            ) : null}
          </div>
          {resync.status === 'done' ? (
            <p className="text-xs" data-testid="sheet-resync-result">
              Read just now · {matchCheckLine(resync.report, 'adset_name')}
            </p>
          ) : null}
          {resync.status === 'unavailable' ? (
            <p className="text-muted-foreground text-xs" data-testid="sheet-resync-unavailable">
              Re-reading isn't available yet.
            </p>
          ) : null}
          {resync.status === 'error' ? (
            <p className="text-destructive text-xs" role="alert">
              {resync.message}
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
        A change of source is logged in Activity as a settings row and is not undone with a button.
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

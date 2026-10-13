'use client';

// The Scale / Iterate / Kill calls for the (unlinked) paid dashboard. The Scale bar's view of
// the same calls is Creative Insights, which adds the account's angles above them; both render
// the one VerdictColumns component so the two cannot drift. The win-rate category table lives
// in WhatsWorkingExplorerPopover.

import { useMemo, useState } from 'react';
import { useAdAccountCurrency } from '@/components/paid-media/optimizer/useOptimizerData';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePaidCreativeRecovery } from '@/hooks/usePaidCreativeRecovery';
import { usePaidCreativeReport } from '@/hooks/usePaidCreativeReport';
import { loadFailureMessage } from '@/lib/api/loadFailure';
import { VerdictColumns } from './VerdictColumns';
import { WhatsWorkingSynopsis } from './WhatsWorkingSynopsis';
import { FUNNEL_TABS, type FunnelTab, selectVerdictsByKind } from './whatsWorkingModel';

export function WhatsWorkingAdsCard({
  brandId,
  adAccountId,
}: {
  brandId: string;
  adAccountId: string | null;
}) {
  const { status, report, isLoading, isError, error, refetch } = usePaidCreativeReport(brandId);
  const [funnel, setFunnel] = useState<FunnelTab>('all');
  const { freshUrlById, recover } = usePaidCreativeRecovery({ brandId, adAccountId });
  const currency = useAdAccountCurrency(brandId, adAccountId);

  const verdictsByKind = useMemo(() => selectVerdictsByKind(report, funnel), [report, funnel]);

  // A read that failed is not a report still assembling: say so, and offer the read again.
  if (isError && !report) {
    return (
      <section className="space-y-1">
        <h3 className="font-semibold text-foreground text-sm">Ads</h3>
        <p
          className="text-destructive-ink text-xs"
          data-testid="creative-intelligence-error"
          role="alert"
        >
          {loadFailureMessage('creative intelligence', error)}{' '}
          <Button
            className="h-5 px-1 text-xs"
            onClick={() => void refetch()}
            size="sm"
            type="button"
            variant="link"
          >
            Retry
          </Button>
        </p>
      </section>
    );
  }

  if (status === 'assembling' && !report) {
    return (
      <section className="space-y-1">
        <h3 className="font-semibold text-foreground text-sm">Ads</h3>
        <p className="text-muted-foreground text-xs">
          {isLoading
            ? 'Loading creative intelligence…'
            : 'Analyzing your ad creatives — verdicts appear after the first sync completes.'}
        </p>
      </section>
    );
  }

  if (status === 'empty' || !report) {
    return (
      <section className="space-y-1">
        <h3 className="font-semibold text-foreground text-sm">Ads</h3>
        <p className="text-muted-foreground text-xs">
          No labeled ads with enough spend yet. Verdicts appear once ads clear the evidence floors
          (50 in spend, 3,000 impressions).
        </p>
      </section>
    );
  }

  return (
    <section className="@container/ci space-y-3">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-foreground text-sm">
          Ads
          <span className="ml-2 font-normal text-xs text-muted-foreground">
            hover a row for the creative and the reasoning
          </span>
        </p>
        <Tabs onValueChange={(value) => setFunnel(value as FunnelTab)} value={funnel}>
          <TabsList className="h-7">
            {FUNNEL_TABS.map((tab) => (
              <TabsTrigger className="px-2 text-xs uppercase" key={tab} value={tab}>
                {tab}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </header>

      <WhatsWorkingSynopsis synopsis={report.synopsis} />

      <VerdictColumns
        currency={currency}
        freshUrlById={freshUrlById}
        onRecover={recover}
        verdictsByKind={verdictsByKind}
      />
    </section>
  );
}

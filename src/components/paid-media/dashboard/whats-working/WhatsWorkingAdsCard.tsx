'use client';

import { useTranslations } from 'next-intl';

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
  const uiText = useTranslations('scale');
  const { status, report, isLoading, isError, error, refetch } = usePaidCreativeReport(brandId);
  const [funnel, setFunnel] = useState<FunnelTab>('all');
  const { freshUrlById, recover } = usePaidCreativeRecovery({ brandId, adAccountId });
  const currency = useAdAccountCurrency(brandId, adAccountId);

  const verdictsByKind = useMemo(() => selectVerdictsByKind(report, funnel), [report, funnel]);

  // A read that failed is not a report still assembling: say so, and offer the read again.
  if (isError && !report) {
    return (
      <section className="space-y-1">
        <h3 className="font-semibold text-foreground text-sm">{uiText('ads_9210f3b')}</h3>
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
            {uiText('retry_942087c')}
          </Button>
        </p>
      </section>
    );
  }

  if (status === 'assembling' && !report) {
    return (
      <section className="space-y-1">
        <h3 className="font-semibold text-foreground text-sm">{uiText('ads_9210f3b')}</h3>
        <p className="text-muted-foreground text-xs">
          {isLoading
            ? uiText('loading_creative_intelligence_7089eaf')
            : uiText('analyzing_your_ad_creatives_verdicts_appear_a_a8861a2')}
        </p>
      </section>
    );
  }

  if (status === 'empty' || !report) {
    return (
      <section className="space-y-1">
        <h3 className="font-semibold text-foreground text-sm">{uiText('ads_9210f3b')}</h3>
        <p className="text-muted-foreground text-xs">
          {uiText('no_labeled_ads_with_enough_spend_yet_verdicts_34733ae')}
        </p>
      </section>
    );
  }

  return (
    <section className="@container/ci space-y-3">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-foreground text-sm">
          {uiText.rich('sentence_3ca8b50578e9', {
            v0: () => (
              <span className="ml-2 font-normal text-xs text-muted-foreground">
                {uiText('hover_a_row_for_the_creative_and_the_reasonin_2715558')}
              </span>
            ),
          })}
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

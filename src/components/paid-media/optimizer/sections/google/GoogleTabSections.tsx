'use client';
import { useLocale, useTranslations } from 'next-intl';
import { googleCopy } from './googlePresentation';

// The Google tab's parity sections (P6 ideas 1, 3 and 7), under the tab's own read: cost per
// conversion by campaign type against the portfolio CPA goal, the campaign explorer with its
// detail sheet, and the bidding panel. One window for the three, 14 or 30 complete days: the
// goal is judged on volume, and the tab's 7 days are too few conversions for most campaigns.

import type { GoogleResultBucket } from '@continuum/contracts';
import { useState } from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useOptimizerPlatformCards } from '../../useOptimizerData';
import { completeDaysWindow, windowRangeLabel } from '../platforms/googleAdsOverviewModel';
import { ACCOUNT_READ_TITLE, AccountReadByType } from './AccountReadByType';
import { BIDDING_TITLE, BiddingPanel } from './BiddingPanel';
import { CampaignExplorer, EXPLORER_TITLE } from './CampaignExplorer';
import {
  biddingViews,
  campaignViews,
  changeHistoryWindow,
  type HistoryRead,
  typeRows,
} from './campaignExplorerModel';
import { GoogleCampaignDetail, useGoogleCampaignParam } from './GoogleCampaignDetail';
import { GoogleSection } from './GoogleSection';
import { useGoogleCampaigns, useGoogleChangeHistory } from './googleReads';
import { useGoogleCampaignGoals } from './useGoogleCampaignGoals';

const WINDOWS = [14, 30] as const;
type WindowDays = (typeof WINDOWS)[number];

export function GoogleTabSections({
  brandId,
  customerId,
  currency,
  resultBucket = null,
}: {
  brandId: string;
  customerId: string;
  currency: string | null;
  /** The portfolios' goal result the tab counts (useGoogleAdsOverview); null when none. */
  resultBucket?: GoogleResultBucket | null;
}) {
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
  const [days, setDays] = useState<WindowDays>(14);
  const window = completeDaysWindow(days);
  const target = { brandId, customerId, resultBucket };
  const campaigns = useGoogleCampaigns({ ...target, window });
  const goals = useGoogleCampaignGoals(brandId);
  const historyQuery = useGoogleChangeHistory({ ...target, window: changeHistoryWindow() });
  const cards = useOptimizerPlatformCards(brandId, 'google_ads');
  const [openId, setOpenId] = useGoogleCampaignParam();

  if (campaigns.isError) {
    return (
      <p
        className="px-1 text-muted-foreground text-xs"
        data-testid="google-sections-error"
        role="status"
      >
        {uiText.rich('sentence_6464c0c01b69', {
          v0:
            campaigns.error instanceof Error
              ? campaigns.error.message
              : uiText('unknown_error_3e4443e'),
        })}
      </p>
    );
  }
  if (!campaigns.data || goals.status === 'loading') {
    // The sections' own shape, closed, so their landing never pushes what sits below them.
    return (
      <div className="space-y-4" data-testid="google-sections-loading">
        <p className="flex min-h-7 items-center px-1 text-muted-foreground text-xs">
          {uiText('reading_google_s_campaigns_6a0fd78')}
        </p>
        {[ACCOUNT_READ_TITLE, EXPLORER_TITLE, BIDDING_TITLE].map((title) => (
          <GoogleSection
            key={title}
            summary={uiText('reading_874bfa5')}
            testId="google-section-loading"
            title={googleCopy(title, uiText)}
          >
            {null}
          </GoogleSection>
        ))}
      </div>
    );
  }

  const views = campaignViews(campaigns.data, goals.goals, currency, goals.unknown, uiText);
  const history: HistoryRead = historyQuery.isError
    ? { status: 'error' }
    : historyQuery.data
      ? { status: 'ready', history: historyQuery.data }
      : { status: 'loading' };
  const bidding = biddingViews(
    views,
    history,
    cards.status === 'ready' ? cards.cards : [],
    new Date(),
    uiLocale,
    uiText,
  );
  const range = { since: campaigns.data.range.since, until: campaigns.data.range.until };

  return (
    <div className="space-y-4" data-testid="google-tab-sections">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-muted-foreground text-xs" data-testid="google-sections-window">
          {uiText.rich('sentence_ee7df5f21ec1', {
            v0: windowRangeLabel(range.since, range.until, uiLocale),
            v1: days,
          })}
        </p>
        <ToggleGroup
          aria-label={uiText('window_for_the_campaign_read_75aa546')}
          onValueChange={(value) => {
            const next = Number(value);
            if (next === 14 || next === 30) setDays(next);
          }}
          size="sm"
          type="single"
          value={String(days)}
          variant="outline"
        >
          {WINDOWS.map((option) => (
            <ToggleGroupItem className="h-7 px-2 text-xs" key={option} value={String(option)}>
              {uiText.rich('sentence_f322f4af81da', { v0: option })}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <AccountReadByType currency={currency} rows={typeRows(views, currency, uiText)} />
      <CampaignExplorer currency={currency} onOpenCampaign={setOpenId} rows={views} />
      <BiddingPanel currency={currency} rows={bidding} />
      <GoogleCampaignDetail
        bidding={bidding.find((row) => row.id === openId) ?? null}
        campaign={views.find((row) => row.id === openId) ?? null}
        campaignId={openId}
        currency={currency}
        history={history}
        onClose={() => setOpenId(null)}
        window={range}
      />
    </div>
  );
}

'use client';

import { useLocale, useTranslations } from 'next-intl';

// Idea 3's campaign detail: one campaign's figures against its portfolio CPA goal, its bidding
// and impression share, and what changed on it, in a sheet kept in ?googleCampaign= so the
// link opens it again. Read-only: it links to Google Ads and to Jaina, and writes nothing.

import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { jainaPromptHref } from '@/lib/jaina/deepLink';
import { formatCurrency } from '../../format';
import { googleAdsCampaignHref, percentLabel } from '../platformCards/platformCardModel';
import {
  formatConversions,
  NO_SINGLE_RESULT,
  ownResultsLabel,
} from '../platforms/googleAdsOverviewModel';
import { cooldownText, lastChangeText } from './BiddingPanel';
import { statusWords } from './CampaignExplorer';
import {
  type BiddingView,
  type CampaignView,
  changeLine,
  dayLabel,
  type HistoryRead,
  jainaCampaignPrompt,
  targetLabel,
} from './campaignExplorerModel';
import { BandText, FigureText, Missing } from './GoogleSection';

export const CAMPAIGN_PARAM = 'googleCampaign';

/** The open campaign, kept in the URL; a sheet is a light control, so it replaces history. */
export function useGoogleCampaignParam(): [string | null, (campaignId: string | null) => void] {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const open = useCallback(
    (campaignId: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (campaignId) next.set(CAMPAIGN_PARAM, campaignId);
      else next.delete(CAMPAIGN_PARAM);
      const query = next.toString();
      window.history.replaceState(null, '', query ? `${pathname}?${query}` : pathname);
    },
    [pathname, searchParams],
  );
  return [searchParams.get(CAMPAIGN_PARAM), open];
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-border/60 border-t py-1.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-right font-mono text-sm tabular-nums">{children}</dd>
    </div>
  );
}

const MAX_CHANGES = 5;

export function GoogleCampaignDetailBody({
  campaign,
  bidding,
  history,
  currency,
  window,
}: {
  campaign: CampaignView;
  bidding: BiddingView | null;
  history: HistoryRead;
  currency: string | null;
  window: { since: string; until: string };
}) {
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
  const changes =
    history.status === 'ready'
      ? history.history.changes.filter((change) => change.campaignId === campaign.id)
      : [];
  const share = (value: number) => percentLabel(value, uiLocale);
  return (
    <div className="space-y-4 px-4 pb-6 text-sm" data-testid="google-campaign-detail">
      <dl data-testid="google-campaign-figures">
        <Row
          label={uiText('template_2c52e9b80d56', {
            v0: dayLabel(window.since, uiLocale),
            v1: dayLabel(window.until, uiLocale),
          })}
        >
          {formatCurrency(campaign.spend, currency, uiLocale)}
        </Row>
        <Row label={uiText('conversions_236c262')}>
          {campaign.conversions == null
            ? (ownResultsLabel(campaign.byResult, uiLocale, uiText) ?? (
                <Missing reason={NO_SINGLE_RESULT} />
              ))
            : formatConversions(campaign.conversions, uiLocale)}
        </Row>
        <Row label={uiText('cost_per_conversion_74a26f0')}>
          {campaign.cost != null ? (
            formatCurrency(campaign.cost, currency, uiLocale)
          ) : (
            <Missing
              reason={
                campaign.conversions == null
                  ? NO_SINGLE_RESULT
                  : 'No conversion in the window to price'
              }
            />
          )}
        </Row>
        <Row label={uiText('portfolio_cpa_goal_8eaa125')}>
          {campaign.band.goal != null ? (
            <>
              {formatCurrency(campaign.band.goal, currency, uiLocale)}{' '}
              <BandText band={campaign.band} />
            </>
          ) : (
            <BandText band={campaign.band} />
          )}
        </Row>
        <Row label={uiText('budget_per_day_5e699cb')}>
          <FigureText
            figure={campaign.budgetPerDay}
            format={(v) => formatCurrency(v, currency, uiLocale)}
          />
        </Row>
        <Row label={uiText('search_impression_share_cd46140')}>
          <FigureText figure={campaign.impressionShare} format={share} />
        </Row>
        <Row label={uiText('lost_to_budget_d856931')}>
          <FigureText figure={campaign.budgetLost} format={share} />
        </Row>
        <Row label={uiText('lost_to_rank_3029ccc')}>
          <FigureText figure={campaign.rankLost} format={share} />
        </Row>
      </dl>

      {bidding ? (
        <section className="space-y-1" data-testid="google-campaign-bidding">
          <h4 className="font-semibold text-foreground text-xs">{uiText('bidding_b8d1b91')}</h4>
          <dl>
            <Row label={uiText('strategy_6b27710')}>
              <FigureText figure={bidding.strategy} format={(v) => v} />
            </Row>
            <Row label={uiText('google_target_bid_setting_5e10812')}>
              {bidding.target.value != null ? (
                targetLabel(bidding.target.value, bidding.targetKind, currency, uiLocale)
              ) : (
                <Missing reason={bidding.target.reason} />
              )}
            </Row>
            <Row label={uiText('status_920e413')}>
              <FigureText figure={bidding.learning} format={(v) => v} />
            </Row>
            <Row label={uiText('last_target_change_5596c0d')}>
              {lastChangeText(bidding, currency, uiLocale, uiText)}
            </Row>
          </dl>
          <p className="text-muted-foreground text-xs">
            {cooldownText(bidding.cooldown, uiText, uiLocale)}
          </p>
        </section>
      ) : null}

      <section className="space-y-1" data-testid="google-campaign-changes">
        <h4 className="font-semibold text-foreground text-xs">
          {uiText('what_changed_on_it_5129a4d')}
        </h4>
        {history.status === 'loading' ? (
          <p className="text-muted-foreground text-xs">
            {uiText('reading_google_s_change_history_6f925af')}
          </p>
        ) : history.status === 'error' ? (
          <p className="text-muted-foreground text-xs">
            {uiText('google_s_change_history_could_not_be_read_7cfff2f')}
          </p>
        ) : changes.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            {uiText.rich('sentence_3c0445864839', {
              hasSince: history.history.coverage.read ? 'yes' : 'no',
              since: history.history.coverage.read
                ? dayLabel(history.history.coverage.read.since, uiLocale)
                : '',
            })}
          </p>
        ) : (
          <ul className="space-y-1">
            {changes.slice(0, MAX_CHANGES).map((change) => {
              const line = changeLine(change, uiText, uiLocale);
              return (
                <li className="text-xs" key={`${change.at}-${change.resourceName ?? line.what}`}>
                  <span className="text-muted-foreground">{dayLabel(change.at, uiLocale)} · </span>
                  {line.what}
                  {line.detail ? `: ${line.detail}` : ''}
                  <span className="text-muted-foreground"> · {line.who}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <a
          className="hit-area font-semibold text-primary-ink hover:underline"
          href={googleAdsCampaignHref(campaign.id)}
          rel="noreferrer"
          target="_blank"
        >
          {uiText('open_in_google_ads_0131249')}
        </a>
        <a
          className="hit-area font-semibold text-primary-ink hover:underline"
          data-testid="google-campaign-ask-jaina"
          href={jainaPromptHref(
            jainaCampaignPrompt(campaign.name, window.since, window.until),
            'google_ads',
          )}
        >
          {uiText('ask_jaina_about_this_campaign_dbfae14')}
        </a>
      </div>
    </div>
  );
}

export function GoogleCampaignDetail({
  campaignId,
  campaign,
  bidding,
  history,
  currency,
  window,
  onClose,
}: {
  campaignId: string | null;
  campaign: CampaignView | null;
  bidding: BiddingView | null;
  history: HistoryRead;
  currency: string | null;
  window: { since: string; until: string };
  onClose: () => void;
}) {
  const uiText = useTranslations('scale');
  const subtitle = campaign
    ? [
        campaign.typeLabel,
        statusWords(campaign.status, uiText),
        campaign.goal?.portfolioName ?? 'in no portfolio',
      ]
        .filter(Boolean)
        .join(' · ')
    : null;
  return (
    <Sheet onOpenChange={(open) => (open ? undefined : onClose())} open={campaignId != null}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md" side="right">
        <SheetHeader>
          <SheetTitle>
            {campaign?.name ?? uiText('template_5c38ac1ad61f', { v0: campaignId ?? '' })}
          </SheetTitle>
          <SheetDescription>
            {subtitle ?? uiText('it_did_not_spend_in_this_window_so_there_are__e453a22')}
          </SheetDescription>
        </SheetHeader>
        {campaign ? (
          <GoogleCampaignDetailBody
            bidding={bidding}
            campaign={campaign}
            currency={currency}
            history={history}
            window={window}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

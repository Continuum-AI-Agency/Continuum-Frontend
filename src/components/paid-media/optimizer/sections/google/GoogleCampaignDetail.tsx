'use client';
import { useTranslations as useBetaTranslations, useLocale, useTranslations } from 'next-intl';

// The campaign page (G11), in a sheet kept in ?googleCampaign= so the link opens it again. It
// adapts to the campaign's type: a visual header (its type, whether it serves, its budget and
// portfolio), its figures as tiles, its cost per result day by day against the portfolio goal
// with what changed on it marked, the Search auctions it lost, and the tabs its type opens on —
// keywords, search terms and Quality Score for Search; asset groups and channels for
// Performance Max; channels for the rest. Under them, every figure against its goal, its
// bidding and what changed on it. Read-only: it links to Google Ads and to Jaina.
//
// The day-by-day trend and the type tabs read with the brand's Google customer (`target`); a
// host that does not hand it one gets the page without them, never a made-up line.

import type { PaidAccountOverview } from '@continuum/contracts';
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
import { cn } from '@/lib/utils';
import { ChartError, ChartSkeleton } from '../../charts/ChartStates';
import { TEXT_DISCLOSURE } from '../../components/disclosure';
import { formatCurrency } from '../../format';
import { boardPaletteClass } from '../board/palette';
import {
  AuctionShareBar,
  CampaignHeader,
  CampaignKpiTiles,
} from '../pages/campaign/CampaignPageParts';
import { CampaignTrendChart } from '../pages/campaign/CampaignTrendChart';
import { CampaignTypeTabs } from '../pages/campaign/CampaignTypeTabs';
import {
  auctionSlices,
  campaignKind,
  campaignKpis,
  campaignTrend,
  changeMarks,
} from '../pages/campaign/campaignPageModel';
import { useGoogleCampaignDaily } from '../pages/campaign/useGoogleCampaignDaily';
import { googleAdsCampaignHref, percentLabel } from '../platformCards/platformCardModel';
import {
  formatConversions,
  NO_SINGLE_RESULT,
  ownResultsLabel,
} from '../platforms/googleAdsOverviewModel';
import { cooldownText, lastChangeText } from './BiddingPanel';
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
import type { GoogleReadTarget } from './googleReads';
import { type ViewRead, viewRead } from './views/viewParts';

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

/** The day-by-day trend, or why it is not drawn: still reading, or the read failed. */
function CampaignTrendSection({
  daily,
  campaign,
  history,
  currency,
  window,
}: {
  daily: ViewRead<PaidAccountOverview>;
  campaign: CampaignView;
  history: HistoryRead;
  currency: string | null;
  window: { since: string; until: string };
}) {
  const betaUiText = useBetaTranslations('scale');

  if (daily.status === 'loading') return <ChartSkeleton className="h-40" />;
  if (daily.status === 'error') {
    return (
      <ChartError
        message={betaUiText('beta_a72f8af66685', {
          value0: String(daily.message),
        })}
        onRetry={daily.retry}
      />
    );
  }
  return (
    <CampaignTrendChart
      currency={currency}
      marks={changeMarks(history, campaign.id, window)}
      trend={campaignTrend(daily.data, window, campaign.band.goal)}
    />
  );
}

export function GoogleCampaignDetailBody({
  campaign,
  bidding,
  history,
  currency,
  window,
  daily = null,
  target = null,
}: {
  campaign: CampaignView;
  bidding: BiddingView | null;
  history: HistoryRead;
  currency: string | null;
  window: { since: string; until: string };
  /** The campaign day by day (useGoogleCampaignDaily); null when this host does not read it. */
  daily?: ViewRead<PaidAccountOverview> | null;
  /** The brand's Google customer, for the reads the type tabs make; null leaves them out. */
  target?: GoogleReadTarget | null;
}) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();

  const betaUiText = useBetaTranslations('scale');

  const kind = campaignKind(campaign.channelType);
  const changes =
    history.status === 'ready'
      ? history.history.changes.filter((change) => change.campaignId === campaign.id)
      : [];
  const share = (value: number) => percentLabel(value);
  const auction = kind === 'search' || kind === 'pmax' ? auctionSlices(campaign) : null;
  return (
    <div
      className={cn('space-y-5 px-4 pb-6 text-sm', boardPaletteClass)}
      data-kind={kind}
      data-testid="google-campaign-detail"
    >
      <CampaignHeader campaign={campaign} currency={currency} />
      <CampaignKpiTiles tiles={campaignKpis(campaign, currency)} />
      {daily ? (
        <CampaignTrendSection
          campaign={campaign}
          currency={currency}
          daily={daily}
          history={history}
          window={window}
        />
      ) : null}
      {auction ? <AuctionShareBar slices={auction} /> : null}
      {target ? (
        <CampaignTypeTabs
          campaignId={campaign.id}
          currency={currency}
          kind={kind}
          target={target}
          window={window}
        />
      ) : null}

      <details className="group">
        <summary className={TEXT_DISCLOSURE}>
          <span className="font-medium text-foreground">{betaUiText('beta_8a8b80ffeaf5')}</span>{' '}
          {betaUiText('beta_5d0659a5b2d2')} {dayLabel(window.since)} – {dayLabel(window.until)}
        </summary>
        <dl className="mt-2" data-testid="google-campaign-figures">
          <Row
            label={betaUiText('beta_aa363e3271b1', {
              value0: String(dayLabel(window.since)),
              value1: String(dayLabel(window.until)),
            })}
          >
            {formatCurrency(campaign.spend, currency)}
          </Row>
          <Row label={betaUiText('beta_236c2620e434')}>
            {campaign.conversions == null
              ? (ownResultsLabel(campaign.byResult) ?? <Missing reason={NO_SINGLE_RESULT} />)
              : formatConversions(campaign.conversions)}
          </Row>
          <Row label={betaUiText('beta_74a26f0b6c9f')}>
            {campaign.cost != null ? (
              formatCurrency(campaign.cost, currency)
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
          <Row label={betaUiText('beta_8eaa12571f13')}>
            {campaign.band.goal != null ? (
              <>
                {formatCurrency(campaign.band.goal, currency)} <BandText band={campaign.band} />
              </>
            ) : (
              <BandText band={campaign.band} />
            )}
          </Row>
          <Row label={betaUiText('beta_5e699cb47214')}>
            <FigureText
              figure={campaign.budgetPerDay}
              format={(v) => formatCurrency(v, currency)}
            />
          </Row>
          <Row label={betaUiText('beta_cd46140042f2')}>
            <FigureText figure={campaign.impressionShare} format={share} />
          </Row>
          <Row label={betaUiText('beta_d856931d0802')}>
            <FigureText figure={campaign.budgetLost} format={share} />
          </Row>
          <Row label={betaUiText('beta_3029ccc58005')}>
            <FigureText figure={campaign.rankLost} format={share} />
          </Row>
        </dl>
      </details>

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
  target = null,
}: {
  campaignId: string | null;
  campaign: CampaignView | null;
  bidding: BiddingView | null;
  history: HistoryRead;
  currency: string | null;
  window: { since: string; until: string };
  onClose: () => void;
  /** The brand's Google customer. With it the page reads the campaign day by day and its
   *  type's tabs; without it, it shows what the host already read. */
  target?: GoogleReadTarget | null;
}) {
  const uiText = useTranslations('scale');

  const dailyQuery = useGoogleCampaignDaily(target, campaign?.id ?? null, window);
  const daily = target && campaign ? viewRead(dailyQuery) : null;
  // The header under it names the type, the status and the portfolio; the description says
  // the window every figure on the page covers.
  const subtitle = campaign
    ? `${dayLabel(window.since)} – ${dayLabel(window.until)} · against its portfolio's CPA goal`
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
            daily={daily}
            history={history}
            target={target}
            window={window}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

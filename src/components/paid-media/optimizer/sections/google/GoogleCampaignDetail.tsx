'use client';

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
  const changes =
    history.status === 'ready'
      ? history.history.changes.filter((change) => change.campaignId === campaign.id)
      : [];
  const share = (value: number) => percentLabel(value);
  return (
    <div className="space-y-4 px-4 pb-6 text-sm" data-testid="google-campaign-detail">
      <dl data-testid="google-campaign-figures">
        <Row label={`Spend · ${dayLabel(window.since)} – ${dayLabel(window.until)}`}>
          {formatCurrency(campaign.spend, currency)}
        </Row>
        <Row label="Conversions">
          {campaign.conversions == null
            ? (ownResultsLabel(campaign.byResult) ?? <Missing reason={NO_SINGLE_RESULT} />)
            : formatConversions(campaign.conversions)}
        </Row>
        <Row label="Cost per conversion">
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
        <Row label="Portfolio CPA goal">
          {campaign.band.goal != null ? (
            <>
              {formatCurrency(campaign.band.goal, currency)} <BandText band={campaign.band} />
            </>
          ) : (
            <BandText band={campaign.band} />
          )}
        </Row>
        <Row label="Budget per day">
          <FigureText figure={campaign.budgetPerDay} format={(v) => formatCurrency(v, currency)} />
        </Row>
        <Row label="Search impression share">
          <FigureText figure={campaign.impressionShare} format={share} />
        </Row>
        <Row label="Lost to budget">
          <FigureText figure={campaign.budgetLost} format={share} />
        </Row>
        <Row label="Lost to rank">
          <FigureText figure={campaign.rankLost} format={share} />
        </Row>
      </dl>

      {bidding ? (
        <section className="space-y-1" data-testid="google-campaign-bidding">
          <h4 className="font-semibold text-foreground text-xs">Bidding</h4>
          <dl>
            <Row label="Strategy">
              <FigureText figure={bidding.strategy} format={(v) => v} />
            </Row>
            <Row label="Google target (bid setting)">
              {bidding.target.value != null ? (
                targetLabel(bidding.target.value, bidding.targetKind, currency)
              ) : (
                <Missing reason={bidding.target.reason} />
              )}
            </Row>
            <Row label="Status">
              <FigureText figure={bidding.learning} format={(v) => v} />
            </Row>
            <Row label="Last target change">{lastChangeText(bidding, currency)}</Row>
          </dl>
          <p className="text-muted-foreground text-xs">{cooldownText(bidding.cooldown)}</p>
        </section>
      ) : null}

      <section className="space-y-1" data-testid="google-campaign-changes">
        <h4 className="font-semibold text-foreground text-xs">What changed on it</h4>
        {history.status === 'loading' ? (
          <p className="text-muted-foreground text-xs">Reading Google's change history…</p>
        ) : history.status === 'error' ? (
          <p className="text-muted-foreground text-xs">
            Google's change history could not be read.
          </p>
        ) : changes.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            No change in Google's change history
            {history.history.coverage.read
              ? ` since ${dayLabel(history.history.coverage.read.since)}`
              : ''}
            .
          </p>
        ) : (
          <ul className="space-y-1">
            {changes.slice(0, MAX_CHANGES).map((change) => {
              const line = changeLine(change);
              return (
                <li className="text-xs" key={`${change.at}-${change.resourceName ?? line.what}`}>
                  <span className="text-muted-foreground">{dayLabel(change.at)} · </span>
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
          Open in Google Ads
        </a>
        <a
          className="hit-area font-semibold text-primary-ink hover:underline"
          data-testid="google-campaign-ask-jaina"
          href={jainaPromptHref(
            jainaCampaignPrompt(campaign.name, window.since, window.until),
            'google_ads',
          )}
        >
          Ask Jaina about this campaign
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
  const subtitle = campaign
    ? [
        campaign.typeLabel,
        statusWords(campaign.status),
        campaign.goal?.portfolioName ?? 'in no portfolio',
      ]
        .filter(Boolean)
        .join(' · ')
    : null;
  return (
    <Sheet onOpenChange={(open) => (open ? undefined : onClose())} open={campaignId != null}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md" side="right">
        <SheetHeader>
          <SheetTitle>{campaign?.name ?? `Campaign ${campaignId ?? ''}`}</SheetTitle>
          <SheetDescription>
            {subtitle ?? 'It did not spend in this window, so there are no figures for it.'}
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

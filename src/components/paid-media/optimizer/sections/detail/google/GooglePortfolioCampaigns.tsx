'use client';

// Idea 8, a portfolio's Google campaigns on its detail page, under "By platform": each campaign's
// budget before → after (G03's proposal), what it paid against the portfolio CPA goal, and
// Google's target before → after (G07's), then those cards with their own controls — the only
// writes here — and the autopilot as it stands, read-only (P7 owns the toggle). A portfolio with
// no Google member renders nothing.

import type { AccountCandidate, PortfolioListItem } from '@continuum/contracts';
import { ArrowRightIcon } from 'lucide-react';
import { TEXT_DISCLOSURE } from '../../../components/disclosure';
import {
  currencyColumnSuffix,
  formatCurrency,
  formatCurrencyInColumn,
  humanize,
} from '../../../format';
import {
  type PortfolioMember,
  usePortfolioMembers,
} from '../../../picker/usePortfolioPlatformMembers';
import { useOptimizerAdAccounts, useOptimizerPlatformCards } from '../../../useOptimizerData';
import {
  type CampaignGoal,
  costOf,
  goalBand,
  type PortfolioCampaignView,
  portfolioCampaignViews,
  targetLabel,
} from '../../google/campaignExplorerModel';
import {
  BandText,
  FigureText,
  GoogleSection,
  Missing,
  ReasonNotes,
  ScrollTable,
  TD,
  TD_NUM,
  TH,
  TH_NUM,
} from '../../google/GoogleSection';
import { useGoogleCampaigns } from '../../google/googleReads';
import {
  ACTION_KIND_COPY,
  type ActionKind,
  type PlatformActionsState,
  usePortfolioPlatformActions,
} from '../../platformActions/usePortfolioPlatformActions';
import { PlatformCardBody } from '../../platformCards/PlatformCardBody';
import {
  cardActionsOf,
  type PlatformCardAction,
} from '../../platformCards/platformCardActionModel';
import { platformCardOf } from '../../platformCards/platformCardModel';
import {
  completeDaysWindow,
  NO_SINGLE_RESULT,
  windowRangeLabel,
} from '../../platforms/googleAdsOverviewModel';
import { accountsOn, portfolioPlatforms } from '../../platforms/platformTabsModel';

/** G03 (budget) and G07 (bid target): the cards this block hands a person. */
const PORTFOLIO_CARD_VARIANTS = new Set(['google_budget_limited', 'google_bid_target']);

const WINDOW_DAYS = 14;

/** "Recommend · every change waits for a person · on Google: change budgets, pause or enable". */
export function autopilotLine(
  portfolio: Pick<PortfolioListItem, 'apply_mode' | 'autopilot_paused'>,
  actions: PlatformActionsState,
): string {
  const mode =
    portfolio.apply_mode === 'autopilot'
      ? portfolio.autopilot_paused
        ? 'Autopilot, paused: every change waits for a person'
        : 'Autopilot: changes inside the caps are written without asking'
      : `${humanize(portfolio.apply_mode)}: every change waits for a person`;
  if (actions.status !== 'ready') {
    return actions.status === 'loading'
      ? mode
      : `${mode} · what it may write on Google could not be read`;
  }
  const google = actions.platforms.find((row) => row.platform === 'google_ads');
  const allowed = google?.allowed;
  const kinds =
    allowed == null
      ? 'its Google accounts disagree on what it may write'
      : allowed.length === 0
        ? 'it may write nothing on Google'
        : `on Google it may ${allowed
            .map((kind) => ACTION_KIND_COPY[kind as ActionKind]?.label.toLowerCase() ?? kind)
            .join(', ')}`;
  return `${mode} · ${kinds}`;
}

/** A setting and, when a card proposes one, where the card would take it. */
function Before({ before, after }: { before: React.ReactNode; after: string | null }) {
  return (
    <>
      {before}
      {after ? (
        <span className="inline-flex items-center gap-1 text-primary-ink">
          <ArrowRightIcon aria-hidden="true" className="size-3" />
          {after}
        </span>
      ) : null}
    </>
  );
}

export function GooglePortfolioCampaignsView({
  rows,
  goal,
  currency,
  window,
  cards,
  actions,
  autopilot,
}: {
  rows: readonly PortfolioCampaignView[];
  goal: CampaignGoal;
  currency: string | null;
  window: { since: string; until: string };
  cards: readonly AccountCandidate[];
  actions: ReadonlyMap<string, PlatformCardAction>;
  autopilot: string;
}) {
  const spend = rows.reduce((sum, row) => sum + (row.spend.value ?? 0), 0);
  const conversions = rows.some((row) => row.conversions == null && row.spend.value != null)
    ? null
    : rows.reduce((sum, row) => sum + (row.conversions ?? 0), 0);
  const band = goalBand(costOf(spend, conversions), conversions, goal, currency);
  const code = currencyColumnSuffix(currency);
  const summary =
    rows.length === 0
      ? 'No Google campaign in this portfolio.'
      : `${rows.length} ${rows.length === 1 ? 'campaign' : 'campaigns'}, ${formatCurrency(spend, currency)} spent over ${windowRangeLabel(window.since, window.until)}${
          conversions == null
            ? ''
            : conversions > 0
              ? `, ${formatCurrency(spend / conversions, currency)} per conversion`
              : ', no conversion yet'
        }${goal.goal != null ? ` against the ${formatCurrency(goal.goal, currency)} goal` : ''}${band.label !== '—' ? ` (${band.label})` : ''}.`;
  return (
    <GoogleSection
      open
      summary={summary}
      testId="google-portfolio-campaigns"
      title="Google campaigns"
    >
      <p className="text-muted-foreground text-xs" data-testid="google-portfolio-autopilot">
        {autopilot}
      </p>
      {rows.length === 0 ? null : (
        <>
          <ScrollTable testId="google-portfolio-table">
            <thead>
              <tr>
                <th className={TH} scope="col">
                  Campaign
                </th>
                <th className={TH_NUM} scope="col">
                  Budget / day{code}
                </th>
                <th className={TH_NUM} scope="col">
                  Spend{code}
                </th>
                <th className={TH_NUM} scope="col">
                  Cost / conv.{code}
                </th>
                <th className={TH} scope="col">
                  vs goal
                </th>
                <th className={TH_NUM} scope="col">
                  Google target
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  className="border-border/60 border-t"
                  data-campaign-id={row.id}
                  data-testid="google-portfolio-row"
                  key={row.id}
                >
                  <td className={TD}>
                    {row.name}
                    {row.typeLabel ? (
                      <span className="block text-muted-foreground text-xs">{row.typeLabel}</span>
                    ) : null}
                  </td>
                  <td className={TD_NUM} data-testid="google-portfolio-budget">
                    <Before
                      after={
                        row.budgetAfter != null
                          ? formatCurrencyInColumn(row.budgetAfter, currency)
                          : null
                      }
                      before={
                        <FigureText
                          figure={row.budgetBefore}
                          format={(value) => formatCurrencyInColumn(value, currency)}
                        />
                      }
                    />
                  </td>
                  <td className={TD_NUM}>
                    <FigureText
                      figure={row.spend}
                      format={(value) => formatCurrencyInColumn(value, currency)}
                    />
                  </td>
                  <td className={TD_NUM}>
                    {row.cost != null ? (
                      formatCurrencyInColumn(row.cost, currency)
                    ) : (
                      <Missing
                        reason={
                          row.spend.value == null
                            ? row.spend.reason
                            : row.conversions == null
                              ? NO_SINGLE_RESULT
                              : 'No conversion in the window to price'
                        }
                      />
                    )}
                  </td>
                  <td className={TD}>
                    <BandText band={row.band} />
                  </td>
                  <td className={TD_NUM} data-testid="google-portfolio-target">
                    <Before
                      after={
                        row.targetAfter != null
                          ? targetLabel(row.targetAfter, row.targetKind, currency)
                          : null
                      }
                      before={
                        row.target.value != null ? (
                          targetLabel(row.target.value, row.targetKind, currency)
                        ) : (
                          <Missing reason={row.target.reason} />
                        )
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </ScrollTable>
          <ReasonNotes
            reasons={rows.flatMap((row) => [
              row.spend.reason,
              row.budgetBefore.reason,
              row.target.reason,
            ])}
          />
        </>
      )}
      {cards.length > 0 ? (
        <details className="group" data-testid="google-portfolio-cards">
          <summary className={TEXT_DISCLOSURE}>
            {cards.length} {cards.length === 1 ? 'proposal' : 'proposals'} to approve or reject
          </summary>
          <div className="mt-2 space-y-4">
            {cards.map((candidate) => {
              const card = platformCardOf(candidate);
              return card ? (
                <PlatformCardBody
                  action={actions.get(candidate.id)}
                  card={card}
                  key={candidate.id}
                />
              ) : null;
            })}
          </div>
        </details>
      ) : null}
    </GoogleSection>
  );
}

function googleMembers(state: ReturnType<typeof usePortfolioMembers>): PortfolioMember[] {
  return state.status === 'ready'
    ? state.members.filter((member) => member.platform === 'google_ads')
    : [];
}

type Props = { brandId: string; portfolio: PortfolioListItem };

/** Reads nothing for a portfolio the list says holds no Google member. */
export function GooglePortfolioCampaigns(props: Props) {
  return portfolioPlatforms(props.portfolio.platforms).includes('google_ads') ? (
    <GooglePortfolioCampaignsRead {...props} />
  ) : null;
}

function GooglePortfolioCampaignsRead({ brandId, portfolio }: Props) {
  const membersState = usePortfolioMembers(portfolio.id);
  const members = googleMembers(membersState);
  const accounts = useOptimizerAdAccounts(brandId).data;
  const customerId = members[0]?.accountId ?? '';
  const window = completeDaysWindow(WINDOW_DAYS);
  const campaigns = useGoogleCampaigns({ brandId, customerId, window });
  const cardsState = useOptimizerPlatformCards(brandId, 'google_ads');
  const actionsState = usePortfolioPlatformActions(portfolio.id);
  if (members.length === 0) return null;
  if (campaigns.isError) {
    return (
      <p
        className="text-muted-foreground text-xs"
        data-testid="google-portfolio-error"
        role="status"
      >
        This portfolio's Google campaigns could not be read:{' '}
        {campaigns.error instanceof Error ? campaigns.error.message : 'unknown error'}
      </p>
    );
  }
  if (!campaigns.data) return null;
  const currency =
    portfolio.currency ??
    accountsOn(accounts, 'google_ads').find((account) => account.account_id === customerId)
      ?.currency ??
    campaigns.data.currency ??
    null;
  const goal: CampaignGoal = {
    portfolioId: portfolio.id,
    portfolioName: portfolio.name,
    goal: portfolio.cpa_target != null && portfolio.cpa_target > 0 ? portfolio.cpa_target : null,
    currency: portfolio.currency ?? null,
  };
  const cards =
    cardsState.status === 'ready'
      ? cardsState.cards.filter((candidate) => {
          const variant = platformCardOf(candidate)?.variant;
          return (
            variant != null &&
            PORTFOLIO_CARD_VARIANTS.has(variant) &&
            candidate.portfolio_ids.includes(portfolio.id)
          );
        })
      : [];
  return (
    <GooglePortfolioCampaignsView
      actions={cardActionsOf(cards)}
      autopilot={autopilotLine(portfolio, actionsState)}
      cards={cards}
      currency={currency}
      goal={goal}
      rows={portfolioCampaignViews({
        members,
        read: campaigns.data,
        goal,
        cards,
        currency,
      })}
      window={campaigns.data.range}
    />
  );
}

'use client';
import { useTranslations as useBetaTranslations, useLocale as useFormatLocale } from 'next-intl';

// G09 Performance Max on the adaptive board: each Performance Max campaign's cost per conversion
// against its goal as a bullet, the share of its impressions lost to rank, its asset groups by
// Ad Strength, the Optimizer's rescue-or-pause card when it fired, and the top campaign's spend
// by channel. On a Search-only account the lens is the best ad against the dearer one of the
// same group (the Optimizer's G10 card). Read-only. At s the lens is its one figure over the
// bullet.

import {
  type AdAccountBoardSlot,
  type BoardModuleSize,
  type GoogleBreakdownRead,
  type GoogleSignalsRead,
  type PlatformCard,
  type PmaxLensTakeawayInput,
  pmaxLensTakeaway,
} from '@continuum/contracts';
import { motion, useReducedMotion } from 'motion/react';
import { type ReactNode, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '../../../../format';
import { useGoogleBreakdown, useGoogleSignals } from '../../../google/googleReads';
import {
  CARDS_UNREAD,
  frameStateOf,
  googleLensRead,
  isTile,
  LegendKey,
  LensBody,
  LensFigure,
  LensNote,
  type LensState,
  LensTakeaway,
  LensWindow,
  lensAll,
  MarkTip,
  pct,
  useGoogleCardsLens,
  useGoogleCustomer,
} from '../../../google/views/lensParts';
import { networkSplit } from '../../../google/views/pmaxHealthModel';
import { windowRangeLabel } from '../../../platforms/googleAdsOverviewModel';
import { portfolioGoalOf } from '../../../platforms/useGoogleAdsOverview';
import { ModuleFrame } from '../../ModuleFrame';
import { BOARD_COLOR } from '../../palette';
import { BOARD_MODULE_TITLES } from '../../registry';
import type { BoardModuleProps } from '../../types';
import {
  AD_STRENGTH_LABEL,
  AD_STRENGTHS,
  type AdStrength,
  type AdWinnerCard,
  buildPmaxModel,
  leadPmaxCampaign,
  multipleText,
  type PmaxCampaign,
  type PmaxModel,
  positionOf,
} from './pmaxModel';

const TEST_ID = 'board-module-pmax';

/** The blocks V4 reads: campaigns (spend, conversions, rank lost), their bid targets and the
 *  asset groups. One read; the search terms are never part of it. */
const PMAX_BLOCKS = ['asset_groups', 'bid_targets', 'campaigns'] as const;
const NETWORK = ['network'] as const;
/** The breakdown read's window while no campaign names one: the read is off until it does. */
const NO_WINDOW = { since: '', until: '' };

type PmaxRead = Extract<PmaxModel, { kind: 'pmax' }>;
type Money = (value: number) => string;

/** Ad Strength on the diverging pair: Poor at the bad pole, Average the neutral midpoint, Good
 *  and Excellent two steps toward the good pole. */
const STRENGTH_COLOR: Record<AdStrength, string> = {
  POOR: BOARD_COLOR.above,
  AVERAGE: BOARD_COLOR.mid,
  GOOD: `color-mix(in srgb, ${BOARD_COLOR.below} 55%, var(--card))`,
  EXCELLENT: BOARD_COLOR.below,
};

/** A cost above its goal takes the bad pole, at or under it the good one. */
const costColor = (multiple: number | null) =>
  multiple !== null && multiple > 1 ? BOARD_COLOR.above : BOARD_COLOR.below;

export type PmaxLensInputs = {
  read: GoogleSignalsRead;
  cards: PlatformCard[] | null;
};

export default function PmaxLens({ ctx, slot }: BoardModuleProps) {
  const customer = useGoogleCustomer(ctx.brandId, ctx.adAccountId);
  const customerId = customer.status === 'ready' ? customer.data.customerId : '';
  const query = useGoogleSignals({
    brandId: ctx.brandId,
    customerId,
    blocks: PMAX_BLOCKS,
  });
  const cards = useGoogleCardsLens(ctx.brandId);
  // The top campaign's channels: a second read, made once the first names the campaign, and only
  // where the lens draws the full chart (at s it draws the one figure).
  const lead = !isTile(slot.size) && query.data ? leadPmaxCampaign(query.data) : null;
  const breakdown = useGoogleBreakdown({
    brandId: ctx.brandId,
    customerId: lead ? customerId : '',
    resultBucket: portfolioGoalOf(ctx.portfolios),
    window: lead?.window ?? NO_WINDOW,
    dimensions: NETWORK,
    campaignId: lead?.id,
  });
  const reads = lensAll(googleLensRead(query), cards);
  const state: LensState<PmaxLensInputs> =
    customer.status !== 'ready'
      ? customer
      : reads.status === 'ready'
        ? {
            status: 'ready',
            data: { read: reads.data[0], cards: reads.data[1] },
          }
        : reads;
  const currency = ctx.currency ?? (customer.status === 'ready' ? customer.data.currency : null);
  return (
    <PmaxLensView
      channels={lead ? googleLensRead(breakdown) : null}
      currency={currency}
      goal={ctx.reading.result.goal}
      slot={slot}
      state={state}
    />
  );
}

export function PmaxLensView({
  slot,
  state,
  currency,
  goal,
  channels,
}: {
  slot: AdAccountBoardSlot;
  state: LensState<PmaxLensInputs>;
  currency: string | null;
  /** The portfolio goal the reading holds: one goal for the platform, else null. */
  goal: number | null;
  /** The top campaign's spend by channel; null where the lens does not read it. */
  channels: LensState<GoogleBreakdownRead> | null;
}) {
  const betaUiText = useBetaTranslations('scale');

  const read = state.status === 'ready' ? state.data.read : null;
  const cards = state.status === 'ready' ? state.data.cards : null;
  const model = useMemo(
    () => (read ? buildPmaxModel(read, cards, goal) : null),
    [read, cards, goal],
  );
  const accountCurrency = read?.signals?.currency ?? currency;
  const drawable =
    model?.kind === 'pmax' || (model?.kind === 'search_only' && model.winner !== null);
  return (
    <ModuleFrame
      action={
        <LensWindow
          range={model && model.kind !== 'unread' ? model.window : null}
          testId={TEST_ID}
        />
      }
      reason={slot.reason}
      size={slot.size}
      state={frameStateOf(
        state,
        drawable,
        model?.kind === 'pmax' && channels?.status === 'loading',
      )}
      testId={TEST_ID}
      title={betaUiText('boardModuleTitle', { id: 'pmax' })}
    >
      <LensBody size={slot.size} state={state} testId={TEST_ID}>
        {() =>
          model ? (
            <PmaxBody
              cardsUnread={cards === null}
              channels={
                channels ? <ChannelSplitView currency={accountCurrency} read={channels} /> : null
              }
              model={model}
              money={(value) => formatCurrency(value, accountCurrency)}
              size={slot.size}
            />
          ) : null
        }
      </LensBody>
    </ModuleFrame>
  );
}

function PmaxBody({
  model,
  money,
  size,
  cardsUnread,
  channels,
}: {
  model: PmaxModel;
  money: Money;
  size: BoardModuleSize;
  cardsUnread: boolean;
  /** The top campaign's spend by channel, drawn under the campaigns. */
  channels: ReactNode;
}) {
  const betaUiText = useBetaTranslations('scale');

  if (model.kind === 'unread')
    return <LensNote testId="pmax-lens-unread">— {model.reason}</LensNote>;
  if (model.kind === 'empty') {
    return <LensNote testId="pmax-lens-empty">{betaUiText('beta_1886b4beedbc')}</LensNote>;
  }
  if (model.kind === 'search_only') {
    if (!model.winner) {
      return (
        <LensNote testId="pmax-lens-no-pair">
          {betaUiText('beta_26edb2a8b298')}{' '}
          {cardsUnread ? CARDS_UNREAD : betaUiText('beta_b8b618119797')}.
        </LensNote>
      );
    }
    return <AdPair card={model.winner} money={money} size={size} />;
  }
  if (isTile(size)) return <PmaxTile model={model} money={money} />;
  const shown = model.campaigns.slice(0, 2);
  const lead = model.campaigns[0];
  return (
    <div className="space-y-3">
      <div className="@3xl/module:grid @3xl/module:grid-cols-2 @3xl/module:gap-4 space-y-3 @3xl/module:space-y-0">
        {shown.map((campaign) => (
          <CampaignBlock
            campaign={campaign}
            detail={size === 'l' || size === 'w'}
            groupsRead={model.assetGroupsUnread === null}
            key={campaign.id}
            money={money}
          />
        ))}
      </div>
      {model.campaigns.length > shown.length ? (
        <LensNote>
          {model.campaigns.length - shown.length} {betaUiText('beta_ae1299d3f251')}{' '}
          {model.campaigns.length - shown.length === 1
            ? betaUiText('beta_3dc260b24720')
            : betaUiText('beta_7a4c3d21f9c6')}{' '}
          {betaUiText('beta_6ab2884e5aae')}
        </LensNote>
      ) : null}
      {model.assetGroupsUnread ? (
        <LensNote testId="pmax-lens-groups-unread">
          {betaUiText('beta_b39d0cee8904')} {model.assetGroupsUnread}.
        </LensNote>
      ) : null}
      {channels}
      {lead ? (
        <LensTakeaway testId="pmax-lens-takeaway">
          {pmaxLensTakeaway(takeawayOf(lead, model, money))}
        </LensTakeaway>
      ) : null}
      <LensNote testId="pmax-lens-scope">
        {windowRangeLabel(model.window.since, model.window.until)} {betaUiText('beta_93cf62df725c')}{' '}
        {pct(model.share)} {betaUiText('beta_4664848bbd2f')}
      </LensNote>
    </div>
  );
}

function takeawayOf(campaign: PmaxCampaign, model: PmaxRead, money: Money): PmaxLensTakeawayInput {
  const cost = campaign.costPerConversion === null ? null : money(campaign.costPerConversion);
  if (!campaign.goal) return { kind: 'no_goal', share: pct(model.share), cost };
  const position = campaign.multiple === null ? 'at' : positionOf(campaign.multiple);
  return {
    kind: 'goal',
    name: campaign.name,
    cost,
    spend: money(campaign.spend),
    goal: money(campaign.goal.value),
    position,
    gap:
      campaign.multiple === null
        ? ''
        : position === 'over'
          ? multipleText(campaign.multiple)
          : pct(1 - campaign.multiple),
    lostToRank: campaign.lostToRank === null ? null : pct(campaign.lostToRank),
  };
}

function PmaxTile({ model, money }: { model: PmaxRead; money: Money }) {
  const betaUiText = useBetaTranslations('scale');

  const lead = model.campaigns[0];
  if (!lead) return null;
  if (!lead.goal) {
    return (
      <div className="space-y-2.5">
        <LensFigure
          caption={betaUiText('beta_d3d19d52a94d', {
            value0: String(
              lead.costPerConversion === null
                ? ''
                : ` · ${betaUiText('pmaxCostConversion', { cost: money(lead.costPerConversion) })}`,
            ),
          })}
          testId="pmax-lens-headline"
          value={pct(model.share)}
        />
        <ShareBar share={model.share} />
      </div>
    );
  }
  return (
    <div className="space-y-2.5">
      <LensFigure
        caption={
          lead.costPerConversion === null
            ? betaUiText('beta_1293a5162608', {
                value0: String(betaUiText('googleGoalSource', { source: lead.goal.source })),
                value1: String(money(lead.goal.value)),
              })
            : betaUiText('beta_54211ffe7e76', {
                value0: String(betaUiText('googleGoalSource', { source: lead.goal.source })),
                value1: String(money(lead.goal.value)),
                value2: String(
                  lead.multiple !== null && positionOf(lead.multiple) === 'over'
                    ? ` · ${multipleText(lead.multiple)}`
                    : '',
                ),
              })
        }
        testId="pmax-lens-headline"
        value={money(lead.costPerConversion ?? lead.spend)}
      />
      {lead.costPerConversion === null ? null : <Bullet campaign={lead} compact money={money} />}
    </div>
  );
}

/** Performance Max's share of the account's spend as one thin bar. */
function ShareBar({ share }: { share: number }) {
  const betaUiText = useBetaTranslations('scale');

  const reduce = useReducedMotion();
  return (
    <div
      aria-label={betaUiText('beta_73a805c33161', {
        value0: String(pct(share)),
      })}
      className="relative h-2 w-full rounded-full bg-muted"
      role="img"
    >
      <motion.span
        animate={{ scaleX: 1 }}
        className="absolute inset-y-0 left-0 origin-left rounded-full"
        initial={reduce ? false : { scaleX: 0 }}
        style={{ width: `${share * 100}%`, backgroundColor: BOARD_COLOR.pmax }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

/** Where a label sits on a 0–100 track without leaving it: from its left edge near the start,
 *  its right edge near the end, its middle elsewhere. */
function anchorAt(position: number): string {
  if (position < 25) return 'translate-x-0';
  return position > 75 ? '-translate-x-full' : '-translate-x-1/2';
}

/** The cost per conversion as a dot on a track, against the goal's dashed mark; the stretch up
 *  to the goal is the good band. */
function Bullet({
  campaign,
  money,
  compact = false,
}: {
  campaign: PmaxCampaign;
  money: Money;
  compact?: boolean;
}) {
  const betaUiText = useBetaTranslations('scale');

  const reduce = useReducedMotion();
  const cost = campaign.costPerConversion;
  const goal = campaign.goal;
  if (cost === null || !goal) return null;
  const max = Math.max(cost, goal.value) * 1.12;
  const at = (cost / max) * 100;
  const mark = (goal.value / max) * 100;
  const readout = `${betaUiText('googleGoalSource', { source: goal.source })} ${money(goal.value)}${campaign.multiple === null ? '' : ` · ${positionOf(campaign.multiple) === 'over' ? `${multipleText(campaign.multiple)} the goal` : positionOf(campaign.multiple) === 'under' ? `${pct(1 - campaign.multiple)} under it` : 'on it'}`}`;
  return (
    <div className="space-y-0.5">
      <figure
        aria-label={betaUiText('beta_cac0afb6515c', {
          value0: String(money(cost)),
          value1: String(betaUiText('googleGoalSource', { source: goal.source })),
          value2: String(money(goal.value)),
        })}
        className="relative m-0 h-6 w-full"
        data-testid="pmax-lens-bullet"
      >
        <span className="absolute inset-x-0 top-2.5 h-1.5 rounded-full bg-muted" />
        <span
          className="absolute top-2.5 left-0 h-1.5 rounded-full"
          style={{
            width: `${mark}%`,
            backgroundColor: `color-mix(in srgb, ${BOARD_COLOR.below} 28%, transparent)`,
          }}
        />
        <span
          aria-hidden="true"
          className="absolute top-0.5 h-5 border-foreground/60 border-l-[1.5px] border-dashed"
          style={{ left: `${mark}%` }}
        />
        <MarkTip
          label={readout}
          mark={
            <motion.button
              animate={{ left: `${at}%` }}
              aria-label={betaUiText('beta_7564c7e24f74', {
                value0: String(money(cost)),
                value1: String(readout),
              })}
              className="-ml-3 group absolute top-0 grid size-6 place-items-center rounded-full focus-visible:outline-none"
              data-testid="pmax-lens-dot"
              initial={reduce ? false : { left: '0%' }}
              transition={{ type: 'spring', visualDuration: 0.6, bounce: 0.15 }}
              type="button"
            >
              <span
                aria-hidden="true"
                className="size-3 rounded-full ring-2 ring-card group-focus-visible:ring-ring"
                style={{ backgroundColor: costColor(campaign.multiple) }}
              />
            </motion.button>
          }
          value={betaUiText('pmaxCostConversion', { cost: money(cost) })}
        />
      </figure>
      {compact ? null : (
        <div className="relative h-4 text-muted-foreground text-xs">
          <span
            className={cn('absolute top-0 whitespace-nowrap', anchorAt(mark))}
            style={{ left: `${mark}%` }}
          >
            {betaUiText('googleGoalSource', { source: goal.source })} {money(goal.value)}
          </span>
        </div>
      )}
    </div>
  );
}

function RankMeter({ share }: { share: number | null }) {
  const betaUiText = useBetaTranslations('scale');

  if (share === null) {
    return (
      <p className="text-muted-foreground text-xs" data-testid="pmax-lens-rank">
        {betaUiText('beta_4339b933ddd2')}
      </p>
    );
  }
  return (
    <div className="space-y-1" data-testid="pmax-lens-rank">
      <p className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{betaUiText('beta_ed6e67ac9fa1')}</span>
        <span className="font-medium text-foreground tabular-nums">{pct(share)}</span>
      </p>
      <span
        aria-label={betaUiText('beta_09d5a84af7fa', {
          value0: String(pct(share)),
        })}
        className="relative block h-1.5 w-full rounded-full bg-muted"
        role="img"
      >
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${share * 100}%`,
            backgroundColor: BOARD_COLOR.pmax,
          }}
        />
      </span>
    </div>
  );
}

function StrengthLadder({ campaign }: { campaign: PmaxCampaign }) {
  const betaUiText = useBetaTranslations('scale');

  const rated = AD_STRENGTHS.reduce((sum, strength) => sum + campaign.strengths[strength], 0);
  if (campaign.groups.length === 0) {
    return (
      <p className="text-muted-foreground text-xs" data-testid="pmax-lens-strength">
        {betaUiText('beta_ae8d2f1697e8')}
      </p>
    );
  }
  return (
    <div className="space-y-1" data-testid="pmax-lens-strength">
      <p className="text-muted-foreground text-xs">
        {betaUiText('beta_0d8c9dfa5f7f')} {campaign.groups.length} {betaUiText('beta_d59386e0ae43')}{' '}
        {campaign.groups.length === 1
          ? betaUiText('beta_ad936fcbed63')
          : betaUiText('beta_4ed379d418bb')}
        {campaign.unrated > 0
          ? betaUiText('beta_3c768ff6077e', {
              value0: String(campaign.unrated),
            })
          : ''}
      </p>
      <div
        aria-label={betaUiText('beta_b80ce57698f7', {
          value0: String(
            AD_STRENGTHS.map(
              (strength) => `${AD_STRENGTH_LABEL[strength]} ${campaign.strengths[strength]}`,
            ).join(', '),
          ),
        })}
        className="grid grid-cols-4 gap-0.5"
        role="img"
      >
        {AD_STRENGTHS.map((strength) => {
          const count = campaign.strengths[strength];
          const names = campaign.groups
            .filter((group) => group.strength === strength)
            .map((group) => group.name);
          return (
            <div
              className="min-w-0 space-y-1"
              data-count={count}
              data-strength={strength}
              key={strength}
              title={
                names.length > 0 ? `${AD_STRENGTH_LABEL[strength]}: ${names.join(', ')}` : undefined
              }
            >
              <span
                aria-hidden="true"
                className={cn(
                  'block h-1.5 rounded-full',
                  count === 0 && 'border border-border border-dashed',
                )}
                style={{
                  backgroundColor: count > 0 ? STRENGTH_COLOR[strength] : 'transparent',
                }}
              />
              <span
                className={cn(
                  'block truncate text-xs',
                  count > 0 ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                <span className="font-medium tabular-nums">{count}</span>{' '}
                {AD_STRENGTH_LABEL[strength]}
              </span>
            </div>
          );
        })}
      </div>
      {rated === 0 ? (
        <p className="text-muted-foreground text-xs">{betaUiText('beta_07b408cd8b01')}</p>
      ) : null}
    </div>
  );
}

function CampaignBlock({
  campaign,
  money,
  detail,
  groupsRead,
}: {
  campaign: PmaxCampaign;
  money: Money;
  detail: boolean;
  /** False when the account's asset groups were not read: the lens says so once, below. */
  groupsRead: boolean;
}) {
  const formatLocale = useFormatLocale();

  const betaUiText = useBetaTranslations('scale');

  const weakGroup = campaign.groups.find(
    (group) => group.missing.length > 0 && group.strength !== 'EXCELLENT',
  );
  return (
    <section
      aria-label={betaUiText('beta_7fcc70209d54', {
        value0: String(campaign.name),
      })}
      className="min-w-0 space-y-2"
      data-testid="pmax-lens-campaign"
    >
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <p className="min-w-0 truncate font-medium text-foreground text-sm" title={campaign.name}>
          {campaign.name}
          {campaign.status === 'PAUSED' ? (
            <span className="font-normal text-muted-foreground text-xs">
              {' '}
              {betaUiText('beta_cfaba14736c2')}
            </span>
          ) : null}
        </p>
        <p className="shrink-0 text-right text-xs">
          {campaign.costPerConversion === null ? (
            <span className="text-muted-foreground">
              {money(campaign.spend)} {betaUiText('beta_d21e2c8bfbcb')}
            </span>
          ) : (
            <>
              <span className="font-semibold text-foreground text-sm tabular-nums">
                {money(campaign.costPerConversion)}
              </span>{' '}
              <span className="text-muted-foreground">{betaUiText('beta_a8816373fc2b')}</span>
            </>
          )}
        </p>
      </div>
      {campaign.goal && campaign.costPerConversion !== null ? (
        <Bullet campaign={campaign} money={money} />
      ) : (
        <LensNote testId="pmax-lens-no-goal">
          {campaign.goal
            ? betaUiText('beta_3763e1cae84a', {
                value0: String(
                  betaUiText('googleGoalSource', {
                    source: campaign.goal.source,
                  }),
                ),
                value1: String(money(campaign.goal.value)),
              })
            : betaUiText('beta_61716317084c')}
        </LensNote>
      )}
      <p className="text-muted-foreground text-xs tabular-nums">
        {money(campaign.spend)} {betaUiText('beta_f6aea408a041')}{' '}
        {campaign.conversions.toLocaleString(formatLocale, {
          maximumFractionDigits: 1,
        })}{' '}
        {betaUiText('beta_4f2aad5d11f2')}
        {campaign.budgetPerDay === null
          ? ''
          : betaUiText('beta_914a2c4afaa1', {
              value0: String(money(campaign.budgetPerDay)),
            })}
      </p>
      <RankMeter share={campaign.lostToRank} />
      {groupsRead ? <StrengthLadder campaign={campaign} /> : null}
      {detail && weakGroup ? (
        <LensNote testId="pmax-lens-missing">
          {betaUiText('beta_8da4e61d6158')} {weakGroup.name}: {weakGroup.missing.join(' · ')}
        </LensNote>
      ) : null}
      {campaign.finding ? <Finding card={campaign.finding} /> : null}
    </section>
  );
}

/** The Optimizer's rescue-or-pause card, as its producer worded it. */
function Finding({ card }: { card: NonNullable<PmaxCampaign['finding']> }) {
  const betaUiText = useBetaTranslations('scale');

  return (
    <div
      className="space-y-1 rounded-lg border border-border/70 bg-muted/30 px-2.5 py-2 text-xs"
      data-testid="pmax-lens-finding"
    >
      <p className="text-muted-foreground">{betaUiText('beta_aa393c6ba16b')}</p>
      <p className="font-medium text-foreground">{card.headline}</p>
      <ul className="space-y-0.5 text-muted-foreground">
        {card.checklist.map((item) => (
          <li key={item.label}>
            {item.label}
            {item.detail ? ` — ${item.detail}` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The top campaign's spend by channel, ranked, one hue (networkSplit, as PmaxHealth reads it). */
export function ChannelSplitView({
  read,
  currency,
}: {
  read: LensState<GoogleBreakdownRead>;
  currency: string | null;
}) {
  const betaUiText = useBetaTranslations('scale');

  const reduce = useReducedMotion();
  if (read.status === 'loading') {
    return (
      <LensNote testId="pmax-lens-channels-loading">{betaUiText('beta_4ae04903e398')}</LensNote>
    );
  }
  if (read.status !== 'ready') {
    return (
      <LensNote testId="pmax-lens-channels-unread">
        {betaUiText('beta_8af92e4a9742')} {read.status === 'error' ? read.message : read.reason}
      </LensNote>
    );
  }
  const slices = networkSplit(read.data, read.data.currency ?? currency);
  if (slices.length === 0) {
    return (
      <LensNote testId="pmax-lens-channels-unread">{betaUiText('beta_b47c2d24bb83')}</LensNote>
    );
  }
  const money = (value: number) => formatCurrency(value, read.data.currency ?? currency);
  return (
    <section
      aria-label={betaUiText('beta_739301a6a6a2')}
      className="space-y-1"
      data-testid="pmax-lens-channels"
    >
      <p className="font-medium text-muted-foreground text-xs">{betaUiText('beta_739301a6a6a2')}</p>
      <ul className="space-y-1">
        {slices.slice(0, 5).map((slice) => (
          <li
            className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-2 text-xs"
            data-testid="pmax-lens-channel"
            key={slice.network}
          >
            <span className="truncate text-foreground">{slice.network}</span>
            <span className="relative block h-1.5 rounded-full bg-muted">
              <motion.span
                animate={{ scaleX: 1 }}
                className="absolute inset-y-0 left-0 origin-left rounded-full"
                initial={reduce ? false : { scaleX: 0 }}
                style={{
                  width: `${(slice.share ?? 0) * 100}%`,
                  backgroundColor: BOARD_COLOR.pmax,
                }}
                title={`${slice.network} · ${slice.share === null ? '—' : pct(slice.share)} · ${money(slice.spend)}`}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              />
            </span>
            <span className="text-right text-muted-foreground tabular-nums">
              <span className="font-medium text-foreground">
                {slice.share === null ? '—' : pct(slice.share)}
              </span>{' '}
              · {money(slice.spend)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The best ad of a group against the dearer one (G10): the headlines are Google's, the prices
 *  the Optimizer's. */
function AdPair({
  card,
  money,
  size,
}: {
  card: AdWinnerCard;
  money: Money;
  size: BoardModuleSize;
}) {
  const formatLocale = useFormatLocale();

  const betaUiText = useBetaTranslations('scale');

  const reduce = useReducedMotion();
  const cardMoney: Money = card.currency ? (value) => formatCurrency(value, card.currency) : money;
  const ratio = card.comparator.cost_per_result / card.winner.cost_per_result;
  const ads = [
    {
      role: 'winner' as const,
      label: card.winner.label,
      cost: card.winner.cost_per_result,
    },
    {
      role: 'comparator' as const,
      label: card.comparator.label,
      cost: card.comparator.cost_per_result,
    },
  ];
  const max = Math.max(...ads.map((ad) => ad.cost));
  if (isTile(size)) {
    return (
      <div className="space-y-2.5">
        <LensFigure
          caption={betaUiText('beta_710738e4fd08', {
            value0: String(cardMoney(card.comparator.cost_per_result)),
          })}
          testId="pmax-lens-headline"
          value={cardMoney(card.winner.cost_per_result)}
        />
        <PairBars ads={ads} max={max} money={cardMoney} reduce={reduce} />
      </div>
    );
  }
  return (
    <div className="space-y-3" data-testid="pmax-lens-ad-pair">
      <LensNote>
        {betaUiText('beta_746c34f503f9')} {card.ad_group_name} ({card.campaign_name}
        {betaUiText('beta_a7e2c1547429')}
      </LensNote>
      <div className="grid @md/module:grid-cols-2 grid-cols-1 gap-2">
        {ads.map((ad) => (
          <div
            className="min-w-0 space-y-1 rounded-lg border border-border/70 px-3 py-2"
            data-role={ad.role}
            data-testid="pmax-lens-ad"
            key={ad.role}
          >
            <p className="text-muted-foreground text-xs">
              {ad.role === 'winner'
                ? betaUiText('beta_335dd51a3af2')
                : betaUiText('beta_0537d08e8e40')}
            </p>
            <p className="break-words font-medium text-foreground text-sm">{ad.label}</p>
            <p className="text-xs">
              <span className="font-semibold text-foreground text-sm tabular-nums">
                {cardMoney(ad.cost)}
              </span>{' '}
              <span className="text-muted-foreground">
                {betaUiText('beta_a8816373fc2b')}
                {ad.role === 'winner'
                  ? betaUiText('beta_ca344a520c82', {
                      value0: String(
                        card.winner.conversions.toLocaleString(formatLocale, {
                          maximumFractionDigits: 1,
                        }),
                      ),
                    })
                  : ''}
              </span>
            </p>
          </div>
        ))}
      </div>
      <PairBars ads={ads} max={max} money={cardMoney} reduce={reduce} />
      {card.best_assets.length > 0 ? (
        <LensNote>
          {betaUiText('beta_3695b60c217f')} {card.best_assets.join(' · ')}
        </LensNote>
      ) : null}
      <LensTakeaway testId="pmax-lens-takeaway">
        {pmaxLensTakeaway({
          kind: 'winner',
          winner: card.winner.label,
          winnerCost: cardMoney(card.winner.cost_per_result),
          comparator: card.comparator.label,
          comparatorCost: cardMoney(card.comparator.cost_per_result),
          ratio: multipleText(ratio),
        })}
      </LensTakeaway>
      <LensNote testId="pmax-lens-scope">
        {betaUiText('beta_cfa82909a443')} {card.window_days} {betaUiText('beta_061da913ced7')}
      </LensNote>
    </div>
  );
}

function PairBars({
  ads,
  max,
  money,
  reduce,
}: {
  ads: { role: 'winner' | 'comparator'; label: string; cost: number }[];
  max: number;
  money: Money;
  reduce: boolean | null;
}) {
  const betaUiText = useBetaTranslations('scale');

  return (
    <div className="space-y-1">
      <ul className="space-y-0.5" data-testid="pmax-lens-pair-bars">
        {ads.map((ad) => (
          <li key={ad.role}>
            <MarkTip
              label={ad.label}
              mark={
                <button
                  aria-label={betaUiText('beta_7564c7e24f74', {
                    value0: String(money(ad.cost)),
                    value1: String(ad.label),
                  })}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md py-1 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  type="button"
                >
                  <span className="relative block h-2 rounded-full bg-muted">
                    <motion.span
                      animate={{ scaleX: 1 }}
                      className="absolute inset-y-0 left-0 origin-left rounded-full"
                      initial={reduce ? false : { scaleX: 0 }}
                      style={{
                        width: `${(ad.cost / max) * 100}%`,
                        backgroundColor:
                          ad.role === 'winner' ? BOARD_COLOR.below : BOARD_COLOR.above,
                      }}
                      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </span>
                  <span className="text-muted-foreground tabular-nums">{money(ad.cost)}</span>
                </button>
              }
              value={betaUiText('pmaxCostConversion', { cost: money(ad.cost) })}
            />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs">
        <LegendKey color={BOARD_COLOR.below}>{betaUiText('beta_335dd51a3af2')}</LegendKey>
        <LegendKey color={BOARD_COLOR.above}>{betaUiText('beta_0537d08e8e40')}</LegendKey>
      </div>
    </div>
  );
}

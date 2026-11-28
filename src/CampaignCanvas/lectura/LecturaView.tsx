'use client';

// Lectura: a campaign laid out to be READ (design C, options 20 over 4 and 19), at three sizes
// of one drawing (option 27): `chat` — a compact summary card in the conversation, changes
// first, the budget before → after and "Open in canvas"; `panel` — the companion pane at 100%
// in 640 px; `page` — the full Canvas page, wider. All three read the one campaign model
// (lib/campaign-canvas/lectura.ts). The changes come first, one card each, and a card opens in
// place into its ad set; then the daily total with its split; then one card per ad set (or a
// table past LECTURA_TABLE_THRESHOLD ad sets). Read-only: approving stays on the chat card.

import {
  ChevronDown,
  ChevronRight,
  ImageIcon,
  Images,
  PanelRightOpen,
  PlayCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import {
  type BudgetSlice,
  humanStatus,
  type LecturaAd,
  type LecturaAdSet,
  type LecturaChange,
  type LecturaMark,
  type LecturaModel,
  type LecturaRow,
  lecturaMoney,
  prefersLecturaTable,
} from '@/lib/campaign-canvas/lectura';
import {
  type CampaignLevelWord,
  type CampaignPlatform,
  type PlatformLabels,
  platformLabelsOf,
} from '@/lib/campaign-canvas/platformLabels';
import { cn } from '@/lib/utils';

const CARD_TONE: Record<LecturaMark, string> = {
  changed: 'border-[color:var(--warning)] ring-2 ring-[color:var(--warning)]/15',
  added: 'border-[color:var(--success)] bg-[color:var(--success)]/8',
  paused: 'border-[color:var(--destructive)] bg-[color:var(--destructive)]/8',
  // Only when two versions are compared: what the earlier one had, struck and greyed.
  removed: 'border-dashed border-muted-foreground/40 bg-muted/40 opacity-75',
  unchanged: 'border-border',
};

const TAG = {
  changed: {
    labelKey: 'changes_bbd4b6a',
    className: 'bg-[color:var(--warning)]/15 text-[color:var(--warning)]',
  },
  added: { labelKey: 'new_paused_d92c248', className: 'bg-[color:var(--success)] text-white' },
  paused: { labelKey: 'pauses_395dbf5', className: 'bg-[color:var(--destructive)] text-white' },
  removed: { labelKey: 'removed_4118fb4', className: 'bg-muted text-muted-foreground' },
  unchanged: null,
} as const satisfies Record<LecturaMark, { labelKey: string; className: string } | null>;

const SLICE_TONE: Record<BudgetSlice['tone'], string> = {
  kept: 'bg-primary/55',
  changed: 'bg-[color:var(--warning)]',
  removed: 'bg-muted-foreground/25',
  new: 'bg-[color:var(--success)]',
};

const SLICE_LABEL_KEY = {
  kept: 'unchanged_88b6f74',
  changed: 'changes_bbd4b6a',
  removed: 'stops_877a888',
  new: 'new_paused_95c8721',
} as const satisfies Record<BudgetSlice['tone'], string>;

/** The platform's word for a level, as the select value the catalog's messages switch on. */
export type LevelNoun = 'campaign' | 'adSet' | 'adGroup' | 'assetGroup' | 'ad' | 'asset';

export const levelNounOf = (labels: PlatformLabels, level: CampaignLevelWord): LevelNoun => {
  if (level === 'campaign') return 'campaign';
  if (level === 'ad') return labels.hasAds ? 'ad' : 'asset';
  if (labels.platform === 'meta') return 'adSet';
  return labels.hasAds ? 'adGroup' : 'assetGroup';
};

/** Whose campaign this is — Meta, Google Search, Google PMax, TikTok — beside the header. */
export function PlatformChip({ platform }: { platform: CampaignPlatform }) {
  return (
    <span
      className="shrink-0 rounded-md border border-border bg-background px-1.5 py-px font-mono text-[10.5px] uppercase leading-4 tracking-wide text-muted-foreground"
      data-testid="platform-chip"
      data-platform={platform}
    >
      {platformLabelsOf(platform).chip}
    </span>
  );
}

function MarkTag({ mark }: { mark: LecturaMark }) {
  const uiText = useTranslations('scale');
  const tag = TAG[mark];
  if (!tag) return null;
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2 py-px font-mono text-[11px] leading-5',
        tag.className,
      )}
    >
      {uiText(tag.labelKey)}
    </span>
  );
}

function BeforeAfter({ before, after }: { before: string; after: string }) {
  return (
    <span className="tabular-nums">
      <span className="text-muted-foreground line-through">{before}</span>
      <span className="px-1 text-muted-foreground">→</span>
      <span className="font-semibold">{after}</span>
    </span>
  );
}

function Rows({ rows }: { rows: LecturaRow[] }) {
  if (rows.length === 0) return null;
  return (
    <ul className="grid gap-0.5">
      {rows.map((row) => (
        <li key={`${row.field}:${row.before}:${row.after}`} className="text-[13px]">
          <span className="text-muted-foreground">{row.label}: </span>
          <BeforeAfter before={row.before} after={row.after} />
        </li>
      ))}
    </ul>
  );
}

const KIND_ICON = { image: ImageIcon, video: PlayCircle, carousel: Images } as const;

/** Meta says ACTIVE, Google ENABLED: delivering needs no word of its own. */
const DELIVERING_STATUS = new Set(['ACTIVE', 'ENABLED']);

function AdThumb({ ad }: { ad: LecturaAd }) {
  const Icon = ad.creativeKind ? KIND_ICON[ad.creativeKind] : ImageIcon;
  // A signed thumbnail URL expires; a broken image reads worse than the typed placeholder.
  const [failed, setFailed] = React.useState(false);
  return ad.thumbnailUrl && !failed ? (
    <img
      src={ad.thumbnailUrl}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="size-10 shrink-0 rounded-md border border-border object-cover"
    />
  ) : (
    <span
      aria-hidden
      className="grid size-10 shrink-0 place-items-center rounded-md border border-border bg-muted text-muted-foreground"
    >
      <Icon className="size-4" />
    </span>
  );
}

const ADS_SHOWN = 6;

function AdList({ ads, labels }: { ads: LecturaAd[]; labels: PlatformLabels }) {
  const uiText = useTranslations('scale');
  const [showAll, setShowAll] = React.useState(false);
  const adNoun = levelNounOf(labels, 'ad');
  if (ads.length === 0) {
    return (
      <p className="text-[13px] text-muted-foreground">
        {uiText('noun_select_asset_no_assets_read_other_no_ads_77c2d70', { noun: adNoun })}
      </p>
    );
  }
  const shown = showAll ? ads : ads.slice(0, ADS_SHOWN);
  return (
    <ul className="grid gap-1.5">
      {shown.map((ad) => (
        <li
          key={ad.id}
          className={cn('flex min-w-0 items-center gap-2', ad.stops && 'opacity-55')}
          data-testid={`lectura-ad-${ad.id}`}
        >
          <AdThumb ad={ad} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium">{ad.name}</span>
            {ad.stops ? (
              <span className="block text-xs text-muted-foreground">
                {uiText('stops_with_its_noun_select_adgroup_ad_group_a_3d9e83f', {
                  noun: levelNounOf(labels, 'adset'),
                })}
              </span>
            ) : ad.mark !== 'unchanged' ? (
              <span className="block text-xs text-muted-foreground">
                {(() => {
                  const tag = TAG[ad.mark];
                  return tag ? uiText(tag.labelKey) : null;
                })()}
              </span>
            ) : null}
          </span>
        </li>
      ))}
      {ads.length > ADS_SHOWN ? (
        <li>
          <button
            type="button"
            className="text-[13px] font-medium text-primary-ink hover:underline focus-visible:underline focus-visible:outline-none"
            onClick={() => setShowAll((value) => !value)}
          >
            {showAll
              ? uiText('show_fewer_255beb6')
              : uiText('noun_select_asset_show_all_count_assets_other_0b35fa1', {
                  noun: adNoun,
                  count: ads.length,
                })}
          </button>
        </li>
      ) : null}
    </ul>
  );
}

function BudgetLine({ adSet, currency }: { adSet: LecturaAdSet; currency: string | null }) {
  const uiText = useTranslations('scale');
  const before = lecturaMoney(adSet.budgetBefore, currency);
  const after = lecturaMoney(adSet.budgetAfter, currency);
  if (!before && !after) return null;
  const budgetRowShown = adSet.rows.some((row) => row.field === 'daily_budget');
  if (budgetRowShown) return null;
  if (adSet.mark === 'paused' || adSet.stopsWithParent) {
    // Under a campaign budget the ad set has none of its own to stop.
    return before ? (
      <BeforeAfter
        before={uiText('amount_day_b6ffd42', { amount: before })}
        after={uiText('stops_93dc772')}
      />
    ) : null;
  }
  return (
    <span className="tabular-nums">
      {uiText('amount_day_b6ffd42', { amount: after ?? before ?? '—' })}
    </span>
  );
}

function ProvenancePills({ adSet }: { adSet: LecturaAdSet }) {
  const uiText = useTranslations('scale');
  if (!adSet.provenance) return null;
  const { userGave, jainaFilled, jainaAsks } = adSet.provenance;
  return (
    <div className="flex flex-wrap gap-1">
      {userGave > 0 ? (
        <span className="rounded-full bg-sky-500/12 px-2 py-px text-xs text-sky-700 dark:text-sky-300">
          {uiText('you_gave_count_13a97b0', { count: userGave })}
        </span>
      ) : null}
      {jainaFilled > 0 ? (
        <span className="rounded-full bg-primary/10 px-2 py-px text-xs text-primary-ink">
          {uiText('jaina_filled_count_c1d04d4', { count: jainaFilled })}
        </span>
      ) : null}
      {jainaAsks > 0 ? (
        <span className="rounded-full bg-[color:var(--warning)]/15 px-2 py-px text-xs text-[color:var(--warning)]">
          {uiText('jaina_asks_count_6b5ad81', { count: jainaAsks })}
        </span>
      ) : null}
    </div>
  );
}

/** Performance Max: an asset group holds a pool of assets, not ads — one line says what. */
function AssetSummary({ adSet }: { adSet: LecturaAdSet }) {
  const uiText = useTranslations('scale');
  return (
    <p className="text-[13px] text-muted-foreground" data-testid={`lectura-assets-${adSet.id}`}>
      <span className="font-medium text-foreground">{uiText('assets_bd12731')}</span>
      {' · '}
      {adSet.assetSummary ?? uiText('no_assets_read_2b9e7cf')}
    </p>
  );
}

export function LecturaAdSetCard({
  adSet,
  currency,
  dimUnchanged,
  labels = platformLabelsOf('meta'),
}: {
  adSet: LecturaAdSet;
  currency: string | null;
  dimUnchanged: boolean;
  labels?: PlatformLabels;
}) {
  const uiText = useTranslations('scale');
  const stopped = adSet.mark === 'paused' || adSet.stopsWithParent;
  return (
    <article
      className={cn(
        'grid min-w-0 content-start gap-2 rounded-xl border-[1.5px] bg-card p-3 text-[13px]',
        CARD_TONE[adSet.mark],
        dimUnchanged && adSet.mark === 'unchanged' && !adSet.stopsWithParent && 'opacity-70',
      )}
      data-testid={`lectura-adset-${adSet.id}`}
      data-mark={adSet.mark}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <h4
          className={cn(
            'min-w-0 break-words text-sm font-semibold leading-snug',
            adSet.mark === 'removed' && 'text-muted-foreground line-through',
          )}
        >
          {adSet.name}
        </h4>
        <MarkTag mark={adSet.stopsWithParent ? 'paused' : adSet.mark} />
      </div>
      {adSet.basedOnName ? (
        <p className="text-xs text-[color:var(--success)]">
          {uiText('based_on_name_9a7e4af', { name: adSet.basedOnName })}
        </p>
      ) : null}
      <Rows rows={stopped ? adSet.rows.filter((row) => row.field !== 'status') : adSet.rows} />
      <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-muted-foreground">
        <BudgetLine adSet={adSet} currency={currency} />
        {adSet.audience ? <span className="min-w-0 break-words">{adSet.audience}</span> : null}
        {adSet.status && !stopped && !DELIVERING_STATUS.has(adSet.status) ? (
          <span className="opacity-75">{humanStatus(adSet.status)}</span>
        ) : null}
        {adSet.stopsWithParent ? <span>{uiText('stops_with_its_campaign_ceccf6a')}</span> : null}
      </div>
      <ProvenancePills adSet={adSet} />
      {labels.hasAds ? <AdList ads={adSet.ads} labels={labels} /> : <AssetSummary adSet={adSet} />}
    </article>
  );
}

function ChangeCard({
  change,
  adSet,
  currency,
  labels,
  expanded,
  onToggle,
}: {
  change: LecturaChange;
  adSet: LecturaAdSet | null;
  currency: string | null;
  labels: PlatformLabels;
  expanded: boolean;
  onToggle: () => void;
}) {
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <li
      className={cn('min-w-0 rounded-xl border-[1.5px] bg-card', CARD_TONE[change.mark])}
      data-testid={`lectura-change-${change.id}`}
      data-mark={change.mark}
    >
      <button
        type="button"
        className="grid w-full min-w-0 gap-1 rounded-xl p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-default"
        aria-expanded={adSet ? expanded : undefined}
        onClick={onToggle}
        disabled={!adSet}
      >
        <span className="flex min-w-0 items-center justify-between gap-2">
          <span className="flex min-w-0 items-baseline gap-1 text-xs text-muted-foreground">
            <span className="min-w-0 truncate">{change.campaignName}</span>
            {change.adSetName ? (
              <>
                <span aria-hidden>›</span>
                <span className="min-w-0 max-w-[65%] shrink-0 truncate font-medium text-foreground/80">
                  {change.adSetName}
                </span>
              </>
            ) : null}
          </span>
          <MarkTag mark={change.mark} />
        </span>
        <span className="flex min-w-0 items-start gap-1.5">
          {adSet ? <Chevron className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : null}
          <span
            className={cn(
              'min-w-0 break-words text-sm font-semibold leading-snug',
              change.mark === 'removed' && 'text-muted-foreground line-through',
            )}
          >
            {change.title}
          </span>
        </span>
        <Rows
          rows={change.rows.filter((row) => row.field !== 'status' || change.mark === 'changed')}
        />
        {change.basis ? (
          <span className="text-[13px] text-muted-foreground">{change.basis}</span>
        ) : null}
      </button>
      {expanded && adSet ? (
        <div
          className="border-t border-border/70 p-2"
          data-testid={`lectura-change-${change.id}-expanded`}
        >
          <LecturaAdSetCard
            adSet={adSet}
            currency={currency}
            dimUnchanged={false}
            labels={labels}
          />
        </div>
      ) : null}
    </li>
  );
}

function BudgetBand({ model }: { model: LecturaModel }) {
  const uiText = useTranslations('scale');
  const { before, after, newWhenActivated } = model.totals;
  const currency = model.currency;
  if (after === null && before === null && newWhenActivated === 0) return null;
  const total = model.split.reduce((sum, slice) => sum + slice.minor, 0);
  const tones = [...new Set(model.split.map((slice) => slice.tone))];
  return (
    <section
      className="grid gap-2 rounded-xl border border-border bg-card p-3"
      aria-label={uiText('daily_budget_7b0a1f0')}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {uiText('daily_budget_7b0a1f0')}
        </span>
        <span className="text-[15px] font-semibold tabular-nums">
          {model.kind === 'change' && before !== null && after !== null && before !== after ? (
            <BeforeAfter
              before={lecturaMoney(before, currency) ?? ''}
              after={uiText('amount_day_b6ffd42', { amount: lecturaMoney(after, currency) ?? '—' })}
            />
          ) : (
            uiText('amount_day_b6ffd42', { amount: lecturaMoney(after ?? before, currency) ?? '—' })
          )}
        </span>
      </div>
      {newWhenActivated > 0 ? (
        <p className="text-[13px] text-muted-foreground">
          {uiText('amount_day_once_the_new_paused_items_are_acti_b93ac45', {
            amount: lecturaMoney(newWhenActivated, currency) ?? '—',
          })}
        </p>
      ) : null}
      {total > 0 ? (
        <>
          <div
            className="flex h-2.5 gap-0.5 overflow-hidden rounded-full"
            data-testid="lectura-split"
          >
            {model.split.map((slice) => (
              <span
                key={slice.id}
                title={`${slice.name}: ${lecturaMoney(slice.minor, currency)}`}
                className={cn('h-full min-w-1', SLICE_TONE[slice.tone])}
                style={{ flexGrow: slice.minor, flexBasis: 0 }}
                data-tone={slice.tone}
              />
            ))}
          </div>
          {tones.length > 1 ? (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {tones.map((tone) => (
                <span key={tone} className="inline-flex items-center gap-1.5">
                  <span className={cn('size-2 rounded-full', SLICE_TONE[tone])} />
                  {uiText(SLICE_LABEL_KEY[tone])}
                </span>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function LecturaTable({ model }: { model: LecturaModel }) {
  const uiText = useTranslations('scale');
  const labels = platformLabelsOf(model.platform);
  return (
    <div
      className="overflow-x-auto rounded-xl border border-border bg-card"
      data-testid="lectura-table"
    >
      <table className="w-full min-w-[520px] border-collapse text-[13px] tabular-nums">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 font-medium">
              {uiText('noun_select_campaign_campaign_adset_ad_set_ad_52714c8', {
                noun: levelNounOf(labels, 'adset'),
              })}
            </th>
            <th className="px-3 py-2 font-medium">{uiText('budget_day_050231b')}</th>
            <th className="px-3 py-2 font-medium">{uiText('lecturaChangeColumn')}</th>
            <th className="px-3 py-2 text-right font-medium">
              {labels.hasAds ? uiText('ads_9210f3b') : uiText('assets_bd12731')}
            </th>
          </tr>
        </thead>
        <tbody>
          {model.campaigns.map((campaign) => (
            <React.Fragment key={campaign.id}>
              <tr className="border-t border-border bg-muted/50">
                <td colSpan={4} className="px-3 py-2 font-semibold">
                  {campaign.name}
                </td>
              </tr>
              {campaign.adSets.map((adSet) => {
                const stopped = adSet.mark === 'paused' || adSet.stopsWithParent;
                return (
                  <tr
                    key={adSet.id}
                    className={cn(
                      'border-t border-border',
                      adSet.mark === 'changed' && 'bg-[color:var(--warning)]/10',
                      adSet.mark === 'added' && 'bg-[color:var(--success)]/10',
                      stopped && 'bg-[color:var(--destructive)]/8',
                    )}
                    data-testid={`lectura-row-${adSet.id}`}
                    data-mark={adSet.mark}
                  >
                    <td className="max-w-[220px] px-3 py-2">
                      <span className="block break-words font-medium">{adSet.name}</span>
                      {adSet.basedOnName ? (
                        <span className="block text-xs text-[color:var(--success)]">
                          {uiText('based_on_name_9a7e4af', { name: adSet.basedOnName })}
                        </span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {stopped && adSet.budgetBefore !== null ? (
                        <BeforeAfter
                          before={lecturaMoney(adSet.budgetBefore, model.currency) ?? ''}
                          after={uiText('stops_93dc772')}
                        />
                      ) : adSet.budgetBefore !== null &&
                        adSet.budgetAfter !== null &&
                        adSet.budgetBefore !== adSet.budgetAfter ? (
                        <BeforeAfter
                          before={lecturaMoney(adSet.budgetBefore, model.currency) ?? ''}
                          after={lecturaMoney(adSet.budgetAfter, model.currency) ?? ''}
                        />
                      ) : (
                        (lecturaMoney(adSet.budgetAfter ?? adSet.budgetBefore, model.currency) ??
                        '—')
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {stopped ? (
                        <span className="text-[color:var(--destructive)]">
                          {adSet.stopsWithParent
                            ? uiText('stops_with_campaign_27d8ac4')
                            : uiText('pauses_395dbf5')}
                        </span>
                      ) : adSet.mark === 'added' ? (
                        <span className="text-[color:var(--success)]">
                          {uiText('new_paused_95c8721')}
                        </span>
                      ) : adSet.rows.length > 0 ? (
                        adSet.rows
                          .filter((row) => row.field !== 'daily_budget')
                          .map((row) => row.label)
                          .join(' · ') || uiText('budget_1c6225e')
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {labels.hasAds ? adSet.ads.length : (adSet.assetSummary ?? '—')}
                    </td>
                  </tr>
                );
              })}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type LecturaLayout = 'cards' | 'table';

/** One drawing, three sizes: the chat's summary card, the companion pane, the Canvas page. */
export type CampaignViewSize = 'chat' | 'panel' | 'page';

/** The chat keeps the first few changes; the rest wait behind "Open in canvas". */
export const CHAT_CHANGES_SHOWN = 3;

/** A new campaign has no changes to list: the chat names its first few ad sets instead. */
export const CHAT_AD_SETS_SHOWN = 4;

/** A brand-new campaign at chat size: one line per ad set — name, budget, how many ads. */
function ChatAdSetLines({ model, labels }: { model: LecturaModel; labels: PlatformLabels }) {
  const uiText = useTranslations('scale');
  const adSets = model.campaigns.flatMap((campaign) => campaign.adSets);
  const shown = adSets.slice(0, CHAT_AD_SETS_SHOWN);
  const more = adSets.length - shown.length;
  if (shown.length === 0) return null;
  return (
    <ul
      className="grid divide-y divide-border/70 rounded-lg border border-border text-[13px]"
      data-testid="lectura-chat-adsets"
    >
      {shown.map((adSet) => {
        const budget = lecturaMoney(adSet.budgetMinor, model.currency);
        const detail = [
          budget ? uiText('amount_day_b6ffd42', { amount: budget }) : null,
          labels.hasAds
            ? uiText('count_plural_one_ad_other_ads_a7f5665', { count: adSet.ads.length })
            : adSet.assetSummary,
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <li key={adSet.id} className="flex min-w-0 items-baseline gap-2 px-2.5 py-1.5">
            <span className="min-w-0 flex-1 truncate font-medium" title={adSet.name}>
              {adSet.name}
            </span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{detail}</span>
          </li>
        );
      })}
      {more > 0 ? (
        <li className="px-2.5 py-1.5 text-xs text-muted-foreground">
          {uiText('noun_select_adgroup_count_plural_one_ad_group_a0b39d8', {
            noun: levelNounOf(labels, 'adset'),
            count: more,
          })}
        </li>
      ) : null}
    </ul>
  );
}

/** The daily total as one line: "$1,150 → $1,000/day", or "$600/day". */
function BudgetSummary({ model }: { model: LecturaModel }) {
  const uiText = useTranslations('scale');
  const { before, after, newWhenActivated } = model.totals;
  if (before === null && after === null) return null;
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
      <span className="text-muted-foreground">{uiText('daily_budget_7b0a1f0')}</span>
      <span className="font-semibold tabular-nums">
        {before !== null && after !== null && before !== after ? (
          <BeforeAfter
            before={lecturaMoney(before, model.currency) ?? ''}
            after={uiText('amount_day_b6ffd42', {
              amount: lecturaMoney(after, model.currency) ?? '—',
            })}
          />
        ) : (
          uiText('amount_day_b6ffd42', {
            amount: lecturaMoney(after ?? before, model.currency) ?? '—',
          })
        )}
      </span>
      {newWhenActivated > 0 ? (
        <span className="text-xs text-muted-foreground">
          {uiText('amount_once_activated_72a4b86', {
            amount: lecturaMoney(newWhenActivated, model.currency) ?? '—',
          })}
        </span>
      ) : null}
    </p>
  );
}

/**
 * The chat's size: the changes first (no expanding — the canvas is one click away), the
 * budget before → after, and "Open in canvas". Drawn by the same pieces as the pane.
 */
const OPEN_CLASS =
  'inline-flex w-fit items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[13px] font-medium text-primary-ink hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary';

export function LecturaChatCard({
  model,
  title,
  onOpen,
  openHref,
  testId = 'lectura-chat-card',
}: {
  model: LecturaModel;
  title?: string | null;
  onOpen?: () => void;
  /** Where no canvas sits beside the chat: "Open in canvas" goes to the Canvas page. */
  openHref?: string | null;
  testId?: string;
}) {
  const uiText = useTranslations('scale');
  const labels = platformLabelsOf(model.platform);
  const shown = model.changes.slice(0, CHAT_CHANGES_SHOWN);
  const more = model.changes.length - shown.length;
  return (
    <section
      className="grid min-w-0 gap-2.5 rounded-xl border border-border bg-card p-3"
      data-testid={testId}
      data-size="chat"
      data-platform={model.platform}
      aria-label={title ?? uiText('campaign_changes_ce69fd3')}
    >
      <header className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <h3 className="flex min-w-0 items-baseline gap-2 break-words text-sm font-semibold leading-snug">
          <PlatformChip platform={model.platform} />
          <span className="min-w-0">
            {title ?? model.campaigns[0]?.name ?? uiText('campaign_268286d')}
          </span>
        </h3>
        {/* A given title (Jaina's subject) already counts the changes; the campaign name does not. */}
        <span className={cn('text-xs text-muted-foreground', title && 'sr-only')}>
          {model.changes.length === 0
            ? uiText('noun_select_adgroup_count_plural_one_ad_group_f809ceb', {
                noun: levelNounOf(labels, 'adset'),
                count: model.adSetCount,
              })
            : uiText('total_plural_one_change_other_changes_2c7ce12', {
                total: model.changes.length,
              })}
        </span>
      </header>
      {shown.length > 0 ? (
        <ul className="grid gap-1.5">
          {shown.map((change) => (
            <ChangeCard
              key={change.id}
              change={change}
              adSet={null}
              currency={model.currency}
              labels={labels}
              expanded={false}
              onToggle={() => {}}
            />
          ))}
        </ul>
      ) : null}
      {more > 0 ? (
        <p className="text-xs text-muted-foreground">
          {uiText('count_plural_one_more_change_other_more_chang_2218a4f', { count: more })}
        </p>
      ) : null}
      {model.changes.length === 0 ? <ChatAdSetLines model={model} labels={labels} /> : null}
      <BudgetSummary model={model} />
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className={OPEN_CLASS}
          data-testid="lectura-open-in-canvas"
        >
          <PanelRightOpen className="size-3.5" aria-hidden />
          {uiText('open_in_canvas_02597bb')}
        </button>
      ) : openHref ? (
        <Link href={openHref} className={OPEN_CLASS} data-testid="lectura-open-in-canvas">
          <PanelRightOpen className="size-3.5" aria-hidden />
          {uiText('open_in_canvas_02597bb')}
        </Link>
      ) : null}
    </section>
  );
}

export function LecturaView({
  model,
  initialExpandedId = null,
  initialLayout,
  size = 'panel',
  title,
  onOpen,
  openHref,
}: {
  model: LecturaModel;
  initialExpandedId?: string | null;
  initialLayout?: LecturaLayout;
  size?: CampaignViewSize;
  /** `chat` only: the card's heading (defaults to the campaign name). */
  title?: string | null;
  /** `chat` only: opens the companion canvas on this campaign. */
  onOpen?: () => void;
  /** `chat` only, without `onOpen`: the Canvas page for this campaign. */
  openHref?: string | null;
}) {
  if (size === 'chat') {
    return <LecturaChatCard model={model} title={title} onOpen={onOpen} openHref={openHref} />;
  }
  return (
    <LecturaPane
      model={model}
      initialExpandedId={initialExpandedId}
      initialLayout={initialLayout}
      size={size}
    />
  );
}

function LecturaPane({
  model,
  initialExpandedId,
  initialLayout,
  size,
}: {
  model: LecturaModel;
  initialExpandedId: string | null;
  initialLayout?: LecturaLayout;
  size: Exclude<CampaignViewSize, 'chat'>;
}) {
  const uiText = useTranslations('scale');
  const [expandedId, setExpandedId] = React.useState<string | null>(initialExpandedId);
  const [layout, setLayout] = React.useState<LecturaLayout>(
    initialLayout ?? (prefersLecturaTable(model) ? 'table' : 'cards'),
  );
  const adSetById = React.useMemo(
    () =>
      new Map(
        model.campaigns.flatMap((campaign) => campaign.adSets.map((adSet) => [adSet.id, adSet])),
      ),
    [model],
  );
  const labels = platformLabelsOf(model.platform);
  // A live edit and a campaign copy both carry changes; a brand-new campaign carries none.
  const showChanges = model.changes.length > 0;
  const multiCampaign = model.campaigns.length > 1;
  const adSetNoun = levelNounOf(labels, 'adset');
  const adSetCountText = uiText('noun_select_adgroup_count_plural_one_ad_group_f809ceb', {
    noun: adSetNoun,
    count: model.adSetCount,
  });

  return (
    <div
      className="h-full min-h-0 overflow-y-auto overflow-x-hidden bg-background"
      data-testid="lectura-view"
      data-kind={model.kind}
      data-size={size}
    >
      <div
        className={cn(
          '@container mx-auto grid w-full gap-4 px-3 pb-3 sm:px-4 sm:pb-4',
          // The Canvas page floats its bar over Read and measures it (--canvas-bar-clearance);
          // no shorthand may undo that at a breakpoint, or the budget band sits under the bar.
          size === 'page'
            ? 'max-w-6xl pt-[var(--canvas-bar-clearance,4rem)]'
            : 'max-w-3xl pt-3 sm:pt-4',
        )}
      >
        {showChanges ? (
          <section className="grid gap-2" aria-label={uiText('changes_bbd4b6a')}>
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {uiText('total_plural_one_change_other_changes_2c7ce12', {
                total: model.changes.length,
              })}
            </h3>
            <ul className="grid gap-2">
              {model.changes.map((change) => {
                const adSet = change.adSetId ? (adSetById.get(change.adSetId) ?? null) : null;
                return (
                  <ChangeCard
                    key={change.id}
                    change={change}
                    adSet={adSet}
                    currency={model.currency}
                    labels={labels}
                    expanded={expandedId === change.id}
                    onToggle={() =>
                      setExpandedId((current) => (current === change.id ? null : change.id))
                    }
                  />
                );
              })}
            </ul>
          </section>
        ) : null}

        <BudgetBand model={model} />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {showChanges
              ? uiText('whole_campaign_adsets_1696677', { adSets: adSetCountText })
              : adSetCountText}
          </h3>
          <fieldset
            aria-label={uiText('layout_a511909')}
            className="inline-flex rounded-lg border border-border bg-card p-0.5 text-[13px]"
          >
            {(['cards', 'table'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={layout === value}
                onClick={() => setLayout(value)}
                className={cn(
                  'rounded-md px-2.5 py-1 font-medium focus-visible:outline-2 focus-visible:outline-primary',
                  layout === value ? 'bg-primary/12 text-foreground' : 'text-muted-foreground',
                )}
              >
                {value === 'cards' ? uiText('cards_a52fcbb') : uiText('table_16d1c90')}
              </button>
            ))}
          </fieldset>
        </div>

        {layout === 'table' ? (
          <LecturaTable model={model} />
        ) : (
          model.campaigns.map((campaign) => (
            <section key={campaign.id} className="grid gap-2" aria-label={campaign.name}>
              {multiCampaign || model.kind === 'new' || campaign.mark !== 'unchanged' ? (
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <h4 className="min-w-0 break-words text-sm font-semibold">{campaign.name}</h4>
                  <MarkTag mark={campaign.mark} />
                </div>
              ) : null}
              {campaign.adSets.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">
                  {uiText('noun_select_adgroup_no_ad_groups_yet_assetgro_65d7420', {
                    noun: adSetNoun,
                  })}
                </p>
              ) : (
                <div
                  className={cn(
                    'grid grid-cols-1 gap-2.5 @min-[560px]:grid-cols-2',
                    size === 'page' && '@min-[960px]:grid-cols-3',
                  )}
                >
                  {campaign.adSets.map((adSet) => (
                    <LecturaAdSetCard
                      key={adSet.id}
                      adSet={adSet}
                      currency={model.currency}
                      dimUnchanged={showChanges}
                      labels={labels}
                    />
                  ))}
                </div>
              )}
            </section>
          ))
        )}

        {model.truncated ? (
          <p className="text-[13px] text-muted-foreground">
            {uiText('large_campaign_only_the_first_items_were_read_388e751')}
          </p>
        ) : null}
      </div>
    </div>
  );
}

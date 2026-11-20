'use client';

// The campaign page's tabs (G11), by the campaign's type: Search opens on its keywords, its
// search terms and their Quality Score; Performance Max on its asset groups and the channels
// it spent on; every other type on its channels. Each tab reads only once it is opened (an
// inactive panel is not mounted), through the Google tab's own reads, so a campaign opened
// after the tab's views costs no second read. Every row draws a thin bar for its share and
// writes the figure beside it; a read that failed says so, a figure it lacks is a "—".

import type { GoogleSignalsRead } from '@continuum/contracts';
import { motion, useReducedMotion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { UiLocale } from '@/i18n/config';
import { cn } from '@/lib/utils';
import { formatCurrency } from '../../../format';
import { BOARD_COLOR } from '../../board/palette';
import {
  type GoogleReadTarget,
  type GoogleReadWindow,
  useGoogleBreakdown,
  useGoogleKeywordQuality,
  useGoogleSignals,
} from '../../google/googleReads';
import { resultsText } from '../../google/views/cell';
import { buildPmaxHealth, networkSplit } from '../../google/views/pmaxHealthModel';
import { buildQualityScoreMap, qsBand } from '../../google/views/qualityScoreModel';
import { searchTermsOf } from '../../google/views/searchTermRoots';
import { CellText, ReadGate, viewRead } from '../../google/views/viewParts';
import {
  type CampaignKind,
  type CampaignTabKey,
  campaignTabs,
  KIND_COLOR,
  TAB_ROWS,
} from './campaignPageModel';

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

type ScaleCopy = ReturnType<typeof useTranslations<'scale'>>;

export type CampaignTabsProps = {
  target: GoogleReadTarget;
  campaignId: string;
  kind: CampaignKind;
  currency: string | null;
  window: GoogleReadWindow;
};

/** One row of a tab: its name, what it is, a thin bar for its share and its figures written. */
type RankedRow = {
  key: string;
  name: string;
  sub?: string | null;
  /** The bar's length, 0–1 of the largest row. */
  share: number;
  color: string;
  figure: string;
  detail?: string | null;
};

function RankedRows({ rows, hidden, label }: { rows: RankedRow[]; hidden: number; label: string }) {
  const uiText = useTranslations('scale');
  const reduce = useReducedMotion();
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        {uiText('nothing_in_this_read_for_the_campaign_1786eea')}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <ul aria-label={label} className="space-y-2.5" data-testid="campaign-tab-rows">
        {rows.map((row, index) => (
          <li className="min-w-0 space-y-1" key={row.key}>
            <div className="flex min-w-0 items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-sm" title={row.name}>
                {row.name}
                {row.sub ? (
                  <span className="text-muted-foreground text-xs"> · {row.sub}</span>
                ) : null}
              </span>
              <span className="shrink-0 font-mono text-xs tabular-nums">{row.figure}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                <motion.span
                  animate={{ scaleX: 1 }}
                  className="block h-full origin-left rounded-full"
                  initial={reduce ? false : { scaleX: 0 }}
                  style={{ width: `${Math.max(2, row.share * 100)}%`, background: row.color }}
                  transition={{ duration: 0.55, ease: EASE_OUT, delay: index * 0.03 }}
                />
              </span>
              {row.detail ? (
                <span className="shrink-0 text-muted-foreground text-xs">{row.detail}</span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {hidden > 0 ? (
        <p className="text-muted-foreground text-xs">
          {uiText('campaignTabHiddenRows', { count: hidden })}
        </p>
      ) : null}
    </div>
  );
}

/** Why the keywords block is missing from the read, or null when it is there. */
function keywordsReason(read: GoogleSignalsRead, uiText: ScaleCopy): string | null {
  if (!read.signals) {
    return read.rejected.length
      ? uiText('the_google_read_came_back_incomplete_details_0be288f', {
          details: read.rejected.join('; '),
        })
      : uiText('the_google_read_came_back_incomplete_e9e31a9');
  }
  const google = read.signals.google as Record<string, unknown> | null | undefined;
  if (google?.keywords) return null;
  return read.skipped.read_failed_keywords
    ? uiText('google_s_keywords_read_failed_8d5884c')
    : uiText('keywords_were_not_read_for_this_account_4363aec');
}

const conversionsText = (value: number | null, uiText: ScaleCopy, uiLocale: UiLocale) =>
  value == null
    ? uiText('googleCopy_2c6d74e546')
    : uiText('campaignConversionsShort', { value: resultsText(value, uiLocale) });

const KEYWORD_BLOCKS = ['keywords'] as const;

function KeywordsPanel({ target, campaignId, currency, kind }: CampaignTabsProps) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const read = viewRead(useGoogleSignals({ ...target, blocks: KEYWORD_BLOCKS }));
  return (
    <ReadGate read={read}>
      {(data) => {
        const reason = keywordsReason(data, uiText);
        if (reason) return <p className="text-muted-foreground text-xs">{reason}</p>;
        const keywords = (data.signals?.google?.keywords ?? [])
          .filter((keyword) => keyword.campaign_id === campaignId && !keyword.negative)
          .sort((a, b) => b.totals.spend - a.totals.spend);
        const max = keywords[0]?.totals.spend ?? 0;
        const rows = keywords.slice(0, TAB_ROWS).map(
          (keyword): RankedRow => ({
            key: keyword.criterion_id,
            name: keyword.text,
            sub: `${uiText('platformMatch', { match: keyword.match_type })}${
              keyword.status === 'ENABLED'
                ? ''
                : ` · ${uiText('googleKeywordStatus', { status: keyword.status })}`
            }`,
            share: max > 0 ? keyword.totals.spend / max : 0,
            color:
              keyword.quality_score != null && qsBand(keyword.quality_score) === 'low'
                ? BOARD_COLOR.above
                : KIND_COLOR[kind],
            figure: formatCurrency(keyword.totals.spend, currency, uiLocale),
            detail: uiText('campaignKeywordDetail', {
              score: keyword.quality_score ?? '—',
              conversions: conversionsText(keyword.totals.conversions, uiText, uiLocale),
            }),
          }),
        );
        return (
          <RankedRows
            hidden={keywords.length - rows.length}
            label={uiText('keywords_by_spend_54e7c5e')}
            rows={rows}
          />
        );
      }}
    </ReadGate>
  );
}

const TERM_BLOCKS = ['search_terms'] as const;

function TermsPanel({ target, campaignId, currency, kind }: CampaignTabsProps) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const read = viewRead(useGoogleSignals({ ...target, blocks: TERM_BLOCKS }));
  return (
    <ReadGate read={read}>
      {(data) => {
        const found = searchTermsOf(data);
        if ('reason' in found)
          return <p className="text-muted-foreground text-xs">{found.reason}</p>;
        const terms = found.terms
          .filter((term) => term.campaign_id === campaignId)
          .sort((a, b) => b.totals.spend - a.totals.spend);
        const max = terms[0]?.totals.spend ?? 0;
        const rows = terms.slice(0, TAB_ROWS).map(
          (term, index): RankedRow => ({
            key: `${term.term}:${term.ad_group_id ?? index}`,
            name: term.term,
            sub:
              term.status === 'EXCLUDED' || term.status === 'ADDED_EXCLUDED'
                ? uiText('excluded_cfa5ad9')
                : term.status === 'ADDED'
                  ? uiText('added_as_keyword_323a05c')
                  : null,
            share: max > 0 ? term.totals.spend / max : 0,
            color: term.totals.conversions > 0 ? KIND_COLOR[kind] : BOARD_COLOR.mid,
            figure: formatCurrency(term.totals.spend, currency, uiLocale),
            detail: conversionsText(term.totals.conversions, uiText, uiLocale),
          }),
        );
        return (
          <RankedRows
            hidden={terms.length - rows.length}
            label={uiText('search_terms_by_spend_080da3b')}
            rows={rows}
          />
        );
      }}
    </ReadGate>
  );
}

function QualityPanel({ target, campaignId, currency, window }: CampaignTabsProps) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const read = viewRead(useGoogleKeywordQuality({ ...target, window, campaignId }));
  const reduce = useReducedMotion();
  return (
    <ReadGate read={read}>
      {(data) => {
        const map = buildQualityScoreMap(data);
        const spend = map.buckets.reduce((sum, bucket) => sum + bucket.spend, 0);
        const max = Math.max(0, ...map.buckets.map((bucket) => bucket.spend));
        const low = map.buckets
          .filter((bucket) => bucket.band === 'low')
          .reduce((sum, bucket) => sum + bucket.spend, 0);
        return (
          <div className="space-y-2" data-testid="campaign-quality">
            <p className="text-sm">
              {uiText.rich('campaignQualityAverage', {
                avg: () => (
                  <span className="font-mono font-semibold tabular-nums">
                    <CellText cell={map.average} />
                  </span>
                ),
              })}
              <span className="text-muted-foreground text-xs">
                {uiText('campaignQualityScored', { scored: map.scored, total: map.total })}
                {spend > 0
                  ? uiText('campaignQualityLowShare', { pct: Math.round((low / spend) * 100) })
                  : ''}
              </span>
            </p>
            <div aria-hidden="true" className="flex h-20 items-end gap-1">
              {map.buckets.map((bucket, index) => (
                <motion.span
                  animate={{ scaleY: 1 }}
                  className="block flex-1 origin-bottom rounded-t-sm"
                  data-band={bucket.band}
                  initial={reduce ? false : { scaleY: 0 }}
                  key={bucket.score}
                  style={{
                    height: `${max > 0 ? Math.max(4, (bucket.spend / max) * 100) : 4}%`,
                    background: bucket.band === 'low' ? BOARD_COLOR.above : BOARD_COLOR.search,
                    opacity: bucket.keywords === 0 ? 0.25 : 1,
                  }}
                  title={uiText('campaignQualityBucket', {
                    score: bucket.score,
                    count: bucket.keywords,
                    spend: formatCurrency(bucket.spend, currency, uiLocale),
                  })}
                  transition={{ duration: 0.5, ease: EASE_OUT, delay: index * 0.03 }}
                />
              ))}
            </div>
            <div className="flex justify-between text-muted-foreground text-xs">
              <span>{uiText('campaignQualityScore', { score: 1 })}</span>
              <span>{uiText('campaignQualityScore', { score: 10 })}</span>
            </div>
            {map.waste && map.waste.keywords > 0 ? (
              <p className="text-xs">
                {uiText.rich('campaignQualityWaste', {
                  spend: formatCurrency(map.waste.spend, currency, uiLocale),
                  count: map.waste.keywords,
                  figure: (chunks) => (
                    <span className="font-mono font-semibold tabular-nums">{chunks}</span>
                  ),
                })}
              </p>
            ) : null}
          </div>
        );
      }}
    </ReadGate>
  );
}

const PMAX_BLOCKS = ['asset_groups', 'pmax_assets'] as const;
const STRENGTH_STEPS: Readonly<Record<string, number>> = {
  Poor: 1,
  Average: 2,
  Good: 3,
  Excellent: 4,
};

function GroupsPanel({ target, campaignId }: CampaignTabsProps) {
  const uiText = useTranslations('scale');
  const read = viewRead(useGoogleSignals({ ...target, blocks: PMAX_BLOCKS }));
  return (
    <ReadGate read={read}>
      {(data) => {
        const health = buildPmaxHealth(data);
        if (health.kind === 'unread') {
          return <p className="text-muted-foreground text-xs">{health.reason}</p>;
        }
        const groups = health.groups.filter((group) => group.campaignId === campaignId);
        if (groups.length === 0) {
          return (
            <p className="text-muted-foreground text-xs">
              {uiText('google_listed_no_asset_group_for_this_campaig_84c5f04')}
            </p>
          );
        }
        return (
          <ul className="space-y-3" data-testid="campaign-asset-groups">
            {groups.slice(0, TAB_ROWS).map((group) => {
              const step = group.strength.reason ? 0 : (STRENGTH_STEPS[group.strength.text] ?? 0);
              const tone =
                step === 1 ? BOARD_COLOR.above : step === 2 ? BOARD_COLOR.mid : BOARD_COLOR.below;
              return (
                <li
                  className="min-w-0 space-y-1"
                  data-poor={group.poor || undefined}
                  key={group.id}
                >
                  <div className="flex min-w-0 items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm">{group.name}</span>
                    <span className="shrink-0 text-xs">
                      {uiText.rich('campaignAdStrength', {
                        strength: () => (
                          <span className="font-semibold">
                            <CellText cell={group.strength} />
                          </span>
                        ),
                      })}
                    </span>
                  </div>
                  <span
                    aria-hidden="true"
                    className="grid grid-cols-4 gap-1"
                    data-testid="campaign-ad-strength"
                  >
                    {[1, 2, 3, 4].map((at) => (
                      <span
                        className="h-1.5 rounded-full bg-muted"
                        key={at}
                        style={at <= step ? { background: tone } : undefined}
                      />
                    ))}
                  </span>
                  <p className="text-muted-foreground text-xs">
                    <CellText cell={group.status} /> · <CellText cell={group.assets} />
                    {group.missingItems.length > 0
                      ? ` · ${group.missingItems.slice(0, 2).join('; ')}`
                      : ''}
                  </p>
                </li>
              );
            })}
          </ul>
        );
      }}
    </ReadGate>
  );
}

const NETWORK = ['network'] as const;

function ChannelsPanel({ target, campaignId, currency, kind, window }: CampaignTabsProps) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const read = viewRead(useGoogleBreakdown({ ...target, window, dimensions: NETWORK, campaignId }));
  return (
    <ReadGate read={read}>
      {(data) => {
        const slices = networkSplit(data, currency);
        const rows = slices.map(
          (slice): RankedRow => ({
            key: slice.network,
            name: slice.network,
            share: slice.share ?? 0,
            color: KIND_COLOR[kind],
            figure: `${slice.share == null ? '—' : `${Math.round(slice.share * 100)}%`} · ${formatCurrency(slice.spend, currency, uiLocale)}`,
            detail: slice.costPerConversion.reason
              ? null
              : uiText('campaignCostPerConversion', { cost: slice.costPerConversion.text }),
          }),
        );
        return <RankedRows hidden={0} label={uiText('spend_by_channel_739301a')} rows={rows} />;
      }}
    </ReadGate>
  );
}

const PANELS: Record<CampaignTabKey, (props: CampaignTabsProps) => ReactNode> = {
  keywords: KeywordsPanel,
  terms: TermsPanel,
  quality: QualityPanel,
  groups: GroupsPanel,
  channels: ChannelsPanel,
};

export function CampaignTypeTabs(props: CampaignTabsProps) {
  const uiText = useTranslations('scale');
  const tabs = campaignTabs(props.kind);
  return (
    <Tabs className="min-w-0 gap-3" data-testid="campaign-tabs" defaultValue={tabs[0]}>
      <TabsList className="max-w-full overflow-x-auto" variant="default">
        {tabs.map((tab) => (
          <TabsTrigger className={cn('px-2.5 text-xs')} key={tab} value={tab}>
            {uiText('campaignTabLabel', { tab })}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => {
        const Panel = PANELS[tab];
        return (
          <TabsContent
            className="min-w-0"
            data-testid={`campaign-tab-${tab}`}
            key={tab}
            value={tab}
          >
            <Panel {...props} />
          </TabsContent>
        );
      })}
    </Tabs>
  );
}

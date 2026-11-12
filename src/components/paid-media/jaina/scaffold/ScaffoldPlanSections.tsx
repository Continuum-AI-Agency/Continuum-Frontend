'use client';

import type { PaidScaffoldPlan } from '@continuum/contracts';
import { Copy, Film, GalleryHorizontal, ImageIcon, ImageOff } from 'lucide-react';
import {
  useTranslations as useBetaTranslations,
  useFormatter,
  useLocale,
  useTranslations,
} from 'next-intl';
import * as React from 'react';
import { formatCurrency } from '@/components/paid-media/optimizer/format';
import { Button } from '@/components/ui/button';
import { useSignedAssetUrls } from '@/lib/ai-studio/elements';
import { cn } from '@/lib/utils';
import { FieldProvenancePill } from './FieldProvenancePill';
import {
  type AudienceLine,
  type CreativeTile,
  DECISION_LABELS,
  formatMetricValue,
  localizeScaffoldCopy,
  PROVENANCE_LABELS,
  type ScaffoldFieldGroup,
  type ScaffoldSummary,
  sourceLabel,
  windowLabel,
} from './scaffoldPlanView';

/**
 * The sections of the scaffold card that read the typed plan: the summary strip, the evidence,
 * the audiences and the creatives. Split from the card so the card stays about STATE (gate,
 * progress, receipt) and these stay about CONTENT — what a person is deciding on.
 */

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h4 className="font-medium text-foreground text-sm">{children}</h4>;
}

export function ScaffoldSummaryStrip({ summary }: { summary: ScaffoldSummary }) {
  const format = useFormatter();
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
  const budget =
    typeof summary.dailyBudgetMinorUnits === 'number'
      ? uiText('helper_34dd8b60efe4', {
          v0: formatCurrency(summary.dailyBudgetMinorUnits / 100, summary.currency, uiLocale),
        })
      : uiText('scaffoldSummaryPlaceholder');
  const expected =
    typeof summary.conversionsPerDay === 'number'
      ? uiText('scaffoldSummaryExpected', {
          amount: format.number(summary.conversionsPerDay, {
            minimumFractionDigits: summary.conversionsPerDay >= 10 ? 0 : 1,
            maximumFractionDigits: summary.conversionsPerDay >= 10 ? 0 : 1,
          }),
        })
      : '—';
  const cells: { key: string; label: string; value: string; hint?: string }[] = [
    {
      key: 'objective',
      label: uiText('objective_3b20adc'),
      value: summary.objective,
    },
    {
      key: 'budget',
      label: uiText('daily_budget_7b0a1f0'),
      value: budget,
      hint:
        typeof summary.dailyBudgetMinorUnits !== 'number'
          ? uiText('scaffoldSummaryBudgetHint', { kind: 'unmeasured' })
          : uiText('scaffoldSummaryBudgetHint', {
              kind: summary.budgetHeldByCampaign ? 'campaign' : 'adsets',
            }),
    },
    {
      key: 'expected',
      label: uiText('expected_conversions_3bc322d'),
      value: expected,
      hint:
        typeof summary.cpa === 'number'
          ? uiText('scaffoldSummaryCpa', {
              amount: formatCurrency(summary.cpa, summary.currency, uiLocale),
            })
          : uiText('scaffoldSummaryNeedsCpa'),
    },
    {
      key: 'audiences',
      label: uiText('audiences_9e3922b'),
      value: format.number(summary.audiences),
    },
    {
      key: 'creatives',
      label: uiText('creatives_2eb70c5'),
      value: uiText('scaffoldSummaryCreativeCount', {
        creatives: summary.creatives,
        ads: summary.ads,
      }),
      hint: uiText('scaffoldSummaryCreativeHint', {
        incomplete: summary.creatives < summary.ads ? 'yes' : 'no',
      }),
    },
    {
      key: 'optimizer',
      label: uiText('optimizer_2ee6172'),
      value: summary.optimizer ?? uiText('scaffoldSummaryNotPlanned'),
    },
  ];

  return (
    <div className="@container">
      <dl className="grid grid-cols-2 gap-3 @lg:grid-cols-3" data-testid="scaffold-summary">
        {cells.map((cell) => (
          <div
            key={cell.key}
            className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-background/80 px-3 py-2.5"
            data-testid={`scaffold-summary-${cell.key}`}
          >
            <dt className="text-muted-foreground text-xs">{cell.label}</dt>
            <dd className="truncate font-medium text-foreground text-sm tabular-nums">
              {cell.value}
            </dd>
            {cell.hint ? (
              <dd className="truncate text-muted-foreground text-xs">{cell.hint}</dd>
            ) : null}
          </div>
        ))}
      </dl>
    </div>
  );
}

const EVIDENCE_PREVIEW = 4;

/**
 * Why each decision was made, with the numbers it rests on. A claim with no metric is still
 * shown — but it is shown as a claim, not dressed as a measurement.
 */
export function ScaffoldEvidence({ plan }: { plan: PaidScaffoldPlan | null }) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const [expanded, setExpanded] = React.useState(false);
  if (!plan) {
    return (
      <section className="flex flex-col gap-1.5" data-testid="scaffold-evidence">
        <SectionHeading>{uiText('why_this_plan_841b655')}</SectionHeading>
        <p className="text-muted-foreground text-sm">
          {uiText('this_version_was_proposed_before_jaina_record_c5db4ce')}
        </p>
      </section>
    );
  }
  const entries = plan.evidence;
  const shown = expanded ? entries : entries.slice(0, EVIDENCE_PREVIEW);
  const hidden = entries.length - shown.length;

  return (
    <section className="flex flex-col gap-1.5" data-testid="scaffold-evidence">
      <SectionHeading>{uiText('why_this_plan_841b655')}</SectionHeading>
      {entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {uiText('no_evidence_was_recorded_for_this_version_6cbcfa3')}
        </p>
      ) : (
        <ul className="divide-y divide-foreground/5 rounded-xl bg-background/80">
          {shown.map((entry, index) => (
            <li
              key={`${entry.decision}:${entry.path_key ?? 'all'}:${index}`}
              className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 px-3 py-2.5"
              data-testid="scaffold-evidence-item"
              data-decision={entry.decision}
            >
              <span className="pt-px text-muted-foreground text-xs">
                {localizeScaffoldCopy(DECISION_LABELS[entry.decision], uiText)}
              </span>
              <div className="flex min-w-0 flex-col gap-1.5">
                <p className="text-pretty text-foreground text-sm leading-snug">
                  {entry.claim}{' '}
                  <span className="whitespace-nowrap text-muted-foreground text-xs">
                    · {localizeScaffoldCopy(PROVENANCE_LABELS[entry.provenance], uiText)}
                  </span>
                </p>
                {entry.metrics.length > 0 ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {entry.metrics.map((metric) => (
                      <li
                        key={`${metric.label}:${metric.source}`}
                        className="inline-flex max-w-full items-baseline gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs"
                        title={sourceLabel(metric.source, uiText)}
                        data-testid="scaffold-evidence-metric"
                      >
                        <span className="text-muted-foreground">{metric.label}</span>
                        <span className="font-medium text-foreground tabular-nums">
                          {formatMetricValue(metric, uiLocale)}
                        </span>
                        {windowLabel(metric.window, uiText) ? (
                          <span className="text-muted-foreground">
                            · {windowLabel(metric.window, uiText)}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {hidden > 0 || expanded ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 self-start px-2 text-muted-foreground"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded
            ? uiText('show_fewer_255beb6')
            : uiText('template_a1eec0306f3f', { v0: hidden })}
        </Button>
      ) : null}
    </section>
  );
}

export function ScaffoldAudiences({ audiences }: { audiences: AudienceLine[] }) {
  const betaUiText = useBetaTranslations('scale');

  const uiText = useTranslations('scale');
  if (audiences.length === 0) return null;
  return (
    <section className="flex flex-col gap-1.5" data-testid="scaffold-audiences">
      <SectionHeading>{uiText('audiences_9e3922b')}</SectionHeading>
      <ul className="divide-y divide-foreground/5 rounded-xl bg-background/80">
        {audiences.map((audience) => (
          <li
            key={audience.key}
            className="flex flex-col gap-1 px-3 py-2.5"
            data-testid="scaffold-audience"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate font-medium text-sm" title={audience.name}>
                {audience.name}
              </span>
              <span className="shrink-0 text-muted-foreground text-xs">
                {audience.kind === 'group'
                  ? betaUiText('beta_db5004c2d24b')
                  : audience.kind === 'copied'
                    ? betaUiText('beta_8d525e5f158b')
                    : betaUiText('beta_3d9c05379c20')}
              </span>
            </div>
            <p className="flex flex-wrap gap-x-1.5 text-muted-foreground text-xs">
              {[
                audience.summary,
                audience.reach,
                audience.kind === 'group'
                  ? uiText('scaffoldMemberCount', {
                      count: audience.memberCount,
                    })
                  : null,
              ]
                .filter((part): part is string => Boolean(part))
                .map((part, index) => (
                  <React.Fragment key={part}>
                    {index > 0 ? <span aria-hidden>·</span> : null}
                    <span className="tabular-nums">{part}</span>
                  </React.Fragment>
                ))}
            </p>
            {audience.members.length > 0 ? (
              <p
                className="truncate text-muted-foreground text-xs"
                title={audience.members.join(', ')}
              >
                {audience.members.slice(0, 3).join(', ')}
                {audience.members.length > 3
                  ? uiText('template_5bea7822d675', {
                      v0: audience.members.length - 3,
                    })
                  : ''}
              </p>
            ) : null}
            <p className="text-muted-foreground text-xs">
              {uiText.rich('sentence_e19d67a46558', {
                sets: audience.adSets.slice(0, 2).join(', '),
                hasMore: audience.adSets.length > 2 ? 'yes' : 'no',
                more: Math.max(0, audience.adSets.length - 2),
              })}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

const FORMAT_ICON = {
  image: ImageIcon,
  video: Film,
  carousel: GalleryHorizontal,
} as const;
const TILE_LIMIT = 8;

function CreativeThumb({ tile, signedUrl }: { tile: CreativeTile; signedUrl?: string }) {
  const betaUiText = useBetaTranslations('scale');

  const Icon = tile.format ? FORMAT_ICON[tile.format] : tile.reusedCreativeId ? Copy : ImageOff;
  const [broken, setBroken] = React.useState(false);
  const src = broken ? null : (tile.thumbnails[0] ?? signedUrl ?? null);
  return (
    <li
      className="flex w-16 flex-col gap-1"
      data-testid="scaffold-creative"
      data-format={tile.format ?? (tile.reusedCreativeId ? 'reused' : 'none')}
    >
      <div
        className={cn(
          'relative flex size-16 items-center justify-center overflow-hidden rounded-md bg-muted',
          !tile.format && !tile.reusedCreativeId && 'border border-dashed',
        )}
      >
        {src ? (
          // biome-ignore lint/performance/noImgElement: signed library URLs; next/image would need a loader per bucket.
          <img
            src={src}
            alt=""
            className="size-full object-cover"
            loading="lazy"
            onError={() => setBroken(true)}
          />
        ) : (
          <Icon className="size-5 text-muted-foreground" aria-hidden />
        )}
        {tile.format === 'carousel' ? (
          <span className="absolute right-1 bottom-1 rounded bg-background/90 px-1 font-medium text-xs tabular-nums">
            {tile.cardCount}
          </span>
        ) : null}
      </div>
      <span className="truncate text-muted-foreground text-xs" title={tile.adName}>
        {tile.format || tile.reusedCreativeId ? tile.adName : betaUiText('beta_34a6e0766d06')}
      </span>
    </li>
  );
}

export function ScaffoldCreatives({
  tiles,
  brandId,
}: {
  tiles: CreativeTile[];
  brandId?: string | null;
}) {
  const uiText = useTranslations('scale');
  const signed = useSignedAssetUrls(
    brandId || undefined,
    tiles.flatMap((tile) =>
      tile.thumbnails.length === 0 && tile.previewAssetId ? [tile.previewAssetId] : [],
    ),
  );
  if (tiles.length === 0) return null;
  const hidden = tiles.length - TILE_LIMIT;
  return (
    <section className="flex flex-col gap-1.5" data-testid="scaffold-creatives">
      <SectionHeading>{uiText('creatives_2eb70c5')}</SectionHeading>
      <ul className="flex flex-wrap gap-2">
        {tiles.slice(0, TILE_LIMIT).map((tile) => (
          <CreativeThumb
            key={tile.pathKey}
            tile={tile}
            signedUrl={tile.previewAssetId ? signed[tile.previewAssetId] : undefined}
          />
        ))}
        {hidden > 0 ? (
          <li className="flex size-16 items-center justify-center rounded-md bg-background/80 text-muted-foreground text-xs tabular-nums">
            +{hidden}
          </li>
        ) : null}
      </ul>
    </section>
  );
}

const LEVEL_LABELS: Record<ScaffoldFieldGroup['level'], string> = {
  campaign: 'Campaign',
  adset: 'Ad set',
  ad: 'Ad',
};

/** Campaign, its first ad set and that ad set's ads: enough to read the shape, not a wall. */
const FIELD_GROUP_PREVIEW = 4;

/**
 * Every field the version will build, node by node, each with who supplied it — so a person
 * approving "Deploy paused" can see what they said, what Jaina decided for them, and what is
 * still an open question, before anything reaches Meta.
 */
export function ScaffoldFields({ groups }: { groups: ScaffoldFieldGroup[] }) {
  const betaUiText = useBetaTranslations('scale');

  const [expanded, setExpanded] = React.useState(false);
  if (groups.length === 0) return null;
  const shown = expanded ? groups : groups.slice(0, FIELD_GROUP_PREVIEW);
  const hidden = groups.length - shown.length;
  return (
    <section className="flex flex-col gap-1.5" data-testid="scaffold-fields">
      <SectionHeading>{betaUiText('beta_a0b1e8239f2d')}</SectionHeading>
      <ul className="flex flex-col gap-2">
        {shown.map((group) => (
          <li
            key={group.pathKey}
            className={cn(
              'rounded-xl bg-background/80 px-3 py-2.5',
              group.level === 'adset' && 'ml-2',
              group.level === 'ad' && 'ml-4',
            )}
            data-testid="scaffold-field-group"
            data-path={group.pathKey}
          >
            <p className="mb-1.5 flex items-baseline gap-1.5 text-xs">
              <span className="text-muted-foreground">{LEVEL_LABELS[group.level]}</span>
              <span className="min-w-0 truncate font-medium text-foreground" title={group.name}>
                {group.name}
              </span>
            </p>
            <dl className="flex flex-col divide-y divide-foreground/5">
              {group.lines.map((line) => (
                <div
                  key={`${line.key}:${line.label}`}
                  className="grid grid-cols-[7.5rem_minmax(0,1fr)_auto] items-center gap-x-3 py-1.5"
                  data-testid="scaffold-field"
                  data-path={group.pathKey}
                  data-key={line.key}
                >
                  <dt className="text-muted-foreground text-xs">{line.label}</dt>
                  <dd
                    className="min-w-0 truncate text-foreground text-sm tabular-nums"
                    title={line.value}
                  >
                    {line.value}
                  </dd>
                  <dd>
                    <FieldProvenancePill provenance={line.provenance} />
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
      {hidden > 0 || expanded ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 self-start px-2 text-muted-foreground"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded
            ? betaUiText('beta_255beb6510e7')
            : betaUiText('beta_8af6fc3d8124', { value0: String(hidden) })}
        </Button>
      ) : null}
    </section>
  );
}

'use client';

import type { PaidScaffoldPlan } from '@continuum/contracts';
import { Film, GalleryHorizontal, ImageIcon, ImageOff } from 'lucide-react';
import * as React from 'react';
import { formatCurrency } from '@/components/paid-media/optimizer/format';
import { Button } from '@/components/ui/button';
import { useSignedAssetUrls } from '@/lib/ai-studio/elements';
import { cn } from '@/lib/utils';
import {
  type AudienceLine,
  type CreativeTile,
  DECISION_LABELS,
  formatMetricValue,
  PROVENANCE_LABELS,
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

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

export function ScaffoldSummaryStrip({ summary }: { summary: ScaffoldSummary }) {
  const budget =
    typeof summary.dailyBudgetMinorUnits === 'number'
      ? `${formatCurrency(summary.dailyBudgetMinorUnits / 100, summary.currency)}/day`
      : 'Placeholder';
  const expected =
    typeof summary.conversionsPerDay === 'number'
      ? `≈ ${summary.conversionsPerDay.toFixed(summary.conversionsPerDay >= 10 ? 0 : 1)}/day`
      : '—';
  const cells: { key: string; label: string; value: string; hint?: string }[] = [
    { key: 'objective', label: 'Objective', value: summary.objective },
    {
      key: 'budget',
      label: 'Daily budget',
      value: budget,
      hint:
        typeof summary.dailyBudgetMinorUnits === 'number'
          ? 'Total across ad sets'
          : 'No measured CPA yet',
    },
    {
      key: 'expected',
      label: 'Expected conversions',
      value: expected,
      hint:
        typeof summary.cpa === 'number'
          ? `At ${formatCurrency(summary.cpa, summary.currency)} CPA`
          : 'Needs a measured CPA',
    },
    { key: 'audiences', label: 'Audiences', value: String(summary.audiences) },
    {
      key: 'creatives',
      label: 'Creatives',
      value: `${summary.creatives} of ${summary.ads}`,
      hint: summary.creatives < summary.ads ? 'Some ads have none yet' : 'Every ad has one',
    },
    {
      key: 'optimizer',
      label: 'Optimizer',
      value: summary.optimizer ?? 'Not planned',
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
  const [expanded, setExpanded] = React.useState(false);
  if (!plan) {
    return (
      <section className="flex flex-col gap-1.5" data-testid="scaffold-evidence">
        <SectionHeading>Why this plan</SectionHeading>
        <p className="text-muted-foreground text-sm">
          This version was proposed before Jaina recorded evidence for each decision. The budget
          below is still sized from the account&rsquo;s measured CPA.
        </p>
      </section>
    );
  }
  const entries = plan.evidence;
  const shown = expanded ? entries : entries.slice(0, EVIDENCE_PREVIEW);
  const hidden = entries.length - shown.length;

  return (
    <section className="flex flex-col gap-1.5" data-testid="scaffold-evidence">
      <SectionHeading>Why this plan</SectionHeading>
      {entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">No evidence was recorded for this version.</p>
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
                {DECISION_LABELS[entry.decision]}
              </span>
              <div className="flex min-w-0 flex-col gap-1.5">
                <p className="text-pretty text-foreground text-sm leading-snug">
                  {entry.claim}{' '}
                  <span className="whitespace-nowrap text-muted-foreground text-xs">
                    · {PROVENANCE_LABELS[entry.provenance]}
                  </span>
                </p>
                {entry.metrics.length > 0 ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {entry.metrics.map((metric) => (
                      <li
                        key={`${metric.label}:${metric.source}`}
                        className="inline-flex max-w-full items-baseline gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs"
                        title={sourceLabel(metric.source)}
                        data-testid="scaffold-evidence-metric"
                      >
                        <span className="text-muted-foreground">{metric.label}</span>
                        <span className="font-medium text-foreground tabular-nums">
                          {formatMetricValue(metric)}
                        </span>
                        {windowLabel(metric.window) ? (
                          <span className="text-muted-foreground">
                            · {windowLabel(metric.window)}
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
          {expanded ? 'Show fewer' : `Show ${hidden} more`}
        </Button>
      ) : null}
    </section>
  );
}

export function ScaffoldAudiences({ audiences }: { audiences: AudienceLine[] }) {
  if (audiences.length === 0) return null;
  return (
    <section className="flex flex-col gap-1.5" data-testid="scaffold-audiences">
      <SectionHeading>Audiences</SectionHeading>
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
                {audience.kind === 'group' ? 'Published group' : 'Broad'}
              </span>
            </div>
            <p className="flex flex-wrap gap-x-1.5 text-muted-foreground text-xs">
              {[
                audience.summary,
                audience.reach,
                audience.kind === 'group' ? plural(audience.memberCount, 'member') : null,
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
                {audience.members.length > 3 ? ` +${audience.members.length - 3} more` : ''}
              </p>
            ) : null}
            <p className="text-muted-foreground text-xs">
              Feeds {audience.adSets.slice(0, 2).join(', ')}
              {audience.adSets.length > 2 ? ` +${audience.adSets.length - 2} more` : ''}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

const FORMAT_ICON = { image: ImageIcon, video: Film, carousel: GalleryHorizontal } as const;
const TILE_LIMIT = 8;

function CreativeThumb({ tile, signedUrl }: { tile: CreativeTile; signedUrl?: string }) {
  const Icon = tile.format ? FORMAT_ICON[tile.format] : ImageOff;
  const [broken, setBroken] = React.useState(false);
  const src = broken ? null : (tile.thumbnails[0] ?? signedUrl ?? null);
  return (
    <li
      className="flex w-16 flex-col gap-1"
      data-testid="scaffold-creative"
      data-format={tile.format ?? 'none'}
    >
      <div
        className={cn(
          'relative flex size-16 items-center justify-center overflow-hidden rounded-md bg-muted',
          !tile.format && 'border border-dashed',
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
        {tile.format ? tile.adName : 'No creative'}
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
      <SectionHeading>Creatives</SectionHeading>
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

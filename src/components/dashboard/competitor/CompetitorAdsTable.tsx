'use client';

import type { TimelineEntry } from '@continuum/contracts';
import { ExternalLink } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { CompetitorSearchBar } from '@/components/competitors/CompetitorSearchBar';
import {
  InsightActionsDropdown,
  InsightContextActions,
} from '@/components/dashboard/briefing/insightActions';
import {
  type InsightColumn,
  InsightDataTable,
} from '@/components/dashboard/datatable/InsightDataTable';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAdTimeline } from '@/lib/api/competitorSpy';
import { adStatusBadge } from '@/lib/competitor-spy/competitor-spy-rows';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { cn } from '@/lib/utils';
import { CompetitorSpyLink } from './CompetitorSpyLink';

function compactDays(firstSeenAt: string, lastSeenAt: string, locale: string): string {
  const first = Date.parse(firstSeenAt);
  const last = Date.parse(lastSeenAt);
  if (Number.isNaN(first) || Number.isNaN(last)) return '-';
  const days = Math.max(0, Math.round((last - first) / 86_400_000));
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'day',
    unitDisplay: 'narrow',
  }).format(days);
}

function formatMetadataDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString(locale, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDeliveryWindow(
  start: string | null | undefined,
  stop: string | null | undefined,
  t: ReturnType<typeof useTranslations<'dashboard'>>,
  locale: string,
): string {
  const startLabel = formatMetadataDate(start, locale);
  const stopLabel = formatMetadataDate(stop, locale);
  if (startLabel !== '-' && stopLabel !== '-')
    return t('m_1fbe924781', { start: startLabel, stop: stopLabel });
  if (startLabel !== '-') return t('m_d9ba0118fc', { start: startLabel });
  if (stopLabel !== '-') return t('m_61b9ac23be', { stop: stopLabel });
  return '-';
}

function formatList(values: string[] | undefined): string {
  const items = (values ?? []).filter(Boolean);
  return items.length > 0 ? items.join(', ') : '-';
}

function formatObservedLive(row: TimelineEntry, locale: string): string {
  const days = row.publicMetadata?.observedActiveDays;
  return typeof days === 'number'
    ? new Intl.NumberFormat(locale, {
        style: 'unit',
        unit: 'day',
        unitDisplay: 'narrow',
      }).format(days)
    : compactDays(row.firstSeenAt, row.lastSeenAt, locale);
}

function MetadataItem({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="min-w-0">
      <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate text-xs text-foreground">{value ?? '-'}</p>
    </div>
  );
}

function StatusPill({ badge }: { badge: ReturnType<typeof adStatusBadge> }) {
  const t = useTranslations('dashboard');
  const keys = {
    new: 'm_6403f2b7eb',
    active: 'm_a733b809d2',
    paused: 'm_c7dfb6f1d9',
  } as const;
  const variant =
    badge.tone === 'new' ? 'success' : badge.tone === 'paused' ? 'destructive' : 'secondary';
  return (
    <Badge variant={variant} className="text-2xs">
      {t(keys[badge.tone])}
    </Badge>
  );
}

export function CompetitorAdsTable({ brandId }: { brandId: string }) {
  const uiText = useTranslations('dashboard');
  const uiLocale = useLocale();
  const { data, isLoading, isError } = useAdTimeline({
    brandId,
    limit: 12,
    sort: 'first_seen_at',
    dir: 'desc',
  });
  const rows = useMemo(() => data ?? [], [data]);
  const now = Date.now();

  const columns = useMemo<InsightColumn<TimelineEntry>[]>(
    () => [
      {
        id: 'competitor',
        header: uiText('m_4705687644'),
        cell: (row) => (
          <div className="min-w-0">
            <p className="truncate text-sm text-foreground">{row.competitorName}</p>
            <p className="truncate text-xs text-muted-foreground">{row.sourceAdId}</p>
          </div>
        ),
      },
      {
        id: 'copy',
        header: uiText('m_e08a43be07'),
        cell: (row) => (
          <div className="min-w-0">
            <p className="truncate text-sm text-muted-foreground">
              {row.body?.trim() || uiText('no_primary_text_114934d')}
            </p>
            {row.analysis?.primaryTheme ? (
              <p className="truncate text-xs text-muted-foreground">{row.analysis.primaryTheme}</p>
            ) : null}
          </div>
        ),
      },
      {
        id: 'platforms',
        header: uiText('platforms_ab9bd75'),
        sortValue: (row) => row.platforms.length,
        cell: (row) => (
          <div className="flex max-w-36 flex-wrap justify-end gap-1">
            {row.platforms.length > 0 ? (
              row.platforms.slice(0, 2).map((platform) => (
                <Badge
                  key={`${row.snapshotId}-${platform}`}
                  variant="outline"
                  className="border-border/70 px-2 py-0 text-2xs font-normal text-muted-foreground"
                >
                  {platform}
                </Badge>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">-</span>
            )}
            {row.platforms.length > 2 ? (
              <Badge variant="secondary" className="px-2 py-0 text-2xs font-normal">
                +{row.platforms.length - 2}
              </Badge>
            ) : null}
          </div>
        ),
      },
      {
        id: 'status',
        header: uiText('status_920e413'),
        align: 'right',
        sortValue: (row) =>
          adStatusBadge(row.status, row.firstSeenAt, now).tone === 'new'
            ? 2
            : row.status === 'active'
              ? 1
              : 0,
        cell: (row) => {
          const badge = adStatusBadge(row.status, row.firstSeenAt, now);
          return <StatusPill badge={badge} />;
        },
      },
      {
        id: 'firstSeen',
        header: uiText('first_seen_32fbd28'),
        align: 'right',
        sortValue: (row) => Date.parse(row.firstSeenAt) || 0,
        cell: (row) => (row.firstSeenAt ? formatRelativeTime(row.firstSeenAt, now, uiLocale) : '-'),
      },
      {
        id: 'duration',
        header: uiText('m_65c821a596'),
        align: 'right',
        sortValue: (row) => Date.parse(row.lastSeenAt) - Date.parse(row.firstSeenAt),
        cell: (row) => compactDays(row.firstSeenAt, row.lastSeenAt, uiLocale),
      },
    ],
    [now, uiText, uiLocale],
  );

  return (
    <div className="flex flex-col gap-2">
      <CompetitorSearchBar comingSoon placeholder={uiText('search_competitor_ads_6ab109e')} />
      <InsightDataTable
        title={uiText('competitor_ads_f0438cd')}
        headerAction={<CompetitorSpyLink href="/competitor-spy?tab=inspiration" />}
        rows={rows}
        columns={columns}
        getRowId={(row) => row.snapshotId}
        defaultSort={{ columnId: 'firstSeen', direction: 'desc' }}
        isLoading={isLoading}
        emptyState={
          isError ? uiText('competitorAdsUnavailableEmpty') : uiText('competitorAdsNoPaidEmpty')
        }
        contextMenu={(row) => <InsightContextActions permalink={row.snapshotUrl ?? undefined} />}
        rowActions={(row) => <InsightActionsDropdown permalink={row.snapshotUrl ?? undefined} />}
        expandedContent={(row) => (
          <div className="flex flex-col gap-2 text-xs leading-relaxed">
            {row.body ? <p className="text-foreground">{row.body}</p> : null}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono tabular-nums text-muted-foreground">
              {row.cta ? (
                <span>{uiText.rich('sentence_380774176cfb', { v0: () => row.cta })}</span>
              ) : null}
              {row.analysis?.hookArchetype ? (
                <span>{row.analysis.hookArchetype.replace(/_/g, ' ')}</span>
              ) : null}
              {row.platforms.length > 0 ? <span>{row.platforms.join(', ')}</span> : null}
            </div>
            <Card className="rounded-md border-border bg-muted/25 py-0 shadow-none">
              <CardContent className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4">
                <MetadataItem
                  label={uiText('meta_page_47bc35d')}
                  value={row.publicMetadata?.pageName ?? '-'}
                />
                <MetadataItem
                  label={uiText('library_id_d107031')}
                  value={row.publicMetadata?.sourceAdId ?? row.sourceAdId}
                />
                <MetadataItem
                  label={uiText('created_d70b9e2')}
                  value={formatMetadataDate(row.publicMetadata?.creationTime, uiLocale)}
                />
                <MetadataItem
                  label={uiText('delivery_52bfe58')}
                  value={formatDeliveryWindow(
                    row.publicMetadata?.deliveryStart ?? row.deliveryStart,
                    row.publicMetadata?.deliveryStop ?? row.deliveryStop,
                    uiText,
                    uiLocale,
                  )}
                />
                <MetadataItem
                  label={uiText('first_seen_32fbd28')}
                  value={formatMetadataDate(row.firstSeenAt, uiLocale)}
                />
                <MetadataItem
                  label={uiText('last_seen_21fd79c')}
                  value={formatMetadataDate(row.lastSeenAt, uiLocale)}
                />
                <MetadataItem
                  label={uiText('fetched_0013b4c')}
                  value={formatMetadataDate(row.publicMetadata?.fetchedAt, uiLocale)}
                />
                <MetadataItem
                  label={uiText('observed_live_ff0d525')}
                  value={formatObservedLive(row, uiLocale)}
                />
                <MetadataItem
                  label={uiText('platforms_ab9bd75')}
                  value={formatList(row.publicMetadata?.platforms ?? row.platforms)}
                />
                <MetadataItem
                  label={uiText('languages_318655c')}
                  value={formatList(row.publicMetadata?.languages)}
                />
                <MetadataItem
                  label={uiText('link_title_6df6f32')}
                  value={row.publicMetadata?.linkTitle ?? '-'}
                />
                <MetadataItem
                  label={uiText('link_caption_41fd093')}
                  value={row.publicMetadata?.linkCaption ?? '-'}
                />
              </CardContent>
            </Card>
            {row.snapshotUrl ? (
              <a
                href={row.snapshotUrl}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  buttonVariants({ variant: 'ghost', size: 'xs' }),
                  'w-fit px-0 text-muted-foreground hover:text-foreground',
                )}
              >
                <ExternalLink className="size-3" />
                {uiText('m_e0c329c016')}
              </a>
            ) : null}
          </div>
        )}
      />
    </div>
  );
}

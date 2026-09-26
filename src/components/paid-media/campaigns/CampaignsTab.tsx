'use client';

// Scale › Campaigns: every campaign on the Meta account (active AND paused, so a scaffold's
// paused build shows up), expandable to its ad sets and their ads, with Pause / Unpause on each
// row. A row action never writes: it opens EntityStatusSheet, whose only path to Meta is a Jaina
// approval a person answers. After it settles, the row shows Meta's read-back and its level is
// re-read past the edge cache.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Megaphone, Pause, Play, RotateCw } from 'lucide-react';
import * as React from 'react';
import { formatCurrency } from '@/components/paid-media/optimizer/format';
import { useAdAccountCurrency } from '@/components/paid-media/optimizer/useOptimizerData';
import { EmptyState, ErrorRetryState } from '@/components/shared/state';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { cn } from '@/lib/utils';
import {
  buildEntityStatusAction,
  type EntityLevel,
  ensureOperationsSession,
  levelNoun,
  type ScaleEntitiesKey,
  type ScaleEntityRow,
  type ScaleScope,
  scaleEntitiesKeyPrefix,
  scaleEntitiesQueryOptions,
} from './campaignsClient';
import { EntityStatusPill, humanizeStatus } from './EntityStatusPill';
import {
  type EntityStatusSettlement,
  EntityStatusSheet,
  type EntityStatusTarget,
} from './EntityStatusSheet';

type StatusOverride = { status: string; effectiveStatus: string | null; at: number };

type TableContext = {
  scope: ScaleScope;
  currency: string | null;
  /** A row as Meta last read it back, unless the page it came from was read after that. */
  present: (row: ScaleEntityRow, fetchedAt: string | null) => ScaleEntityRow;
  onAction: (row: ScaleEntityRow, level: EntityLevel, parentId: string | null) => void;
};

const CHILD_LEVEL: Record<EntityLevel, EntityLevel | null> = {
  campaign: 'adset',
  adset: 'ad',
  ad: null,
};

const ROW_TEST_ID: Record<EntityLevel, string> = {
  campaign: 'scale-campaign-row',
  adset: 'scale-adset-row',
  ad: 'scale-ad-row',
};

const INDENT = ['pl-3', 'pl-9', 'pl-[3.75rem]'];

/** Meta budgets are in the currency's minor unit; zero-decimal currencies (JPY, KRW, ...) have
 *  none. ponytail: ISO minor units via Intl; Meta's own offset table differs for a few (e.g.
 *  HUF, TWD) — read it from the account if one of those ever shows up. */
function minorUnitDivisor(currency: string | null): number {
  if (!currency) return 100;
  try {
    const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits;
    return 10 ** (digits ?? 2);
  } catch {
    return 100;
  }
}

function budgetLabel(row: ScaleEntityRow, currency: string | null): string | null {
  const divisor = minorUnitDivisor(currency);
  const daily = Number(row.dailyBudget);
  if (row.dailyBudget && Number.isFinite(daily) && daily > 0) {
    return `${formatCurrency(daily / divisor, currency)}/day`;
  }
  const lifetime = Number(row.lifetimeBudget);
  if (row.lifetimeBudget && Number.isFinite(lifetime) && lifetime > 0) {
    return `${formatCurrency(lifetime / divisor, currency)} lifetime`;
  }
  return null;
}

export function CampaignsTab({ brandId, adAccountId }: { brandId: string; adAccountId: string }) {
  const scope = React.useMemo(() => ({ brandId, adAccountId }), [adAccountId, brandId]);
  const queryClient = useQueryClient();
  const currency = useAdAccountCurrency(brandId, adAccountId);
  const campaigns = useQuery(scaleEntitiesQueryOptions('campaign', scope, null));

  const [overrides, setOverrides] = React.useState<Record<string, StatusOverride>>({});
  const [target, setTarget] = React.useState<EntityStatusTarget | null>(null);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  // One conversation per mounted tab records every action taken here.
  const [sessionId] = React.useState(() => crypto.randomUUID());
  const sessionRef = React.useRef<Promise<string> | null>(null);
  const ensureSession = React.useCallback(() => {
    sessionRef.current ??= ensureOperationsSession({
      brandId,
      adAccountId,
      sessionId,
    }).catch((error: unknown) => {
      sessionRef.current = null;
      throw error;
    });
    return sessionRef.current;
  }, [adAccountId, brandId, sessionId]);

  const refreshLevel = React.useCallback(
    (level: EntityLevel, parentId: string | null) =>
      queryClient.fetchQuery({
        ...scaleEntitiesQueryOptions(level, scope, parentId, { refresh: true }),
        staleTime: 0,
      }),
    [queryClient, scope],
  );

  const refreshAll = async () => {
    setIsRefreshing(true);
    const shown = queryClient
      .getQueryCache()
      .findAll({ queryKey: scaleEntitiesKeyPrefix(scope), type: 'active' });
    await Promise.allSettled(
      shown.map((query) => {
        const [, , , level, parentId] = query.queryKey as unknown as ScaleEntitiesKey;
        return refreshLevel(level, parentId);
      }),
    );
    setIsRefreshing(false);
  };

  const handleSettled = React.useCallback(
    (settled: EntityStatusTarget, settlement: EntityStatusSettlement) => {
      if (settlement.kind === 'denied') return;
      if (settlement.kind === 'read_back') {
        const { entity_id: entityId, status, effective_status: effective } = settlement.readBack;
        setOverrides((previous) => ({
          ...previous,
          [entityId]: {
            status: status.toUpperCase(),
            effectiveStatus: effective?.toUpperCase() ?? null,
            at: Date.now(),
          },
        }));
      }
      void refreshLevel(settled.level, settled.parentId).catch(() => undefined);
    },
    [refreshLevel],
  );

  const context = React.useMemo<TableContext>(
    () => ({
      scope,
      currency,
      present: (row, fetchedAt) => {
        const override = overrides[row.id];
        if (!override) return row;
        if (fetchedAt && Date.parse(fetchedAt) > override.at) return row;
        return { ...row, status: override.status, effectiveStatus: override.effectiveStatus };
      },
      onAction: (row, level, parentId) =>
        setTarget({ key: `${row.id}:${Date.now()}`, row, level, parentId }),
    }),
    [currency, overrides, scope],
  );

  const page = campaigns.data;
  const rows = page?.rows ?? [];
  const pausedCount = rows.filter(
    (row) => context.present(row, page?.fetchedAt ?? null).status === 'PAUSED',
  ).length;
  const state = page
    ? rows.length > 0
      ? 'ready'
      : 'empty'
    : campaigns.isError
      ? 'error'
      : 'loading';

  return (
    <section
      data-testid="scale-campaigns-table"
      data-state={state}
      aria-busy={state === 'loading' || isRefreshing}
      aria-labelledby="scale-campaigns-heading"
      className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-border/70 bg-background"
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-border/70 border-b px-4 py-2.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 id="scale-campaigns-heading" className="font-medium text-sm">
            Campaigns
          </h2>
          {page ? (
            <span className="text-muted-foreground text-xs tabular-nums">
              {rows.length} {rows.length === 1 ? 'campaign' : 'campaigns'}
              {pausedCount > 0 ? ` · ${pausedCount} paused` : ''}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          {page && campaigns.isError ? (
            <span className="text-destructive text-xs">Refresh failed, showing the last read</span>
          ) : null}
          {page ? <CacheAge fetchedAt={page.fetchedAt} /> : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refreshAll()}
            disabled={isRefreshing || state === 'loading'}
          >
            <RotateCw
              aria-hidden="true"
              className={cn(isRefreshing && 'motion-safe:animate-spin')}
            />
            Refresh
          </Button>
        </div>
      </header>

      <div className="min-h-0 overflow-auto">
        {state === 'error' ? (
          <ErrorRetryState
            title="Couldn't load campaigns"
            message={errorMessage(campaigns.error)}
            onRetry={() => void campaigns.refetch()}
          />
        ) : state === 'empty' ? (
          <EmptyState
            media={<Megaphone />}
            headline="No active or paused campaigns"
            description="Campaigns on this Meta ad account appear here, including paused ones Jaina builds for you to review before they go live."
          />
        ) : (
          <Table className="min-w-[40rem] table-fixed">
            <colgroup>
              <col />
              <col className="w-40" />
              <col className="w-36" />
              <col className="w-32" />
            </colgroup>
            <TableHeader className="sticky top-0 z-10 bg-muted/40 backdrop-blur-sm">
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 pl-[2.625rem] font-normal text-muted-foreground text-xs">
                  Name
                </TableHead>
                <TableHead className="h-9 font-normal text-muted-foreground text-xs">
                  Status
                </TableHead>
                <TableHead className="h-9 text-right font-normal text-muted-foreground text-xs">
                  Budget
                </TableHead>
                <TableHead className="h-9 pr-4">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page
                ? rows.map((row) => (
                    <EntityBranch
                      key={row.id}
                      row={row}
                      level="campaign"
                      parentId={null}
                      fetchedAt={page.fetchedAt}
                      context={context}
                    />
                  ))
                : Array.from({ length: 6 }, (_, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows
                    <SkeletonRow key={index} depth={0} />
                  ))}
            </TableBody>
          </Table>
        )}
      </div>

      <EntityStatusSheet
        target={target}
        scope={scope}
        ensureSession={ensureSession}
        onClose={() => setTarget(null)}
        onSettled={handleSettled}
      />
    </section>
  );
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Meta did not answer.';
  const retryAfter = (error as { retryAfter?: unknown } | null)?.retryAfter;
  return typeof retryAfter === 'number' && retryAfter > 0
    ? `${message} Try again in ${Math.ceil(retryAfter)}s.`
    : message;
}

function CacheAge({ fetchedAt }: { fetchedAt: string | null }) {
  if (!fetchedAt) return null;
  const isLive = Date.now() - Date.parse(fetchedAt) < 60_000;
  return (
    <span
      data-testid="scale-campaigns-cache-age"
      title={`Read from Meta ${new Date(fetchedAt).toLocaleString()}`}
      className="inline-flex items-center gap-1.5 text-muted-foreground text-xs tabular-nums"
    >
      <span
        aria-hidden="true"
        className={cn('size-1.5 rounded-full', isLive ? 'bg-success' : 'bg-muted-foreground/50')}
      />
      {isLive ? 'Live' : `Cached ${formatRelativeTime(fetchedAt)}`}
    </span>
  );
}

function EntityBranch({
  row: read,
  level,
  parentId,
  fetchedAt,
  context,
}: {
  row: ScaleEntityRow;
  level: EntityLevel;
  parentId: string | null;
  fetchedAt: string | null;
  context: TableContext;
}) {
  const [open, setOpen] = React.useState(false);
  const row = context.present(read, fetchedAt);
  const childLevel = CHILD_LEVEL[level];
  const depth = level === 'campaign' ? 0 : level === 'adset' ? 1 : 2;
  const action = buildEntityStatusAction(row, level);
  const budget = budgetLabel(row, context.currency);
  const delivery =
    row.effectiveStatus && row.effectiveStatus !== row.status
      ? humanizeStatus(row.effectiveStatus)
      : null;

  return (
    <>
      <TableRow
        data-testid={ROW_TEST_ID[level]}
        data-entity-id={row.id}
        data-status={row.status}
        className={cn('border-border/50', depth > 0 && 'bg-muted/15')}
      >
        <TableCell className={cn('py-2', INDENT[depth])}>
          <div className="flex min-w-0 items-center gap-1.5">
            {childLevel ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={childLevel === 'adset' ? 'Show ad sets' : 'Show ads'}
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
                className="text-muted-foreground"
              >
                <ChevronRight
                  className={cn(
                    'transition-transform duration-150 ease-out motion-reduce:transition-none',
                    open && 'rotate-90',
                  )}
                />
              </Button>
            ) : (
              <span aria-hidden="true" className="size-6 shrink-0" />
            )}
            <span
              title={row.name}
              className={cn(
                'truncate',
                level === 'campaign' ? 'font-medium' : level === 'ad' && 'text-muted-foreground',
              )}
            >
              {row.name}
            </span>
          </div>
        </TableCell>
        <TableCell className="py-2">
          <div className="flex min-w-0 flex-col items-start gap-0.5">
            <EntityStatusPill status={row.status} />
            {delivery ? (
              <span className="max-w-full truncate text-2xs text-muted-foreground" title={delivery}>
                {delivery}
              </span>
            ) : null}
          </div>
        </TableCell>
        <TableCell className="py-2 text-right tabular-nums">
          {budget ?? <span className="text-muted-foreground">—</span>}
        </TableCell>
        <TableCell className="py-2 pr-4 text-right">
          {action ? (
            <Button
              type="button"
              variant="outline"
              size="xs"
              data-testid={
                action.tool === 'pause_meta_entity' ? 'scale-row-pause' : 'scale-row-unpause'
              }
              aria-label={`${action.tool === 'pause_meta_entity' ? 'Pause' : 'Unpause'} ${levelNoun(level)} ${row.name}`}
              onClick={() => context.onAction(row, level, parentId)}
            >
              {action.tool === 'pause_meta_entity' ? <Pause /> : <Play />}
              {action.tool === 'pause_meta_entity' ? 'Pause' : 'Unpause'}
            </Button>
          ) : null}
        </TableCell>
      </TableRow>
      {open && childLevel ? (
        <ChildRows level={childLevel} parentId={row.id} depth={depth + 1} context={context} />
      ) : null}
    </>
  );
}

function ChildRows({
  level,
  parentId,
  depth,
  context,
}: {
  level: EntityLevel;
  parentId: string;
  depth: number;
  context: TableContext;
}) {
  const query = useQuery(scaleEntitiesQueryOptions(level, context.scope, parentId));
  const noun = levelNoun(level);

  if (query.data) {
    const { rows, fetchedAt } = query.data;
    if (rows.length === 0) {
      return (
        <MessageRow depth={depth}>
          No {noun}s in this {level === 'adset' ? 'campaign' : 'ad set'}.
        </MessageRow>
      );
    }
    return rows.map((row) => (
      <EntityBranch
        key={row.id}
        row={row}
        level={level}
        parentId={parentId}
        fetchedAt={fetchedAt}
        context={context}
      />
    ));
  }

  if (query.isError) {
    return (
      <MessageRow depth={depth}>
        <span role="alert" className="text-destructive">
          {errorMessage(query.error)}
        </span>{' '}
        <Button
          type="button"
          variant="link"
          size="xs"
          className="px-1"
          onClick={() => void query.refetch()}
        >
          Retry
        </Button>
      </MessageRow>
    );
  }

  return (
    <>
      <SkeletonRow depth={depth} />
      <SkeletonRow depth={depth} />
    </>
  );
}

function MessageRow({ depth, children }: { depth: number; children: React.ReactNode }) {
  return (
    <TableRow className="border-border/50 bg-muted/15 hover:bg-muted/15">
      <TableCell
        colSpan={4}
        className={cn('py-2.5 text-muted-foreground text-xs whitespace-normal', INDENT[depth])}
      >
        <span className="pl-7">{children}</span>
      </TableCell>
    </TableRow>
  );
}

function SkeletonRow({ depth }: { depth: number }) {
  const bar = 'rounded-md bg-muted/70 motion-safe:animate-pulse';
  return (
    <TableRow aria-hidden="true" className="border-border/50 hover:bg-transparent">
      <TableCell className={cn('py-3', INDENT[depth])}>
        <div className="flex items-center gap-2">
          <div className={cn('size-5', bar)} />
          <div className={cn('h-4 w-1/2', bar)} />
        </div>
      </TableCell>
      <TableCell className="py-3">
        <div className={cn('h-5 w-16 rounded-full', bar)} />
      </TableCell>
      <TableCell className="py-3">
        <div className={cn('ml-auto h-4 w-16', bar)} />
      </TableCell>
      <TableCell className="py-3 pr-4">
        <div className={cn('ml-auto h-6 w-16', bar)} />
      </TableCell>
    </TableRow>
  );
}

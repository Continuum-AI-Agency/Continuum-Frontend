'use client';

// Scale › Campaigns: every campaign on the Meta account (active AND paused, so a scaffold's
// paused build shows up), expandable to its ad sets and their ads, with Pause / Unpause on each
// row. A row action never writes: it opens EntityStatusSheet, whose only path to Meta is a Jaina
// approval a person answers. After it settles, the row shows Meta's read-back and its level is
// re-read past the edge cache.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, RotateCw } from 'lucide-react';
import * as React from 'react';
import { formatCurrency } from '@/components/paid-media/optimizer/format';
import { useAdAccountCurrency } from '@/components/paid-media/optimizer/useOptimizerData';
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
import { humanizeStatus } from './EntityStatusPill';
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

const INDENT = ['pl-1', 'pl-7', 'pl-[3.25rem]'];

const HEAD = 'h-8 font-normal text-2xs text-muted-foreground uppercase tracking-wider';

/** Quiet text action: shown on row hover or focus where a pointer can hover and the table is
 *  wide; always shown on touch screens and in narrow panels, where there is no hover to find it. */
const ROW_ACTION = cn(
  'text-muted-foreground hover:text-foreground transition-opacity motion-reduce:transition-none',
  '@lg/campaigns:[@media(hover:hover)]:opacity-0',
  '@lg/campaigns:[@media(hover:hover)]:group-hover/row:opacity-100',
  '@lg/campaigns:[@media(hover:hover)]:group-focus-within/row:opacity-100',
);

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
      className="@container/campaigns grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1 pt-1 pb-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h2 id="scale-campaigns-heading" className="font-semibold text-base tabular-nums">
            {page ? `${rows.length} ${rows.length === 1 ? 'campaign' : 'campaigns'}` : 'Campaigns'}
          </h2>
          {page ? (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground text-xs tabular-nums">
              {pausedCount > 0 ? <span>{pausedCount} paused</span> : null}
              {pausedCount > 0 && page.fetchedAt ? <span aria-hidden="true">·</span> : null}
              <CacheAge fetchedAt={page.fetchedAt} />
            </span>
          ) : null}
          {page && campaigns.isError ? (
            <span className="text-destructive text-xs">Refresh failed, showing the last read</span>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="text-muted-foreground"
          onClick={() => void refreshAll()}
          disabled={isRefreshing || state === 'loading'}
        >
          <RotateCw aria-hidden="true" className={cn(isRefreshing && 'motion-safe:animate-spin')} />
          Refresh
        </Button>
      </header>

      <div className="min-h-0 overflow-auto">
        {state === 'error' ? (
          <QuietState role="alert" title="Couldn't load campaigns">
            {errorMessage(campaigns.error)}{' '}
            <Button
              type="button"
              variant="link"
              size="xs"
              className="px-1"
              onClick={() => void campaigns.refetch()}
            >
              Retry
            </Button>
          </QuietState>
        ) : state === 'empty' ? (
          <QuietState title="No active or paused campaigns">
            Campaigns on this Meta ad account appear here, including paused ones Jaina builds for
            you to review before they go live.
          </QuietState>
        ) : (
          <Table className="table-fixed">
            <colgroup>
              <col />
              <col className="hidden w-36 @md/campaigns:table-column" />
              <col className="w-28" />
              <col className="w-24" />
            </colgroup>
            <TableHeader className="sticky top-0 z-10 bg-background [&_tr]:border-border/60">
              <TableRow className="hover:bg-transparent">
                <TableHead className={cn(HEAD, 'pl-[2.875rem]')}>Name</TableHead>
                <TableHead className={cn(HEAD, 'hidden @md/campaigns:table-cell')}>
                  Status
                </TableHead>
                <TableHead className={cn(HEAD, 'text-right')}>Budget / day</TableHead>
                <TableHead className="h-8 pr-1">
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

function QuietState({
  title,
  role,
  children,
}: {
  title: string;
  role?: 'alert';
  children: React.ReactNode;
}) {
  return (
    <div
      role={role}
      className="mx-auto flex max-w-sm flex-col items-center gap-1 px-4 py-16 text-center"
    >
      <p className="font-medium text-sm">{title}</p>
      <p className="text-muted-foreground text-xs">{children}</p>
    </div>
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
        className="group/row border-border/60 hover:bg-muted/30"
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
            <StatusDot status={row.status} />
            <div className="flex min-w-0 flex-col">
              <span
                title={row.name}
                className={cn(
                  'truncate',
                  level === 'campaign' ? 'font-medium' : 'text-muted-foreground',
                )}
              >
                {row.name}
              </span>
              <span className="truncate text-2xs text-muted-foreground @md/campaigns:hidden">
                {humanizeStatus(row.status)}
                {delivery ? ` · ${delivery}` : ''}
              </span>
            </div>
          </div>
        </TableCell>
        <TableCell className="hidden py-2 @md/campaigns:table-cell">
          <div className="flex min-w-0 flex-col text-xs">
            <span className={cn(row.status !== 'ACTIVE' && 'text-muted-foreground')}>
              {humanizeStatus(row.status)}
            </span>
            {delivery ? (
              <span className="truncate text-2xs text-muted-foreground" title={delivery}>
                {delivery}
              </span>
            ) : null}
          </div>
        </TableCell>
        <TableCell
          className={cn(
            'py-2 text-right tabular-nums',
            (depth > 0 || row.status !== 'ACTIVE') && 'text-muted-foreground',
          )}
        >
          {budget ?? <span className="text-muted-foreground">—</span>}
        </TableCell>
        <TableCell className="py-2 pr-1 text-right">
          {action ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              data-testid={
                action.tool === 'pause_meta_entity' ? 'scale-row-pause' : 'scale-row-unpause'
              }
              aria-label={`${action.tool === 'pause_meta_entity' ? 'Pause' : 'Unpause'} ${levelNoun(level)} ${row.name}`}
              onClick={() => context.onAction(row, level, parentId)}
              className={ROW_ACTION}
            >
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

/** Green when it delivers, muted when paused, red when deleted. The word sits beside it. */
function StatusDot({ status }: { status: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'size-1.5 shrink-0 rounded-full',
        status === 'ACTIVE'
          ? 'bg-success'
          : status === 'DELETED'
            ? 'bg-destructive/70'
            : status === 'PAUSED'
              ? 'bg-muted-foreground/60'
              : 'bg-muted-foreground/30',
      )}
    />
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
    <TableRow className="border-border/60 hover:bg-transparent">
      <TableCell
        colSpan={4}
        className={cn('py-2.5 text-muted-foreground text-xs whitespace-normal', INDENT[depth])}
      >
        <span className="pl-[2.625rem]">{children}</span>
      </TableCell>
    </TableRow>
  );
}

function SkeletonRow({ depth }: { depth: number }) {
  const bar = 'rounded-md bg-muted/70 motion-safe:animate-pulse';
  return (
    <TableRow aria-hidden="true" className="border-border/60 hover:bg-transparent">
      <TableCell className={cn('py-3', INDENT[depth])}>
        <div className="flex items-center gap-2">
          <div className={cn('size-5', bar)} />
          <div className={cn('h-4 w-1/2', bar)} />
        </div>
      </TableCell>
      <TableCell className="hidden py-3 @md/campaigns:table-cell">
        <div className={cn('h-4 w-14', bar)} />
      </TableCell>
      <TableCell className="py-3">
        <div className={cn('ml-auto h-4 w-16', bar)} />
      </TableCell>
      <TableCell className="py-3 pr-1" />
    </TableRow>
  );
}

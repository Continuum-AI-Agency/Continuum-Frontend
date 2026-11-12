'use client';
import { useTranslations as useBetaTranslations } from 'next-intl';

// G12, the change preview: a write the Optimizer proposes or applied, drawn before → after. Each
// entity gets two thin bars on one scale (the before muted, the after in the board's up or down
// colour) with both figures and the change written beside them; the guardrails it is held to
// read as a checklist; and the footer carries the one action its state allows: Approve while a
// move waits on a person, Apply once it is approved, the undo once it is applied. Every action
// is the queue's own (approve → optimizer_request_apply_item, apply → the confirm and its
// drain, undo → ActionRevertControl's action-revert path); nothing here writes on its own.

import {
  ArrowRightIcon,
  CheckIcon,
  Clock3Icon,
  MinusIcon,
  SendIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatCurrency, formatPercent } from '../../../format';
import type { OptimizerActionFeedRow } from '../../../useOptimizerData';
import {
  ActionAppliedState,
  type ActionEntityNames,
  actionEntity,
  NO_ENTITY_NAMES,
  printChangeValue,
} from '../../actionCardParts';
import {
  actionPlatform,
  actorLabel,
  changeAmounts,
  readActionChange,
  readReceiptTrace,
} from '../../actionRows';
import { BOARD_COLOR, boardPaletteClass } from '../../board/palette';
import { formatWhen, ReceiptToken } from '../../feedChrome';
import { PlatformChip, PlatformChips } from '../../platforms/PlatformChip';
import type { AdPlatform } from '../../platforms/platformTabsModel';
import {
  type AutopilotRun,
  type GuardrailCheck,
  type GuardrailState,
  netDelta,
  runWhenWords,
  type WriteBar,
  type WriteState,
  writeBars,
} from './writePreviewModel';

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

const AFTER_COLOR: Record<WriteBar['direction'], string> = {
  up: BOARD_COLOR.search,
  down: BOARD_COLOR.pmax,
  flat: BOARD_COLOR.mid,
};

function signedMoney(value: number, currency: string | null): string {
  if (Math.abs(value) < 0.005) return formatCurrency(0, currency);
  return `${value > 0 ? '+' : '−'}${formatCurrency(Math.abs(value), currency)}`;
}

/** One entity's before → after: the name, the two bars, and the figures written beside them. */
function BarRow({
  bar,
  currency,
  index,
}: {
  bar: WriteBar;
  currency: string | null;
  index: number;
}) {
  const reduce = useReducedMotion();
  return (
    // Narrow: the name and the figures share a line when they fit (the figures wrap under the
    // name when they do not) and the bars take the full width below. Wide: three columns.
    <li
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 @lg:grid @lg:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto]"
      data-direction={bar.direction}
      data-testid="write-bar"
    >
      <span className="min-w-0 flex-1 basis-36 truncate text-sm" title={bar.entityId}>
        {bar.name}
      </span>
      <div
        aria-hidden="true"
        className="order-last flex min-w-0 basis-full flex-col gap-[3px] @lg:order-none @lg:basis-auto"
      >
        <span
          className="block h-2 rounded-full bg-muted-foreground/30"
          data-pct={bar.beforePct}
          data-testid="write-bar-before"
          style={{ width: `${bar.beforePct}%` }}
        />
        <motion.span
          animate={{ width: `${bar.afterPct}%` }}
          className="block h-2 rounded-full"
          data-pct={bar.afterPct}
          data-testid="write-bar-after"
          initial={reduce ? false : { width: `${bar.beforePct}%` }}
          style={{
            width: `${bar.afterPct}%`,
            background: AFTER_COLOR[bar.direction],
          }}
          transition={{
            type: 'spring',
            visualDuration: 0.7,
            bounce: 0.2,
            delay: 0.2 + index * 0.08,
          }}
        />
      </div>
      <span className="ml-auto flex shrink-0 items-center justify-end gap-1.5 whitespace-nowrap font-mono text-xs tabular-nums">
        <span className="text-muted-foreground">{formatCurrency(bar.before, currency)}</span>
        <ArrowRightIcon aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
        <span className="font-semibold text-foreground">{formatCurrency(bar.after, currency)}</span>
        {bar.deltaPct != null ? (
          <span
            className="rounded-md border border-border px-1 font-medium text-foreground"
            data-testid="write-bar-delta"
          >
            {formatPercent(bar.deltaPct, { signed: true })}
          </span>
        ) : null}
      </span>
    </li>
  );
}

export function BeforeAfterBars({
  bars,
  currency,
  label,
}: {
  bars: readonly WriteBar[];
  currency: string | null;
  /** The bars in words, for a screen reader. */
  label: string;
}) {
  return (
    <ul aria-label={label} className="flex flex-col gap-3" data-testid="write-bars">
      {bars.map((bar, index) => (
        <BarRow bar={bar} currency={currency} index={index} key={bar.key} />
      ))}
    </ul>
  );
}

function Swatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="size-2.5 shrink-0 rounded-sm"
      style={{ background: color }}
    />
  );
}

/** What the colours mean, and the moves' net change to the daily total, written. */
export function BarLegend({
  bars,
  currency,
}: {
  bars: readonly WriteBar[];
  currency: string | null;
}) {
  const betaUiText = useBetaTranslations('scale');

  const net = netDelta(bars);
  const directions = new Set(bars.map((bar) => bar.direction));
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
      <span className="inline-flex items-center gap-1.5">
        <Swatch color="color-mix(in srgb, var(--muted-foreground) 30%, transparent)" />
        {betaUiText('beta_9bb725005055')}
      </span>
      {directions.has('up') ? (
        <span className="inline-flex items-center gap-1.5">
          <Swatch color={BOARD_COLOR.search} />
          {betaUiText('beta_97a4344c85fd')}
        </span>
      ) : null}
      {directions.has('down') ? (
        <span className="inline-flex items-center gap-1.5">
          <Swatch color={BOARD_COLOR.pmax} />
          {betaUiText('beta_96e7d5564a67')}
        </span>
      ) : null}
      <span className="font-medium text-foreground tabular-nums" data-testid="write-net">
        {betaUiText('beta_660fb2c41d02')} {signedMoney(net, currency)}
        {betaUiText('beta_ea30d1c554b8')}
      </span>
    </div>
  );
}

const CHECK_ICON: Record<GuardrailState, typeof CheckIcon> = {
  pass: CheckIcon,
  wait: Clock3Icon,
  fail: TriangleAlertIcon,
  off: MinusIcon,
};

const CHECK_TONE: Record<GuardrailState, string> = {
  pass: 'text-success',
  wait: 'text-warning',
  fail: 'text-destructive',
  off: 'text-muted-foreground',
};

/** The guardrails as a checklist: each one's state as a mark, its rule and what it found. */
export function GuardrailChecklist({ checks }: { checks: readonly GuardrailCheck[] }) {
  const betaUiText = useBetaTranslations('scale');

  const reduce = useReducedMotion();
  return (
    <ul
      aria-label={betaUiText('beta_443f975eefe8')}
      className="grid grid-cols-[repeat(auto-fit,minmax(min(14rem,100%),1fr))] gap-x-4 gap-y-2"
      data-testid="write-checks"
    >
      {checks.map((check, index) => {
        const Icon = CHECK_ICON[check.state];
        return (
          <motion.li
            animate={{ opacity: 1, y: 0 }}
            className="flex min-w-0 items-start gap-2"
            data-check={check.id}
            data-state={check.state}
            initial={reduce ? false : { opacity: 0, y: 4 }}
            key={check.id}
            transition={{
              duration: 0.35,
              ease: EASE_OUT,
              delay: 0.15 + index * 0.05,
            }}
          >
            <Icon
              aria-hidden="true"
              className={cn('mt-0.5 size-4 shrink-0', CHECK_TONE[check.state])}
            />
            <span className="min-w-0">
              <span className="block font-medium text-foreground text-sm leading-snug">
                {check.label}
              </span>
              <span className="block text-muted-foreground text-xs leading-snug">
                {check.detail}
              </span>
            </span>
          </motion.li>
        );
      })}
    </ul>
  );
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** The footer: the one action the write's state allows, and why it is held when it is. */
function WriteStateFooter({
  state,
  writesBlocked,
  blockedReason,
  busy,
  onApprove,
  onApply,
}: {
  state: WriteState;
  writesBlocked: boolean;
  blockedReason: string | null;
  busy: boolean;
  onApprove: (keys: string[]) => void;
  onApply: () => void;
}) {
  const betaUiText = useBetaTranslations('scale');

  if (state.kind === 'none') return null;
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2"
      data-state={state.kind}
      data-testid="write-state"
    >
      {state.kind === 'approve' ? (
        <>
          <Button
            className="h-8 px-3 text-sm"
            disabled={writesBlocked || busy}
            onClick={() => onApprove(state.keys)}
            size="sm"
            type="button"
          >
            <SendIcon aria-hidden="true" className="size-3.5" />
            {betaUiText('beta_6007acbe30b2')} {plural(state.keys.length, 'move', 'moves')}
          </Button>
          {state.approved > 0 ? (
            <span className="text-muted-foreground text-xs">
              {plural(state.approved, 'more is', 'more are')} {betaUiText('beta_953516f41426')}
            </span>
          ) : null}
        </>
      ) : (
        <>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 font-medium text-foreground text-xs">
            <Clock3Icon aria-hidden="true" className="size-3.5" />
            {betaUiText('beta_aad9cfb3f7f3')}
          </span>
          <Button
            className="h-8 px-3 text-sm"
            disabled={writesBlocked || busy}
            onClick={onApply}
            size="sm"
            type="button"
          >
            {betaUiText('beta_3f0c9286cd8c')}
          </Button>
        </>
      )}
      {writesBlocked && blockedReason ? (
        <span className="text-muted-foreground text-xs">{blockedReason}</span>
      ) : null}
    </div>
  );
}

/** Autopilot's own next run, when it is armed: what is queued without anyone pressing a thing. */
function AutopilotRunLine({ run, now }: { run: AutopilotRun; now: Date }) {
  const betaUiText = useBetaTranslations('scale');

  return (
    <p
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-xs"
      data-testid="write-autopilot-run"
    >
      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">
        <Clock3Icon aria-hidden="true" className="size-3.5" />
        {betaUiText('beta_b1189be7ba8f')} {runWhenWords(run.at, now)}
      </span>
      <span>
        {betaUiText('beta_c029085a4afd')}
        {run.othersWait ? betaUiText('beta_7343e99eae21') : ''} {betaUiText('beta_16346adc24cd')}
      </span>
    </p>
  );
}

export type BudgetWritePreviewProps = {
  moves: readonly {
    key: string;
    entityId: string;
    name: string | null;
    before: number | null;
    after: number | null;
  }[];
  checks: readonly GuardrailCheck[];
  state: WriteState;
  platforms: readonly AdPlatform[];
  currency: string | null;
  writesBlocked: boolean;
  /** Why writes are held (the portfolio's apply mode), shown beside the disabled action. */
  blockedReason?: string | null;
  busy: boolean;
  /** When autopilot runs again on its own; null when it does not (autopilotNextRun). */
  autopilotRun?: AutopilotRun | null;
  onApprove: (keys: string[]) => void;
  onApply: () => void;
  now?: Date;
};

/**
 * The cycle's budget moves as one change preview, at the head of the portfolio's queue. With no
 * move left to decide it still stands for an armed autopilot: its guardrails and its next run.
 */
export function BudgetWritePreview({
  moves,
  checks,
  state,
  platforms,
  currency,
  writesBlocked,
  blockedReason = null,
  busy,
  autopilotRun = null,
  onApprove,
  onApply,
  now = new Date(),
}: BudgetWritePreviewProps) {
  const betaUiText = useBetaTranslations('scale');

  const bars = writeBars(moves);
  if (bars.length === 0 && !autopilotRun) return null;
  const count = plural(bars.length, 'budget move', 'budget moves');
  return (
    <section
      aria-label={betaUiText('beta_af6683418a96')}
      className={cn(
        '@container flex flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground',
        boardPaletteClass,
      )}
      data-testid="write-preview"
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="font-semibold text-sm tracking-tight">{betaUiText('beta_af6683418a96')}</p>
        <span className="text-muted-foreground text-xs">
          {bars.length > 0
            ? betaUiText('beta_94b9c6ee0038', { value0: String(count) })
            : betaUiText('beta_6d372d798809')}
        </span>
        <span className="ml-auto">
          <PlatformChips platforms={platforms} />
        </span>
      </header>
      {bars.length > 0 ? (
        <>
          <BeforeAfterBars
            bars={bars}
            currency={currency}
            label={betaUiText('beta_94b9c6ee0038', { value0: String(count) })}
          />
          <BarLegend bars={bars} currency={currency} />
        </>
      ) : null}
      <GuardrailChecklist checks={checks} />
      <WriteStateFooter
        blockedReason={blockedReason}
        busy={busy}
        onApply={onApply}
        onApprove={onApprove}
        state={state}
        writesBlocked={writesBlocked}
      />
      {autopilotRun ? <AutopilotRunLine now={now} run={autopilotRun} /> : null}
    </section>
  );
}

/**
 * One applied write in Recently applied: what changed on what, the money drawn before → after on
 * its own scale, when and by whom, and its state with the undo the server allows.
 */
export function AppliedWriteRow({
  row,
  brandId,
  currency,
  entityNames = NO_ENTITY_NAMES,
}: {
  row: OptimizerActionFeedRow;
  brandId: string;
  currency: string | null;
  entityNames?: ActionEntityNames;
}) {
  const betaUiText = useBetaTranslations('scale');

  const change = readActionChange(row);
  const entity = actionEntity(row, entityNames);
  const platform = actionPlatform(row);
  const receipt = readReceiptTrace(row);
  const amounts = changeAmounts(change, currency);
  const bars = amounts
    ? writeBars([
        {
          key: row.id,
          entityId: entity.id ?? entity.name,
          name: entity.name,
          ...amounts,
        },
      ])
    : [];
  return (
    <li
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 py-3',
        boardPaletteClass,
      )}
      data-action-id={row.id}
      data-testid="applied-write"
    >
      <div className="@container min-w-0 space-y-1.5">
        <p className="text-sm leading-snug">
          <span className="font-semibold text-foreground">{change.sentence ?? change.label}</span>{' '}
          {row.op !== 'setting' ? (
            <span className="text-foreground" title={entity.id ?? undefined}>
              {entity.name}
            </span>
          ) : null}
        </p>
        {bars[0] ? (
          // On a phone the figures drop under the bars rather than push the row wide.
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <div aria-hidden="true" className="flex min-w-24 flex-1 basis-24 flex-col gap-[3px]">
              <span
                className="block h-2 rounded-full bg-muted-foreground/30"
                style={{ width: `${bars[0].beforePct}%` }}
              />
              <span
                className="block h-2 rounded-full"
                style={{
                  width: `${bars[0].afterPct}%`,
                  background: AFTER_COLOR[bars[0].direction],
                }}
              />
            </div>
            <span
              className="flex shrink-0 items-center gap-1.5 whitespace-nowrap font-mono text-xs tabular-nums"
              data-figure-role="change"
            >
              <span className="text-muted-foreground">
                {formatCurrency(bars[0].before, currency)}
              </span>
              <ArrowRightIcon
                aria-hidden="true"
                className="size-3 shrink-0 text-muted-foreground"
              />
              <span className="font-semibold text-foreground">
                {formatCurrency(bars[0].after, currency)}
              </span>
              {bars[0].deltaPct != null ? (
                <span className="rounded-md border border-border px-1 font-medium text-foreground">
                  {formatPercent(bars[0].deltaPct, { signed: true })}
                </span>
              ) : null}
            </span>
          </div>
        ) : change.sentence ? null : (
          <p
            className="inline-flex flex-wrap items-center gap-1.5 font-mono text-xs tabular-nums"
            data-figure-role="change"
          >
            <span className="text-muted-foreground">
              {printChangeValue(change, change.before, currency)}
            </span>
            <ArrowRightIcon aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
            <span className="font-semibold text-foreground">
              {printChangeValue(change, change.after, currency)}
            </span>
          </p>
        )}
        <p className="flex flex-wrap items-center gap-x-1.5 text-muted-foreground text-xs">
          <time dateTime={row.ts}>{formatWhen(row.ts)}</time>
          <span>· {actorLabel(row)}</span>
          <PlatformChip platform={platform} />
        </p>
        {row.justification ? (
          <p className="text-muted-foreground text-xs leading-relaxed">
            {betaUiText('beta_ad389aa4c08e')} {row.justification}
          </p>
        ) : null}
        {receipt ? <ReceiptToken platform={platform} value={receipt} /> : null}
      </div>
      <ActionAppliedState brandId={brandId} currency={currency} row={row} />
    </li>
  );
}

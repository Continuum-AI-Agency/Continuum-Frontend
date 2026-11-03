'use client';

// G10 Signal: what Google counts as a conversion against what counts. A whole bar splits what
// Google reports into attention events and real results, with the cost of each (V1); the
// conversion actions are listed with their role and their value (E3); the clicks are followed to
// leads and the leads to sales (P5). A small lens leads with its sharpest figure; a larger one
// draws each finding the account has, and closes with one sentence built from its figures.

import type { BoardModuleSize } from '@continuum/contracts';
import { LockIcon } from 'lucide-react';
import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { type FigureWindow, figureProps, formatCurrency } from '../../../../format';
import { figureWindowOf } from '../../../platforms/googleAdsOverviewModel';
import { ModuleFrame, type ModuleFrameState } from '../../ModuleFrame';
import { BOARD_COLOR } from '../../palette';
import type { BoardModuleProps } from '../../types';
import {
  CARDS_UNAVAILABLE,
  CARDS_UNREAD,
  isSmall,
  Legend,
  type LegendItem,
  type LensBlocked,
  type LensCards,
  LensEmpty,
  LensHeadline,
  LensLoading,
  LensScope,
  LensTakeaway,
  LensWindowTag,
  NEUTRAL_MARK,
  TipMark,
  useLensCards,
} from './MixAuctionSignalParts';
import { countLabel, shareLabel } from './mixAuctionSignalModel';
import {
  buildSignal,
  funnelRoles,
  hasSignal,
  type SignalAction,
  type SignalActions,
  type SignalFunnel,
  type SignalModel,
  type SignalSplit,
  type SignalStepRole,
  signalTakeaway,
  stepRate,
} from './signalModel';

/** What counts takes the cool pole and what Google counts besides it the warm one: the bar is the
 *  polarity of the account's signal. An action the finding flags takes the warm pole too. */
const ATTENTION = BOARD_COLOR.above;
const REAL = BOARD_COLOR.below;
const OTHER_ACTION = NEUTRAL_MARK;

/** A share prints inside its block only from this wide. */
const INSIDE_LABEL_MIN = 0.12;

/** The chrome's words for the V1 bars and the P5 steps. The card's own words follow the engine's
 *  language; the lens reads the bars by their flag and their order and names them itself. */
const ATTENTION_LABEL = 'Visits and attention events';
const REAL_LABEL = 'Leads and sales';
const STEP_LABEL: Record<SignalStepRole, string> = {
  clicks: 'Clicks',
  leads: 'Leads',
  sales: 'Sales',
};

const NO_FINDING = "No conversion finding on this account's last cycle.";

export type SignalLensState =
  | { status: 'loading' }
  | LensBlocked
  | { status: 'ready'; model: SignalModel };

export function signalLensState(cards: LensCards): SignalLensState {
  if (cards.status === 'loading') return { status: 'loading' };
  if (cards.status === 'unavailable') return { status: 'missing', line: CARDS_UNAVAILABLE };
  if (cards.status === 'error') return { status: 'error', line: CARDS_UNREAD };
  return { status: 'ready', model: buildSignal(cards.cards) };
}

/** What the frame says the lens could show; no V1, E3 or P5 finding is `missing`. */
export function signalFrameState(state: SignalLensState): ModuleFrameState {
  if (state.status !== 'ready') return state.status;
  return hasSignal(state.model) ? 'ready' : 'missing';
}

export default function SignalLens({ ctx, slot }: BoardModuleProps) {
  const cards = useLensCards(ctx.brandId);
  const state = useMemo(() => signalLensState(cards), [cards]);
  return <SignalLensView reason={slot.reason} size={slot.size} state={state} />;
}

export function SignalLensView({
  state,
  size,
  reason,
}: {
  state: SignalLensState;
  size: BoardModuleSize;
  reason?: string;
}) {
  const windowDays = state.status === 'ready' ? state.model.windowDays : null;
  return (
    <ModuleFrame
      action={
        windowDays != null ? <LensWindowTag days={windowDays} testId="signal-window" /> : undefined
      }
      reason={reason}
      size={size}
      state={signalFrameState(state)}
      testId="board-module-signal"
      title="Conversion signal"
    >
      <SignalBody size={size} state={state} />
    </ModuleFrame>
  );
}

type Section = 'split' | 'actions' | 'funnel';

function sectionsOf(model: SignalModel): Section[] {
  return [
    ...(model.split ? (['split'] as const) : []),
    ...(model.actions ? (['actions'] as const) : []),
    ...(model.funnel ? (['funnel'] as const) : []),
  ];
}

function SignalBody({ state, size }: { state: SignalLensState; size: BoardModuleSize }) {
  if (state.status === 'loading') return <LensLoading size={size} testId="signal" />;
  if (state.status !== 'ready') {
    return <LensEmpty testId="signal-empty">{state.line}</LensEmpty>;
  }
  const { model } = state;
  if (!hasSignal(model)) return <LensEmpty testId="signal-empty">{NO_FINDING}</LensEmpty>;
  const figureWindow = figureWindowOf(model.windowDays ?? 0);
  if (isSmall(size)) return <SmallSignal figureWindow={figureWindow} model={model} />;
  const sections = sectionsOf(model);
  // A two-column lens draws its first finding in full and the others compact; a tall or wide one
  // draws them all in full.
  const full = (index: number) => size !== 'm' || index === 0;
  const takeaway = signalTakeaway(model);
  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="signal-lens">
      {sections.map((section, index) => {
        if (section === 'split' && model.split) {
          return (
            <SplitSection
              compact={!full(index)}
              currency={model.currency}
              figureWindow={figureWindow}
              key={section}
              split={model.split}
            />
          );
        }
        if (section === 'actions' && model.actions) {
          return <ActionsSection actions={model.actions} compact={!full(index)} key={section} />;
        }
        if (section === 'funnel' && model.funnel) {
          return (
            <FunnelSection
              compact={!full(index)}
              currency={model.currency}
              funnel={model.funnel}
              key={section}
            />
          );
        }
        return null;
      })}
      {model.windowDays != null ? (
        <LensScope>Last {model.windowDays} days · the Optimizer's last cycle</LensScope>
      ) : null}
      {takeaway ? <LensTakeaway testId="signal-takeaway">{takeaway}</LensTakeaway> : null}
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <p className="font-medium text-muted-foreground text-xs">{children}</p>;
}

// ── V1: what Google reports, split into attention events and real results ────────────────────

function SplitBar({ split, thin }: { split: SignalSplit; thin: boolean }) {
  const parts = [
    {
      key: 'attention',
      label: ATTENTION_LABEL,
      value: split.attention,
      share: split.attentionShare,
      color: ATTENTION,
    },
    {
      key: 'real',
      label: REAL_LABEL,
      value: split.real,
      share: 1 - split.attentionShare,
      color: REAL,
    },
  ];
  return (
    <div
      className={cn('flex w-full gap-0.5', thin ? 'h-4' : 'h-[22px]')}
      data-testid="signal-split-bar"
    >
      {parts.map((part, index) =>
        part.share > 0 ? (
          <TipMark
            className="h-full min-w-[2px] shrink"
            color={part.color}
            delay={index * 0.08}
            fillClassName={thin ? 'inset-x-0 inset-y-1 rounded-full' : 'inset-0 rounded-[4px]'}
            key={part.key}
            label={part.label}
            style={{ flexBasis: `${(part.share * 100).toFixed(2)}%`, flexGrow: 0 }}
            testId={`signal-part-${part.key}`}
            value={`${countLabel(part.value)} · ${shareLabel(part.share)}`}
          >
            {!thin && part.share >= INSIDE_LABEL_MIN ? (
              <span className="pointer-events-none absolute inset-y-0 left-1.5 flex items-center font-semibold text-white text-xs">
                {shareLabel(part.share)}
              </span>
            ) : null}
          </TipMark>
        ) : null,
      )}
    </div>
  );
}

const SPLIT_LEGEND: readonly LegendItem[] = [
  { label: ATTENTION_LABEL, color: ATTENTION },
  { label: REAL_LABEL, color: REAL },
];

function CostTile({
  label,
  value,
  figure,
}: {
  label: string;
  value: string;
  figure: ReturnType<typeof figureProps>;
}) {
  return (
    <div className="min-w-0 rounded-lg border px-3 py-2">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-semibold text-base" {...figure}>
        {value}
      </dd>
    </div>
  );
}

function SplitSection({
  split,
  currency,
  compact,
  figureWindow,
}: {
  split: SignalSplit;
  currency: string | null;
  compact: boolean;
  figureWindow: FigureWindow;
}) {
  return (
    <section className="space-y-2" data-testid="signal-split">
      <SectionLabel>What Google counts as a conversion</SectionLabel>
      <SplitBar split={split} thin={compact} />
      <Legend items={SPLIT_LEGEND} testId="signal-split-legend" />
      {compact ? null : (
        <>
          <dl className="grid grid-cols-2 gap-2">
            <CostTile
              figure={figureProps(
                'board.signal.reported-cost',
                split.reportedCost,
                currency,
                figureWindow,
              )}
              label="Cost per conversion Google reports"
              value={formatCurrency(split.reportedCost, currency)}
            />
            <CostTile
              figure={figureProps('board.signal.real-cost', split.realCost, currency, figureWindow)}
              label="Cost per real result"
              value={
                split.realCost == null && split.real < 1
                  ? 'no real result'
                  : formatCurrency(split.realCost, currency)
              }
            />
          </dl>
          <p
            className="text-muted-foreground text-xs tabular-nums"
            data-testid="signal-split-counts"
          >
            {split.reported != null ? `${countLabel(split.reported)} reported · ` : ''}
            {countLabel(split.attention)} {ATTENTION_LABEL.toLowerCase()} · {countLabel(split.real)}{' '}
            {REAL_LABEL.toLowerCase()}
          </p>
        </>
      )}
    </section>
  );
}

// ── E3: the conversion actions, their role and their value ────────────────────────────────────

function valueText(value: SignalAction['value']): string {
  if (value === 'unset') return 'no value set';
  return value == null ? 'value —' : `value ${value}`;
}

function ActionsSection({ actions, compact }: { actions: SignalActions; compact: boolean }) {
  const rows = compact ? actions.rows.slice(0, 3) : actions.rows;
  const longest = Math.max(...actions.rows.map((row) => row.share), 0.0001);
  const legend: LegendItem[] = [
    ...(actions.rows.some((row) => row.flagged)
      ? [{ label: 'Flagged by the Optimizer', color: ATTENTION }]
      : []),
    ...(actions.rows.some((row) => !row.flagged)
      ? [{ label: 'Other conversion actions', color: OTHER_ACTION }]
      : []),
  ];
  return (
    <section className="space-y-2" data-testid="signal-actions">
      <SectionLabel>
        {actions.sameValue != null
          ? `Conversion actions · all valued ${actions.sameValue}`
          : 'Conversion actions and their value'}
      </SectionLabel>
      <ul className="space-y-1.5">
        {rows.map((row, index) => (
          <li className="min-w-0 space-y-0.5" data-testid="signal-action" key={row.label}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="min-w-0 truncate text-foreground" title={row.label}>
                {row.label}
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <span className="font-semibold tabular-nums">{countLabel(row.count)}</span>
                {row.role ? (
                  <Badge variant={row.role === 'primary' ? 'outline' : 'muted'}>
                    {row.role === 'primary' ? 'Primary' : 'Secondary'}
                  </Badge>
                ) : null}
                {compact ? null : (
                  <span className="text-muted-foreground" data-testid="signal-action-value">
                    {valueText(row.value)}
                  </span>
                )}
              </span>
            </div>
            <TipMark
              className="h-2.5 min-w-[2px]"
              color={row.flagged ? ATTENTION : OTHER_ACTION}
              delay={index * 0.05}
              fillClassName="inset-x-0 inset-y-[1px] rounded-full"
              label={row.label}
              style={{ width: `${((row.share / longest) * 100).toFixed(2)}%` }}
              value={`${countLabel(row.count)} · ${shareLabel(row.share)}`}
            />
          </li>
        ))}
      </ul>
      {compact && actions.rows.length > rows.length ? (
        <p className="text-muted-foreground text-xs">
          +{actions.rows.length - rows.length} more conversion{' '}
          {actions.rows.length - rows.length === 1 ? 'action' : 'actions'}
        </p>
      ) : null}
      {legend.length > 1 ? <Legend items={legend} testId="signal-actions-legend" /> : null}
    </section>
  );
}

// ── P5: from click to lead to sale ────────────────────────────────────────────────────────────

function FunnelSteps({ funnel }: { funnel: SignalFunnel }) {
  return (
    <ol
      className="grid gap-2"
      data-testid="signal-funnel-steps"
      style={{ gridTemplateColumns: `repeat(${funnel.steps.length}, minmax(0, 1fr))` }}
    >
      {funnel.steps.map((step, index) => {
        const previous = funnel.steps[index - 1];
        const rate = previous ? stepRate(step.value, previous.value) : null;
        return (
          <li
            className="min-w-0 rounded-lg border px-2.5 py-2"
            data-flagged={step.flagged ? 'true' : 'false'}
            data-testid="signal-funnel-step"
            key={step.role}
            style={step.flagged ? { borderColor: ATTENTION } : undefined}
          >
            <p className="font-semibold text-lg tabular-nums leading-tight">
              {countLabel(step.value)}
            </p>
            <p className="text-muted-foreground text-xs">{STEP_LABEL[step.role]}</p>
            {rate && previous ? (
              <p
                className="text-muted-foreground text-xs tabular-nums"
                data-testid="signal-step-rate"
              >
                {rate} of {STEP_LABEL[previous.role].toLowerCase()}
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function FunnelSection({
  funnel,
  currency,
  compact,
}: {
  funnel: SignalFunnel;
  currency: string | null;
  compact: boolean;
}) {
  return (
    <section className="space-y-2" data-testid="signal-funnel">
      <SectionLabel>From click to sale</SectionLabel>
      <FunnelSteps funnel={funnel} />
      {compact ? null : (
        <>
          <dl className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border px-3 py-2">
              <dt className="text-muted-foreground text-xs">Sales value</dt>
              <dd className="font-semibold text-base" data-testid="signal-sales-value">
                {formatCurrency(funnel.salesValue, currency)}
              </dd>
            </div>
            <div className="rounded-lg border px-3 py-2">
              <dt className="text-muted-foreground text-xs">ROAS</dt>
              <dd className="font-semibold text-base" data-testid="signal-roas">
                {funnel.roas != null ? funnel.roas.toFixed(2) : '—'}
              </dd>
            </div>
          </dl>
          {funnel.keywords.length > 0 ? (
            <p className="text-muted-foreground text-xs" data-testid="signal-keywords">
              Core keywords:{' '}
              {funnel.keywords
                .map((keyword) => `“${keyword.keyword}” ${keyword.score}`)
                .join(' · ')}
            </p>
          ) : null}
          {funnel.blocked ? (
            <p
              className="flex items-start gap-1.5 text-muted-foreground text-xs"
              data-testid="signal-blocked"
            >
              <LockIcon aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
              <span>{funnel.blocked}</span>
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

// ── The small lens: one figure and its mini chart ─────────────────────────────────────────────

function SmallSignal({ model, figureWindow }: { model: SignalModel; figureWindow: FigureWindow }) {
  if (model.split) {
    const split = model.split;
    return (
      <div className="flex min-w-0 flex-col gap-2" data-testid="signal-lens">
        <LensHeadline
          figure={figureProps(
            'board.signal.attention-share',
            Math.round(split.attentionShare * 100),
            null,
            figureWindow,
            'percent',
          )}
          label={
            split.reported != null
              ? `of the ${countLabel(split.reported)} conversions Google reports are attention events`
              : 'of what Google reports are attention events'
          }
          testId="signal-headline"
          value={shareLabel(split.attentionShare)}
        />
        <SplitBar split={split} thin />
        <Legend items={SPLIT_LEGEND} testId="signal-split-legend" />
      </div>
    );
  }
  if (model.funnel) {
    const { leads, sales } = funnelRoles(model.funnel);
    return (
      <div className="flex min-w-0 flex-col gap-2" data-testid="signal-lens">
        {leads && sales ? (
          <LensHeadline
            figure={figureProps('board.signal.sales', sales.value, null, figureWindow, 'count')}
            label={`${STEP_LABEL.leads.toLowerCase()} → ${STEP_LABEL.sales.toLowerCase()}, last ${model.windowDays ?? '—'} days`}
            testId="signal-headline"
            value={`${countLabel(leads.value)} → ${countLabel(sales.value)}`}
          />
        ) : null}
        <FunnelSteps funnel={model.funnel} />
      </div>
    );
  }
  const actions = model.actions;
  if (!actions) return null;
  const flagged = actions.rows.filter((row) => row.flagged).length;
  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid="signal-lens">
      <LensHeadline
        label={
          actions.sameValue != null
            ? `conversion actions, every one valued ${actions.sameValue}`
            : 'conversion actions flagged by the Optimizer'
        }
        testId="signal-headline"
        value={
          actions.sameValue != null
            ? `All ${actions.rows.length}`
            : `${flagged} of ${actions.rows.length}`
        }
      />
      <ActionsSection actions={actions} compact />
    </div>
  );
}

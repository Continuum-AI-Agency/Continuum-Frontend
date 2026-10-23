'use client';

// A cross-platform move in Activity: ONE decision, its legs as sub-rows with their own platform
// receipt, and the move's state in words (prototipo.html Activity; escenarios 18 and 19).
//
// Each leg carries its own Undo: the same check-first per-write undo a platform write has in
// Activity (PlatformUndoControl → optimizer-apply-action-revert), in reverse leg order — every
// increase first, a decrease only once every increase of the move is undone, so an undo that
// stops halfway leaves the client spending less, never more (moveDecisionModel.legUndo).

import { GavelIcon } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import * as typeScale from '../../typeScale';
import { ActionMeta } from '../actionCardParts';
import { readActionChange } from '../actionRows';
import { ReceiptToken } from '../feedChrome';
import { PlatformUndoControl } from '../platformCards/PlatformCardActionControl';
import { PLATFORM_NAMES } from '../platforms/platformTabsModel';
import { MoveLegLine } from './MoveLegLine';
import type { MoveDecision, MoveDecisionLeg, MoveState } from './moveDecisionModel';
import { formatMinorExact } from './queuedMoveModel';

const STATE_LABEL: Record<MoveState, string> = {
  applied: 'applied',
  in_progress: 'in progress',
  compensated: 'reverted automatically',
  stranded: 'stuck — autopilot paused',
  refused: 'not applied',
  undone: 'undone',
};

const STATE_TONE: Record<MoveState, string> = {
  applied: 'text-muted-foreground',
  in_progress: 'text-muted-foreground',
  compensated: 'text-warning',
  stranded: 'text-destructive',
  refused: 'text-warning',
  undone: 'text-muted-foreground',
};

function platforms(list: MoveDecision['from']): string {
  return list.length > 0 ? list.map((p) => PLATFORM_NAMES[p]).join(' and ') : 'one platform';
}

function legStateText(leg: MoveDecisionLeg, currency: string | null): string {
  const money = (minor: number | null) => (minor == null ? '—' : formatMinorExact(minor, currency));
  switch (leg.state) {
    case 'applied':
      return leg.row.reverted_by ? 'applied, then undone' : 'applied';
    case 'scheduled':
      return 'scheduled: the platform takes it from midnight';
    case 'refused':
      return leg.error ? `refused: ${leg.error}` : 'refused';
    case 'reverted':
      return `applied, then ${money(leg.revert?.beforeMinor ?? null)} → ${money(leg.revert?.afterMinor ?? null)} reverted`;
    case 'revert_refused':
      return leg.revert?.error
        ? `applied; the revert was refused: ${leg.revert.error}`
        : 'applied; the revert was refused';
  }
}

function stateExplainer(move: MoveDecision, currency: string | null): string | null {
  if (move.state === 'compensated') {
    return `${move.reason ?? 'A later leg failed'}. The ${platforms(move.from)} decrease was put back, so spend is where it was.`;
  }
  if (move.state === 'stranded') {
    const amount = formatMinorExact(move.amountMinor, currency);
    return `${move.reason ?? 'A leg failed and so did its revert'}. ${platforms(move.from)} is up to ${amount}/day lower and ${platforms(move.to)} did not go up. Autopilot is paused on this portfolio until someone checks it.`;
  }
  if (move.state === 'refused') return move.reason;
  return null;
}

/** One leg's Undo. The dialog that is undoing it stays mounted until it is closed: the feed
 *  re-reads the leg as undone as soon as the undo lands (ActionRevertControl, G4). */
function LegUndo({ leg, currency }: { leg: MoveDecisionLeg; currency: string | null }) {
  const [open, setOpen] = React.useState(false);
  const portfolioId = leg.row.portfolio_id;
  if ((leg.undo === 'available' || open) && portfolioId) {
    return (
      <PlatformUndoControl
        auditId={leg.row.id}
        currency={currency}
        onOpenChange={setOpen}
        portfolioId={portfolioId}
        title={`${readActionChange(leg.row).label} on ${PLATFORM_NAMES[leg.platform]}`}
      />
    );
  }
  if (leg.undo === 'after_increases') {
    return (
      <span className="text-muted-foreground text-xs" data-testid="move-leg-undo-waiting">
        Undo after the increase
      </span>
    );
  }
  return null;
}

export function MoveDecisionCard({
  move,
  currency,
  className,
}: {
  move: MoveDecision;
  currency: string | null;
  className?: string;
}) {
  const explainer = stateExplainer(move, currency);
  return (
    <li
      className={cn('space-y-2 py-3', className)}
      data-move-state={move.state}
      data-testid="move-decision"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`${typeScale.label} inline-flex shrink-0 items-center gap-1 font-semibold text-muted-foreground`}
          >
            <GavelIcon aria-hidden="true" className="size-3.5" />
            Decision
          </span>
          <ActionMeta row={{ ...move.actorRow, ts: move.ts }} />
        </div>
        <span
          className={cn(`${typeScale.label} font-semibold`, STATE_TONE[move.state])}
          data-testid="move-state"
        >
          {STATE_LABEL[move.state]}
        </span>
      </div>
      <div className="space-y-0.5">
        <p className="font-semibold text-sm leading-snug">
          Move {formatMinorExact(move.amountMinor, currency)}/day from {platforms(move.from)} to{' '}
          {platforms(move.to)}
        </p>
        {move.portfolioName ? (
          <p className="text-muted-foreground text-xs">{move.portfolioName}</p>
        ) : null}
      </div>
      {explainer ? (
        <p
          className={cn(
            'border-l-2 pl-3 text-sm',
            move.state === 'stranded' ? 'border-destructive/60' : 'border-warning/60',
          )}
          data-testid="move-explainer"
        >
          {explainer}
        </p>
      ) : null}
      <ul className="divide-y divide-border/40">
        {move.legs.map((leg) => (
          <MoveLegLine
            afterMinor={leg.afterMinor}
            beforeMinor={leg.beforeMinor}
            currency={currency}
            direction={null}
            entityId={leg.entityId}
            entityName={null}
            key={leg.row.id}
            pct={null}
            platform={leg.platform}
            testId="move-decision-leg"
          >
            <span className="text-muted-foreground text-xs" data-testid="move-leg-state">
              {legStateText(leg, currency)}
            </span>
            {leg.receipt ? (
              <ReceiptToken className="mt-0 text-xs" platform={leg.platform} value={leg.receipt} />
            ) : null}
            <LegUndo currency={currency} leg={leg} />
          </MoveLegLine>
        ))}
      </ul>
    </li>
  );
}

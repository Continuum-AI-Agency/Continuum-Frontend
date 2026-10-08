'use client';

// A cross-platform move in Activity: ONE decision, its legs as sub-rows with their own platform
// receipt, and the move's state in words (prototipo.html Activity; escenarios 18 and 19).
//
// "Undo both" reverts every leg through the same audited revert edge a single write uses, in
// reverse leg order — the increase comes off before the decrease is put back, so an undo that
// stops halfway leaves the client spending less, never more. It is offered only when the
// server marked every applied leg reversible (moveDecisionModel.moveUndo).

import { GavelIcon, Loader2Icon, Undo2Icon } from 'lucide-react';
import * as React from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import * as typeScale from '../../typeScale';
import { useRevertApply } from '../../useOptimizerData';
import { ActionMeta } from '../actionCardParts';
import { ReceiptToken } from '../feedChrome';
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
  applied: 'border-border/70 bg-muted/40 text-muted-foreground',
  in_progress: 'border-border/70 bg-muted/40 text-muted-foreground',
  compensated: 'border-warning/40 bg-warning/10 text-warning',
  stranded: 'border-destructive/40 bg-destructive/10 text-destructive',
  refused: 'border-warning/40 bg-warning/10 text-warning',
  undone: 'border-border/70 bg-muted/40 text-muted-foreground',
};

function platforms(list: MoveDecision['from']): string {
  return list.length > 0 ? list.map((p) => PLATFORM_NAMES[p]).join(' and ') : 'one platform';
}

function legStateText(leg: MoveDecisionLeg, currency: string | null): string {
  const money = (minor: number | null) => (minor == null ? '—' : formatMinorExact(minor, currency));
  switch (leg.state) {
    case 'applied':
      return 'applied';
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

function UndoMove({
  move,
  brandId,
}: {
  move: MoveDecision & { undo: { kind: 'available' } };
  brandId: string;
}) {
  const revert = useRevertApply();
  const [open, setOpen] = React.useState(false);
  const [phase, setPhase] = React.useState<'confirm' | 'running' | 'done' | 'error'>('confirm');
  const [note, setNote] = React.useState<string | null>(null);

  const run = async () => {
    setPhase('running');
    setNote(null);
    let done = 0;
    for (const step of move.undo.steps) {
      try {
        const result = await revert.mutateAsync({
          audit_id: step.auditId,
          portfolio_id: step.portfolioId,
          brandId,
          dryRun: false,
        });
        if (!result?.ok) {
          setPhase('error');
          setNote(
            `Stopped after ${done} of ${move.undo.steps.length}: ${result?.error?.trim() || result?.reason || 'the revert was refused'}.`,
          );
          return;
        }
        done += 1;
      } catch (error) {
        setPhase('error');
        setNote(
          `Stopped after ${done} of ${move.undo.steps.length}: ${error instanceof Error ? error.message : 'revert failed'}.`,
        );
        return;
      }
    }
    setPhase('done');
    setNote(`Reverted ${done} of ${move.undo.steps.length}.`);
  };

  return (
    <AlertDialog
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setPhase('confirm');
          setNote(null);
        }
      }}
      open={open}
    >
      <AlertDialogTrigger render={<Button className="text-xs" size="sm" variant="outline" />}>
        <Undo2Icon aria-hidden="true" className="size-3.5" />
        {move.undo.label}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{move.undo.label}?</AlertDialogTitle>
          <AlertDialogDescription>
            Every leg goes back to its budget before the move. The increases come off first, so if
            the undo stops halfway the client spends less, never more.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {note ? (
          <p className="text-sm" role="status">
            {note}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Close</AlertDialogCancel>
          {phase === 'done' ? null : (
            <Button disabled={phase === 'running'} onClick={() => void run()}>
              {phase === 'running' ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
              {move.undo.label}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function MoveDecisionCard({
  move,
  brandId,
  currency,
  className,
}: {
  move: MoveDecision;
  brandId: string;
  currency: string | null;
  className?: string;
}) {
  const explainer = stateExplainer(move, currency);
  return (
    <li
      className={cn('space-y-3 rounded-lg border border-border/70 bg-card px-4 py-3', className)}
      data-move-state={move.state}
      data-testid="move-decision"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`${typeScale.label} inline-flex shrink-0 items-center gap-1 rounded-md border border-border/70 bg-muted/40 px-1.5 py-0.5 font-semibold text-muted-foreground`}
          >
            <GavelIcon aria-hidden="true" className="size-3.5" />
            Decision
          </span>
          <ActionMeta row={{ ...move.actorRow, ts: move.ts }} />
        </div>
        <span
          className={cn(
            `${typeScale.label} rounded-md border px-1.5 py-0.5 font-semibold`,
            STATE_TONE[move.state],
          )}
          data-testid="move-state"
        >
          {STATE_LABEL[move.state]}
        </span>
      </div>
      <div className="space-y-0.5">
        <p className="font-semibold text-base leading-snug">
          Move {formatMinorExact(move.amountMinor, currency)}/day from {platforms(move.from)} to{' '}
          {platforms(move.to)}
        </p>
        {move.portfolioName ? (
          <p className="text-muted-foreground text-sm">{move.portfolioName}</p>
        ) : null}
      </div>
      {explainer ? (
        <p
          className={cn(
            'rounded-md border px-3 py-2 text-sm',
            move.state === 'stranded'
              ? 'border-destructive/40 bg-destructive/5'
              : 'border-warning/40 bg-warning/5',
          )}
          data-testid="move-explainer"
        >
          {explainer}
        </p>
      ) : null}
      <ul className="space-y-1.5">
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
          </MoveLegLine>
        ))}
      </ul>
      {move.undo.kind === 'available' ? (
        <div className="flex justify-end">
          <UndoMove brandId={brandId} move={{ ...move, undo: move.undo }} />
        </div>
      ) : null}
    </li>
  );
}

'use client';

// A cross-platform budget move in the Actions queue: ONE row for the whole move (decision 17),
// every leg under it, decreases first, and the same percentage on each side. A person approves
// these even when autopilot could (decision 18).
//
// "Approve the move" is the platform card's approval (PlatformCardActionControl) for the whole
// move: a dry run through /apply/actions first, so the person reads the platforms' verdict
// before anything is written, then the same action for real on Confirm. The service writes the
// decreases first, so a failure between legs leaves the client spending less, never more, and
// it records the recommendation on the ledger rows itself — no status write follows here.
// A move with a platform whose writes are off in this portfolio (G5) offers no approval at all.

import type { RecommendationRow } from '@continuum/contracts';
import { ArrowRightIcon, Loader2Icon, TriangleAlertIcon } from 'lucide-react';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { type ApplyActionsResponse, useApplyOptimizerActions } from '../../useOptimizerData';
import { KindTag } from '../kindTag';
import {
  type CardActionVerdict,
  previewVerdict,
  resultVerdict,
} from '../platformCards/platformCardActionModel';
import { PlatformChip } from '../platforms/PlatformChip';
import { PLATFORM_NAMES } from '../platforms/platformTabsModel';
import { MoveLegLine } from './MoveLegLine';
import {
  formatMinorExact,
  formatSidePct,
  MOVE_APPROVAL_RECOMMENDATION,
  type QueuedMove,
} from './queuedMoveModel';

function platformList(platforms: QueuedMove['from']): string {
  return platforms.map((platform) => PLATFORM_NAMES[platform]).join(' and ');
}

export function moveTitle(move: QueuedMove): string {
  return `Move ${formatMinorExact(move.amountMinor, move.currency)}/day from ${platformList(move.from)} to ${platformList(move.to)}`;
}

type Phase = 'checking' | 'checked' | 'applying' | 'done';

// The card control's verdict styling, kept in step with PlatformCardActionControl.
const TONE_CLASS: Record<CardActionVerdict['tone'], string> = {
  ok: 'border-success/40 bg-success/10 text-success',
  refused: 'border-warning/40 bg-warning/10 text-warning',
  failed: 'border-destructive/40 bg-destructive/10 text-destructive',
};

const UNREACHABLE: CardActionVerdict = {
  tone: 'failed',
  text: 'We could not reach the optimizer. Nothing was written.',
};

/** previewVerdict speaks for one Google write; a move's dry run checked every leg. */
function movePreviewVerdict(
  response: ApplyActionsResponse | null,
  currency: string,
): CardActionVerdict {
  if (response?.results[0]?.status === 'would_apply') {
    return {
      tone: 'ok',
      text: 'Every leg checked out against its platform and would go through. Nothing changes until you confirm.',
    };
  }
  return previewVerdict(response, currency);
}

function Pending({ children }: { children: string }) {
  return (
    <p className="flex items-center gap-2 text-muted-foreground text-sm" role="status">
      <Loader2Icon className="size-4 animate-spin motion-reduce:animate-none" />
      {children}
    </p>
  );
}

function Verdict({ verdict, testId }: { verdict: CardActionVerdict; testId: string }) {
  return (
    <p
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2 text-xs',
        TONE_CLASS[verdict.tone],
      )}
      data-testid={testId}
      data-tone={verdict.tone}
    >
      {verdict.tone === 'ok' ? null : <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />}
      <span>{verdict.text}</span>
    </p>
  );
}

function ApproveMove({
  portfolioId,
  recommendationId,
  move,
  disabled,
  onApplied,
}: {
  portfolioId: string;
  recommendationId: string;
  move: QueuedMove;
  disabled: boolean;
  /** The move landed: the queue records the person's decision, so it is not offered again. */
  onApplied?: () => void;
}) {
  const apply = useApplyOptimizerActions();
  const [open, setOpenState] = useState(false);
  const [phase, setPhase] = useState<Phase>('checking');
  const [preview, setPreview] = useState<CardActionVerdict | null>(null);
  const [canConfirm, setCanConfirm] = useState(false);
  const [result, setResult] = useState<CardActionVerdict | null>(null);

  const send = (dryRun: boolean): Promise<ApplyActionsResponse | null> =>
    apply.mutateAsync({
      portfolio_id: portfolioId,
      actions: [move.action],
      dryRun,
      recommendation_id: recommendationId,
    });

  const check = async () => {
    setPhase('checking');
    setPreview(null);
    setResult(null);
    setCanConfirm(false);
    try {
      const response = await send(true);
      setPreview(movePreviewVerdict(response, move.currency));
      setCanConfirm(response?.results[0]?.status === 'would_apply');
    } catch {
      setPreview(UNREACHABLE);
    }
    setPhase('checked');
  };

  const confirm = async () => {
    setPhase('applying');
    try {
      const response = await send(false);
      setResult(resultVerdict(response, move.currency));
      if (response?.results[0]?.status === 'applied') onApplied?.();
    } catch {
      setResult(UNREACHABLE);
    }
    setPhase('done');
  };

  const setOpen = (next: boolean) => {
    setOpenState(next);
    if (next) void check();
  };

  return (
    <>
      <Button
        data-testid="budget-move-action"
        disabled={disabled}
        onClick={() => setOpen(true)}
        size="sm"
        type="button"
      >
        Approve the move
      </Button>
      <AlertDialog onOpenChange={setOpen} open={open}>
        <AlertDialogContent data-testid="budget-move-action-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{moveTitle(move)}</AlertDialogTitle>
            <AlertDialogDescription>
              We ask the platforms to check every leg first. Nothing is written until you confirm,
              and then the decreases are written before the increases.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {phase === 'checking' ? <Pending>Asking the platforms to check it…</Pending> : null}
          {preview && phase !== 'done' ? (
            <Verdict testId="budget-move-action-preview" verdict={preview} />
          ) : null}
          {phase === 'applying' ? <Pending>Applying…</Pending> : null}
          {result ? <Verdict testId="budget-move-action-result" verdict={result} /> : null}
          <AlertDialogFooter>
            <AlertDialogCancel>{phase === 'done' ? 'Close' : 'Cancel'}</AlertDialogCancel>
            {phase === 'done' ? null : (
              <Button
                data-testid="budget-move-action-confirm"
                disabled={!canConfirm || phase !== 'checked'}
                onClick={() => void confirm()}
                size="sm"
                type="button"
              >
                Confirm
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export type BudgetMoveQueueRowProps = {
  rec: RecommendationRow;
  move: QueuedMove;
  portfolioId: string;
  /** A dismissal of this row is in flight. */
  busy: boolean;
  /** Observe mode: nothing may be approved. */
  writesBlocked: boolean;
  /** Why this move cannot be approved here (a platform among its legs has writes off), or
   *  null when it can (queuedMoveModel.moveWritesOffNote). */
  writesOffNote: string | null;
  /** Absent until the optimizer can write the decrease legs alone. */
  onApproveDecreaseOnly?: () => void;
  onDismiss: () => void;
  /** The approved move landed (both legs): record the decision so it leaves the queue. */
  onApplied?: () => void;
};

export function BudgetMoveQueueRow({
  rec,
  move,
  portfolioId,
  busy,
  writesBlocked,
  writesOffNote,
  onApproveDecreaseOnly,
  onDismiss,
  onApplied,
}: BudgetMoveQueueRowProps) {
  const approved = rec.status === 'approved';
  const decreases = move.legs.filter((leg) => leg.direction === 'decrease');
  const increases = move.legs.filter((leg) => leg.direction === 'increase');
  const disabled = busy || writesBlocked;
  return (
    <li className="space-y-2.5 py-3" data-testid="budget-move-row" data-row-key={`rec:${rec.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1">
          {move.from.map((platform) => (
            <PlatformChip key={`from-${platform}`} platform={platform} />
          ))}
          <ArrowRightIcon aria-hidden="true" className="size-3 text-muted-foreground" />
          {move.to.map((platform) => (
            <PlatformChip key={`to-${platform}`} platform={platform} />
          ))}
        </span>
        <KindTag tone="budget">Move budget between platforms</KindTag>
      </div>
      <div className="space-y-1">
        <p className="font-semibold text-sm leading-snug">{moveTitle(move)}</p>
        {rec.reason ? <p className="text-muted-foreground text-xs">Why: {rec.reason}</p> : null}
        <p className="text-muted-foreground text-xs" data-testid="budget-move-sides">
          Every {platformList(move.from)} entity here goes down {formatSidePct(move.decreasePct)} (
          {decreases.length}); every {platformList(move.to)} entity goes up{' '}
          {formatSidePct(move.increasePct)} ({increases.length}). Decreases run first.
        </p>
      </div>
      <ol className="divide-y divide-border/40">
        {move.legs.map((leg) => (
          <MoveLegLine
            afterMinor={leg.afterMinor}
            beforeMinor={leg.beforeMinor}
            currency={move.currency}
            direction={leg.direction}
            entityId={leg.entityId}
            entityName={leg.entityName}
            key={`${leg.index}:${leg.entityId}`}
            pct={leg.pct}
            platform={leg.platform}
            testId="budget-move-leg"
          />
        ))}
      </ol>
      <p className="text-muted-foreground text-xs">{MOVE_APPROVAL_RECOMMENDATION}</p>
      {approved ? (
        <p className="text-sm" data-testid="budget-move-approved" role="status">
          Approved. The optimizer writes the decreases first, then the increases.
        </p>
      ) : (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {writesOffNote ? null : (
              <>
                <ApproveMove
                  disabled={disabled}
                  move={move}
                  onApplied={onApplied}
                  portfolioId={portfolioId}
                  recommendationId={rec.id}
                />
                <Button
                  disabled={disabled || !onApproveDecreaseOnly}
                  onClick={onApproveDecreaseOnly}
                  size="sm"
                  variant="outline"
                >
                  Approve the decrease only
                </Button>
              </>
            )}
            <Button disabled={disabled} onClick={onDismiss} size="sm" variant="ghost">
              {busy ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
              Dismiss
            </Button>
          </div>
          {writesOffNote ? (
            <p className="text-muted-foreground text-xs" data-testid="budget-move-writes-off">
              {writesOffNote}
            </p>
          ) : onApproveDecreaseOnly ? null : (
            <p className="text-muted-foreground text-xs" data-testid="decrease-only-unavailable">
              Approving only the decrease is not available yet: the optimizer writes whole moves.
            </p>
          )}
        </div>
      )}
    </li>
  );
}

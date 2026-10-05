'use client';

// A cross-platform budget move in the Actions queue: ONE row for the whole move (decision 17),
// every leg under it, decreases first, and the same percentage on each side. One approval
// writes every leg; the decrease runs first so a failure between legs leaves the client
// spending less, never more. A person approves these even when autopilot could (decision 18).

import type { RecommendationRow } from '@continuum/contracts';
import { ArrowRightIcon, Loader2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as typeScale from '../../typeScale';
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

export type BudgetMoveQueueRowProps = {
  rec: RecommendationRow;
  move: QueuedMove;
  /** A decision on this row is in flight. */
  busy: boolean;
  /** Observe mode: nothing may be approved. */
  writesBlocked: boolean;
  onApproveMove: () => void;
  /** Absent until the optimizer can write the decrease legs alone. */
  onApproveDecreaseOnly?: () => void;
  onDismiss: () => void;
};

export function BudgetMoveQueueRow({
  rec,
  move,
  busy,
  writesBlocked,
  onApproveMove,
  onApproveDecreaseOnly,
  onDismiss,
}: BudgetMoveQueueRowProps) {
  const approved = rec.status === 'approved';
  const decreases = move.legs.filter((leg) => leg.direction === 'decrease');
  const increases = move.legs.filter((leg) => leg.direction === 'increase');
  const disabled = busy || writesBlocked;
  return (
    <li
      className="space-y-3 rounded-lg border border-border/70 bg-card px-4 py-3"
      data-testid="budget-move-row"
      data-row-key={`rec:${rec.id}`}
    >
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
        <span
          className={`${typeScale.label} rounded-md border border-border/70 bg-muted/40 px-1.5 py-0.5 font-semibold text-muted-foreground`}
        >
          Move budget between platforms
        </span>
      </div>
      <div className="space-y-1">
        <p className="font-semibold text-base leading-snug">{moveTitle(move)}</p>
        {rec.reason ? <p className="text-muted-foreground text-sm">{rec.reason}</p> : null}
        <p className="text-muted-foreground text-xs" data-testid="budget-move-sides">
          Every {platformList(move.from)} entity here goes down {formatSidePct(move.decreasePct)} (
          {decreases.length}); every {platformList(move.to)} entity goes up{' '}
          {formatSidePct(move.increasePct)} ({increases.length}). Decreases run first.
        </p>
      </div>
      <ol className="space-y-1.5">
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
            <Button disabled={disabled} onClick={onApproveMove} size="sm">
              {busy ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
              Approve the move
            </Button>
            <Button
              disabled={disabled || !onApproveDecreaseOnly}
              onClick={onApproveDecreaseOnly}
              size="sm"
              variant="outline"
            >
              Approve the decrease only
            </Button>
            <Button disabled={disabled} onClick={onDismiss} size="sm" variant="ghost">
              Dismiss
            </Button>
          </div>
          {onApproveDecreaseOnly ? null : (
            <p className="text-muted-foreground text-xs" data-testid="decrease-only-unavailable">
              Approving only the decrease is not available yet: the optimizer writes whole moves.
            </p>
          )}
        </div>
      )}
    </li>
  );
}

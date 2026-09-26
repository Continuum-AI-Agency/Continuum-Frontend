'use client';

// Pause / Unpause one campaign, ad set or ad — through Jaina's approval gate and nothing else.
//
// The sheet opens on a review step: the entity, the status change and a reason. Only "Request
// approval" asks Jaina to open the gate (`useJainaOperatorAction`, mounted per request so every
// action starts clean). The approval card is the ordinary Jaina card with its before → after
// preview; Meta is written only after a person approves it, and the row then shows what Meta
// READ BACK, not what was asked for.

import type { JainaOperatorAction } from '@continuum/contracts';
import { ArrowRight, CircleCheck, CircleSlash, TriangleAlert } from 'lucide-react';
import * as React from 'react';
import { JainaToolApprovalCard } from '@/components/paid-media/jaina/components/JainaToolApprovalCard';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useJainaOperatorAction } from '@/hooks/useJainaOperatorAction';
import {
  buildEntityStatusAction,
  DEFAULT_PAUSE_REASON,
  DEFAULT_UNPAUSE_REASON,
  describeEntityStatusAction,
  type EntityLevel,
  type EntityStatusOutcome,
  levelNoun,
  readEntityStatusOutcome,
  type ScaleEntityRow,
  type ScaleScope,
} from './campaignsClient';
import { EntityStatusPill, humanizeStatus } from './EntityStatusPill';

export type EntityStatusTarget = {
  /** Unique per click, so each action mounts a fresh flow. */
  key: string;
  row: ScaleEntityRow;
  level: EntityLevel;
  parentId: string | null;
};

export type EntityStatusSettlement = EntityStatusOutcome | { kind: 'denied' };

type SheetProps = {
  target: EntityStatusTarget | null;
  scope: ScaleScope;
  ensureSession: () => Promise<string>;
  onClose: () => void;
  onSettled: (target: EntityStatusTarget, settlement: EntityStatusSettlement) => void;
};

export function EntityStatusSheet({
  target,
  scope,
  ensureSession,
  onClose,
  onSettled,
}: SheetProps) {
  // Keeps the content on screen while the sheet animates closed.
  const lastTarget = React.useRef(target);
  if (target) lastTarget.current = target;
  const shown = target ?? lastTarget.current;

  return (
    <Sheet open={target !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <SheetContent
        side="right"
        data-testid="scale-status-sheet"
        className="w-full gap-0 sm:max-w-md"
      >
        {shown ? (
          <EntityStatusFlow
            key={shown.key}
            target={shown}
            scope={scope}
            ensureSession={ensureSession}
            onClose={onClose}
            onSettled={onSettled}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

type Request = { nonce: number; sessionId: string; action: JainaOperatorAction };

function EntityStatusFlow({
  target,
  scope,
  ensureSession,
  onClose,
  onSettled,
}: Omit<SheetProps, 'target'> & { target: EntityStatusTarget }) {
  const { row, level } = target;
  const noun = levelNoun(level);
  const isPause = row.status === 'ACTIVE';
  const nextStatus = isPause ? 'PAUSED' : 'ACTIVE';
  const [reason, setReason] = React.useState(
    isPause ? DEFAULT_PAUSE_REASON : DEFAULT_UNPAUSE_REASON,
  );
  const [request, setRequest] = React.useState<Request | null>(null);
  const [opening, setOpening] = React.useState(false);
  const [sessionError, setSessionError] = React.useState<string | null>(null);
  const [settled, setSettled] = React.useState(false);

  const requestApproval = async () => {
    const action = buildEntityStatusAction(row, level, reason);
    if (!action) return;
    setOpening(true);
    setSessionError(null);
    try {
      const sessionId = await ensureSession();
      setRequest((previous) => ({ nonce: (previous?.nonce ?? 0) + 1, sessionId, action }));
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : 'Could not reach Jaina.');
    } finally {
      setOpening(false);
    }
  };

  const handleSettled = React.useCallback(
    (settlement: EntityStatusSettlement) => {
      setSettled(true);
      onSettled(target, settlement);
    },
    [onSettled, target],
  );

  return (
    <>
      <SheetHeader className="gap-1 border-border/70 border-b px-5 pt-5 pr-12 pb-4">
        <SheetTitle>
          {isPause ? 'Pause' : 'Unpause'} {noun}
        </SheetTitle>
        <SheetDescription>
          Jaina opens an approval for this change. Nothing changes in Meta until you approve it.
        </SheetDescription>
      </SheetHeader>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2.5 text-sm">
          <dt className="text-muted-foreground capitalize">{noun}</dt>
          <dd className="font-medium break-words">{row.name}</dd>
          <dt className="text-muted-foreground">ID</dt>
          <dd className="font-mono text-muted-foreground text-xs">{row.id}</dd>
          <dt className="text-muted-foreground">Status</dt>
          <dd className="flex items-center gap-2">
            <EntityStatusPill status={row.status} />
            <ArrowRight aria-label="to" className="size-3.5 text-muted-foreground" />
            <EntityStatusPill status={nextStatus} />
          </dd>
        </dl>

        {!isPause ? (
          <p className="text-muted-foreground text-sm">
            Unpausing lets this {noun} deliver and spend against its budget again.
          </p>
        ) : null}

        {request ? (
          <OperatorRun
            key={request.nonce}
            scope={scope}
            request={request}
            displayText={describeEntityStatusAction(request.action, row, level)}
            nextStatus={nextStatus}
            noun={noun}
            onSettled={handleSettled}
            onRetry={requestApproval}
          />
        ) : (
          <div className="space-y-2">
            <Label htmlFor="scale-status-reason">Reason</Label>
            <Textarea
              id="scale-status-reason"
              value={reason}
              maxLength={500}
              rows={2}
              onChange={(event) => setReason(event.target.value)}
              disabled={opening}
            />
            <p className="text-muted-foreground text-xs">Recorded with the change.</p>
            {opening ? <PreparingCard /> : null}
            {sessionError ? (
              <p role="alert" className="text-destructive text-sm">
                {sessionError}
              </p>
            ) : null}
          </div>
        )}
      </div>

      <SheetFooter className="flex-row justify-end gap-2 border-border/70 border-t px-5 py-3">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          {settled ? 'Done' : 'Close'}
        </Button>
        {request ? null : (
          <Button
            type="button"
            variant="cta"
            size="sm"
            onClick={() => void requestApproval()}
            disabled={opening}
          >
            {opening ? <Spinner className="size-3.5" /> : null}
            {sessionError ? 'Try again' : 'Request approval'}
          </Button>
        )}
      </SheetFooter>
    </>
  );
}

function OperatorRun({
  scope,
  request,
  displayText,
  nextStatus,
  noun,
  onSettled,
  onRetry,
}: {
  scope: ScaleScope;
  request: Request;
  displayText: string;
  nextStatus: string;
  noun: string;
  onSettled: (settlement: EntityStatusSettlement) => void;
  onRetry: () => void;
}) {
  const { state, isStreaming, run, decide } = useJainaOperatorAction({
    brandId: scope.brandId,
    adAccountId: scope.adAccountId,
    sessionId: request.sessionId,
  });

  // Sent from a scheduled callback, not the effect body, and marked started only when it fires.
  // `useChat` stops its request in its own unmount cleanup, so under StrictMode's mount → unmount
  // → mount a send made in the first effect is aborted before the POST leaves — and a flag set
  // there then refuses the retry. Clearing the timer in cleanup makes the send happen exactly once.
  const started = React.useRef(false);
  React.useEffect(() => {
    if (started.current) return;
    const timer = setTimeout(() => {
      started.current = true;
      run({ ...request.action, displayText });
    }, 0);
    return () => clearTimeout(timer);
  }, [displayText, request.action, run]);

  const denied = state.resolution?.decision === 'denied';
  const outcome = state.result && !isStreaming ? readEntityStatusOutcome(state.result) : null;

  const reported = React.useRef(false);
  React.useEffect(() => {
    if (reported.current) return;
    if (denied) {
      reported.current = true;
      onSettled({ kind: 'denied' });
    } else if (outcome) {
      reported.current = true;
      onSettled(outcome);
    }
  }, [denied, onSettled, outcome]);

  if (state.phase === 'failed') {
    return (
      <div role="alert" className="space-y-3 rounded-lg border border-destructive/30 p-4">
        <p className="flex items-start gap-2 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          {state.error ?? 'Jaina could not open this approval.'}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  if (!state.approval) return <PreparingCard />;

  return (
    <div className="space-y-3">
      <JainaToolApprovalCard
        approval={state.approval}
        optimisticDecision={state.decision}
        isStreaming={isStreaming}
        onDecide={(_approval, decision) => decide(decision)}
      />
      {denied ? (
        <OutcomeLine testId="scale-status-denied" icon="neutral">
          Nothing changed. The {noun} is still {nextStatus === 'PAUSED' ? 'active' : 'paused'}.
        </OutcomeLine>
      ) : null}
      {state.decision === 'approve' && !outcome ? (
        <p role="status" className="flex items-center gap-2 text-muted-foreground text-sm">
          <Spinner className="size-3.5" />
          Applying the change in Meta…
        </p>
      ) : null}
      {outcome ? <OutcomeReport outcome={outcome} nextStatus={nextStatus} noun={noun} /> : null}
    </div>
  );
}

function OutcomeReport({
  outcome,
  nextStatus,
  noun,
}: {
  outcome: EntityStatusOutcome;
  nextStatus: string;
  noun: string;
}) {
  if (outcome.kind === 'read_back') {
    const { status, effective_status: effective } = outcome.readBack;
    const applied = status.toUpperCase() === nextStatus;
    return (
      <OutcomeLine testId="scale-status-readback" icon={applied ? 'success' : 'warning'}>
        Meta now reports this {noun} as{' '}
        <span className="font-medium">{humanizeStatus(status.toUpperCase())}</span>
        {effective && effective.toUpperCase() !== status.toUpperCase()
          ? ` (delivery: ${humanizeStatus(effective.toUpperCase()).toLowerCase()})`
          : ''}
        .{applied ? '' : ' The change may not have applied.'}
      </OutcomeLine>
    );
  }
  if (outcome.kind === 'refused') {
    return (
      <OutcomeLine testId="scale-status-refused" icon="warning">
        {outcome.code === 'status_drifted'
          ? `This ${noun} changed in Meta since the table was read, so nothing was written. The row has been refreshed. `
          : null}
        {outcome.message}
      </OutcomeLine>
    );
  }
  return (
    <OutcomeLine testId="scale-status-unreported" icon="warning">
      Jaina ran the change but did not report Meta's status. The row has been refreshed from Meta.
    </OutcomeLine>
  );
}

const OUTCOME_ICON = {
  success: <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />,
  warning: <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />,
  neutral: <CircleSlash className="mt-0.5 size-4 shrink-0 text-muted-foreground" />,
};

function OutcomeLine({
  testId,
  icon,
  children,
}: {
  testId: string;
  icon: keyof typeof OUTCOME_ICON;
  children: React.ReactNode;
}) {
  return (
    <p
      role="status"
      data-testid={testId}
      className="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5 text-sm"
    >
      {OUTCOME_ICON[icon]}
      <span>{children}</span>
    </p>
  );
}

function PreparingCard() {
  return (
    <div role="status" className="space-y-3 rounded-lg border border-border/70 p-4">
      <p className="flex items-center gap-2 text-muted-foreground text-sm">
        <Spinner className="size-3.5" />
        Jaina is preparing the approval…
      </p>
      <div className="h-4 w-2/3 rounded-md bg-muted/70 motion-safe:animate-pulse" />
      <div className="h-14 rounded-md bg-muted/70 motion-safe:animate-pulse" />
      <div className="flex gap-2">
        <div className="h-7 w-20 rounded-md bg-muted/70 motion-safe:animate-pulse" />
        <div className="h-7 w-16 rounded-md bg-muted/70 motion-safe:animate-pulse" />
      </div>
    </div>
  );
}

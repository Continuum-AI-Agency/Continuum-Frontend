'use client';

// The button a platform card hands a person, and the approval it opens (frontend.html §7,
// feature 09). Opening it asks the platform first — a dry run through /apply/actions, Google's
// validate_only — so the person reads Google's verdict before anything is written; confirming
// sends the same action for real. A TikTok write shows the button disabled and says why: the
// service has no TikTok connection to write through.
//
// A live write that lands can be undone the same way (optimizer-apply-action-revert): the dialog
// switches to the undo, asks Google to check it first, and writes the recorded before back only
// on confirm. The Undo stays on the card after the dialog closes.

import type { ActionRevertResponse } from '@continuum/contracts';
import { Loader2Icon, TriangleAlertIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
import {
  type ApplyActionsResponse,
  useApplyOptimizerActions,
  useRevertOptimizerAction,
} from '../../useOptimizerData';
import {
  type CardActionVerdict,
  type CardWrite,
  cardActionChange,
  cardActionLabel,
  cardActionTitle,
  previewVerdict,
  resultVerdict,
  TIKTOK_NOT_CONNECTED_NOTE,
  undoAuditIdOf,
  undoPreviewVerdict,
  undoRestoresText,
  undoResultVerdict,
} from './platformCardActionModel';

type Phase = 'checking' | 'checked' | 'applying' | 'done';
type Mode = 'apply' | 'undo';

type UndoState = {
  phase: Phase;
  preview: CardActionVerdict | null;
  canConfirm: boolean;
  result: CardActionVerdict | null;
  restores: string | null;
};

const UNDO_START: UndoState = {
  phase: 'checking',
  preview: null,
  canConfirm: false,
  result: null,
  restores: null,
};

const TONE_CLASS: Record<CardActionVerdict['tone'], string> = {
  ok: 'border-success/40 bg-success/10 text-success',
  refused: 'border-warning/40 bg-warning/10 text-warning',
  failed: 'border-destructive/40 bg-destructive/10 text-destructive',
};

const UNREACHABLE: CardActionVerdict = {
  tone: 'failed',
  text: 'We could not reach the optimizer. Nothing was written.',
};

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

export function TikTokNotConnected({ write }: { write: CardWrite }) {
  return (
    <div className="space-y-1" data-testid="platform-card-action-unavailable">
      <Button disabled size="sm" type="button" variant="secondary">
        {cardActionLabel(write)}
      </Button>
      <p className="text-muted-foreground text-xs">{TIKTOK_NOT_CONNECTED_NOTE}</p>
    </div>
  );
}

export type PlatformCardActionControlProps = {
  portfolioId: string;
  write: CardWrite;
  recommendationId?: string | null;
  /** The card's currency, for a target CPA (the action carries micros, not a currency). */
  currency: string | null;
  /** Open on mount, for a card that chooses what to apply before the approval (chosen
   *  negatives); the control then shows no button of its own. */
  startOpen?: boolean;
  /** Called when the dialog closes. */
  onClose?: () => void;
};

export function PlatformCardActionControl({
  portfolioId,
  write,
  recommendationId,
  currency,
  startOpen = false,
  onClose,
}: PlatformCardActionControlProps) {
  const apply = useApplyOptimizerActions();
  const revert = useRevertOptimizerAction();
  const [mode, setMode] = useState<Mode>('apply');
  const [undoAuditId, setUndoAuditId] = useState<string | null>(null);
  const [undo, setUndo] = useState<UndoState>(UNDO_START);
  const [open, setOpenState] = useState(startOpen);
  const [phase, setPhase] = useState<Phase>('checking');
  const [preview, setPreview] = useState<CardActionVerdict | null>(null);
  const [canConfirm, setCanConfirm] = useState(false);
  const [result, setResult] = useState<CardActionVerdict | null>(null);

  const send = (dryRun: boolean): Promise<ApplyActionsResponse | null> =>
    apply.mutateAsync({
      portfolio_id: portfolioId,
      actions: [write],
      dryRun,
      ...(recommendationId ? { recommendation_id: recommendationId } : {}),
    });

  const check = async () => {
    setMode('apply');
    setPhase('checking');
    setPreview(null);
    setResult(null);
    setCanConfirm(false);
    try {
      const response = await send(true);
      setPreview(previewVerdict(response, currency));
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
      setResult(resultVerdict(response, currency));
      setUndoAuditId(undoAuditIdOf(response));
    } catch {
      setResult(UNREACHABLE);
    }
    setPhase('done');
  };

  const sendUndo = (auditId: string, dryRun: boolean): Promise<ActionRevertResponse | null> =>
    revert.mutateAsync({ portfolio_id: portfolioId, audit_id: auditId, dryRun });

  const checkUndo = async () => {
    if (undoAuditId == null) return;
    setMode('undo');
    setUndo(UNDO_START);
    try {
      const response = await sendUndo(undoAuditId, true);
      setUndo({
        ...UNDO_START,
        phase: 'checked',
        preview: undoPreviewVerdict(response),
        canConfirm: response?.result.status === 'would_revert',
        restores: response
          ? undoRestoresText(response.result.restores, response.result.kind, currency)
          : null,
      });
    } catch {
      setUndo({ ...UNDO_START, phase: 'checked', preview: UNREACHABLE });
    }
  };

  const confirmUndo = async () => {
    if (undoAuditId == null) return;
    setUndo((state) => ({ ...state, phase: 'applying' }));
    let verdict: CardActionVerdict;
    try {
      const response = await sendUndo(undoAuditId, false);
      verdict = undoResultVerdict(response);
      if (response?.result.status === 'reverted') setUndoAuditId(null);
    } catch {
      verdict = UNREACHABLE;
    }
    setUndo((state) => ({ ...state, phase: 'done', result: verdict }));
  };

  const openUndo = () => {
    setOpenState(true);
    void checkUndo();
  };

  const setOpen = (next: boolean) => {
    setOpenState(next);
    if (next) void check();
    else onClose?.();
  };

  // A dialog that opens on mount never passes through setOpen, so it asks the platform here.
  const checkedOnMount = useRef(false);
  useEffect(() => {
    if (!startOpen || checkedOnMount.current) return;
    checkedOnMount.current = true;
    void check();
  });

  const change = cardActionChange(write, currency);
  const undoing = mode === 'undo';

  return (
    <>
      <AlertDialog onOpenChange={setOpen} open={open}>
        {startOpen ? null : (
          <AlertDialogTrigger
            render={
              <Button
                data-testid="platform-card-action"
                size="sm"
                type="button"
                variant="secondary"
              />
            }
          >
            {cardActionLabel(write)}
          </AlertDialogTrigger>
        )}
        <AlertDialogContent data-testid="platform-card-action-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {undoing ? `Undo: ${cardActionTitle(write)}` : cardActionTitle(write)}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {undoing
                ? 'We ask Google to check the undo first. Nothing is written until you confirm.'
                : 'We ask the platform to check it first. Nothing is written until you confirm.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {undoing ? (
            <UndoBody state={undo} />
          ) : (
            <>
              {change ? (
                <p
                  className="text-foreground text-sm tabular-nums"
                  data-testid="platform-card-action-change"
                >
                  {change}
                </p>
              ) : null}
              {phase === 'checking' ? <Pending>Asking the platform to check it…</Pending> : null}
              {preview && phase !== 'done' ? (
                <Verdict testId="platform-card-action-preview" verdict={preview} />
              ) : null}
              {phase === 'applying' ? <Pending>Applying…</Pending> : null}
              {result ? <Verdict testId="platform-card-action-result" verdict={result} /> : null}
            </>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>
              {(undoing ? undo.phase : phase) === 'done' ? 'Close' : 'Cancel'}
            </AlertDialogCancel>
            {undoing ? (
              undo.phase === 'done' ? null : (
                <Button
                  data-testid="platform-card-undo-confirm"
                  disabled={!undo.canConfirm || undo.phase !== 'checked'}
                  onClick={() => void confirmUndo()}
                  size="sm"
                  type="button"
                >
                  Confirm undo
                </Button>
              )
            ) : phase === 'done' ? (
              undoAuditId ? (
                <Button
                  data-testid="platform-card-action-undo"
                  onClick={() => void checkUndo()}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  Undo
                </Button>
              ) : null
            ) : (
              <Button
                data-testid="platform-card-action-confirm"
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
      {undoAuditId && !open ? (
        <Button
          data-testid="platform-card-undo"
          onClick={openUndo}
          size="sm"
          type="button"
          variant="outline"
        >
          Undo
        </Button>
      ) : null}
    </>
  );
}

function UndoBody({ state }: { state: UndoState }) {
  return (
    <>
      {state.restores ? (
        <p
          className="text-foreground text-sm tabular-nums"
          data-testid="platform-card-undo-restores"
        >
          {state.restores}
        </p>
      ) : null}
      {state.phase === 'checking' ? <Pending>Asking Google to check the undo…</Pending> : null}
      {state.preview && state.phase !== 'done' ? (
        <Verdict testId="platform-card-undo-preview" verdict={state.preview} />
      ) : null}
      {state.phase === 'applying' ? <Pending>Undoing…</Pending> : null}
      {state.result ? <Verdict testId="platform-card-undo-result" verdict={state.result} /> : null}
    </>
  );
}

'use client';

// The button a platform card hands a person, and the approval it opens (frontend.html §7,
// feature 09). Opening it asks the platform first — a dry run through /apply/actions, Google's
// validate_only — so the person reads Google's verdict before anything is written; confirming
// sends the same action for real. A TikTok write shows the button disabled and says why: the
// service has no TikTok connection to write through.

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
import { type ApplyActionsResponse, useApplyOptimizerActions } from '../../useOptimizerData';
import {
  type CardActionVerdict,
  type CardWrite,
  cardActionChange,
  cardActionLabel,
  cardActionTitle,
  previewVerdict,
  resultVerdict,
  TIKTOK_NOT_CONNECTED_NOTE,
} from './platformCardActionModel';

type Phase = 'checking' | 'checked' | 'applying' | 'done';

const TONE_CLASS: Record<CardActionVerdict['tone'], string> = {
  ok: 'border-success/40 bg-success/10 text-success',
  refused: 'border-warning/40 bg-warning/10 text-warning',
  failed: 'border-destructive/40 bg-destructive/10 text-destructive',
};

const UNREACHABLE: CardActionVerdict = {
  tone: 'failed',
  text: 'We could not reach the optimizer. Nothing was written.',
};

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
      setResult(resultVerdict(await send(false), currency));
    } catch {
      setResult(UNREACHABLE);
    }
    setPhase('done');
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

  return (
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
          <AlertDialogTitle>{cardActionTitle(write)}</AlertDialogTitle>
          <AlertDialogDescription>
            We ask the platform to check it first. Nothing is written until you confirm.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {change ? (
          <p
            className="text-foreground text-sm tabular-nums"
            data-testid="platform-card-action-change"
          >
            {change}
          </p>
        ) : null}
        {phase === 'checking' ? (
          <p className="flex items-center gap-2 text-muted-foreground text-sm" role="status">
            <Loader2Icon className="size-4 animate-spin motion-reduce:animate-none" />
            Asking the platform to check it…
          </p>
        ) : null}
        {preview && phase !== 'done' ? (
          <Verdict testId="platform-card-action-preview" verdict={preview} />
        ) : null}
        {phase === 'applying' ? (
          <p className="flex items-center gap-2 text-muted-foreground text-sm" role="status">
            <Loader2Icon className="size-4 animate-spin motion-reduce:animate-none" />
            Applying…
          </p>
        ) : null}
        {result ? <Verdict testId="platform-card-action-result" verdict={result} /> : null}
        <AlertDialogFooter>
          <AlertDialogCancel>{phase === 'done' ? 'Close' : 'Cancel'}</AlertDialogCancel>
          {phase === 'done' ? null : (
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
  );
}

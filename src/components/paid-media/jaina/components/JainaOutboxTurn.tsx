'use client';

import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Button } from '@/components/ui/button';

type JainaOutboxTurnProps = {
  text: string;
  status: 'sending' | 'failed';
  /** Why the send failed, as a clause ending in a period ("no connection to the server."). */
  reason?: string;
  /** False while a run or a load holds the conversation; Retry waits for it. */
  canRetry: boolean;
  onRetry: () => void;
  onDiscard: () => void;
};

/**
 * A question that left the composer but is not in the transcript yet. It shows as sending while
 * its conversation is set up, and when that fails it stays, in the reader's words, as not sent —
 * with why and a Retry — instead of vanishing and leaving the starter grid as if nothing had
 * been clicked (PP-DT-C-jaina-send-failure-is-silent).
 */
export function JainaOutboxTurn({
  text,
  status,
  reason,
  canRetry,
  onRetry,
  onDiscard,
}: JainaOutboxTurnProps) {
  const failed = status === 'failed';
  return (
    <div
      role={failed ? 'alert' : 'status'}
      data-testid="jaina-outbox-turn"
      className="mx-auto flex w-full max-w-3xl flex-col items-end gap-1.5 px-1 py-2"
    >
      <Bubble variant="tinted" align="end">
        <BubbleContent>
          <span className="text-sm font-medium whitespace-pre-wrap">{text}</span>
        </BubbleContent>
      </Bubble>
      {failed ? (
        <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-xs">
          <span className="text-destructive-ink">Not sent — {reason}</span>
          <Button
            type="button"
            size="xs"
            variant="secondary"
            disabled={!canRetry}
            onClick={onRetry}
          >
            Retry
          </Button>
          <Button type="button" size="xs" variant="ghost" onClick={onDiscard}>
            Discard
          </Button>
        </div>
      ) : (
        <span className="text-muted-foreground text-xs">Sending…</span>
      )}
    </div>
  );
}

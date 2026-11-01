'use client';

import { Button } from '@/components/ui/button';

type JainaUnansweredNoticeProps = {
  onAskAgain: () => void;
};

/**
 * The transcript ends with the reader's question and no run is answering it: the run that should
 * have was killed or crashed before it stored anything. Said as such, with a way to ask again,
 * instead of a bubble over a blank transcript (PP-DT-C-jaina-unanswered-run-blank-transcript).
 */
export function JainaUnansweredNotice({ onAskAgain }: JainaUnansweredNoticeProps) {
  return (
    <div
      role="status"
      data-testid="jaina-unanswered"
      className="mx-auto my-3 flex w-full max-w-3xl flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border/70 bg-card/70 px-4 py-3 text-sm"
    >
      <span className="text-foreground">
        This question has no answer — the run that should have answered it did not finish.
      </span>
      <Button type="button" size="xs" variant="secondary" onClick={onAskAgain}>
        Ask again
      </Button>
    </div>
  );
}

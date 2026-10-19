'use client';

import type { HeadlessBatchQuote } from '@continuum/contracts';
import { Check, TriangleAlert, X } from 'lucide-react';
import { useId } from 'react';
import { AgentButton, AgentDecisionCard } from '@/components/shared/agent-cards/agentCardKit';
import { CardContent, CardFooter } from '@/components/ui/card';

const usd = (value: number) => `$${value.toFixed(2)}`;
const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

// The FE's own words, never the Backend's refusal text (it names request fields).
function refusalWords(quote: HeadlessBatchQuote): string {
  if (quote.boundUsd > quote.maxUsd) {
    return `Worst case ${usd(quote.boundUsd)} is over this batch's ${usd(quote.maxUsd)} ceiling. Nothing was spent.`;
  }
  if (quote.windowRemainingUsd !== null && quote.boundUsd > quote.windowRemainingUsd) {
    return `Only ${usd(quote.windowRemainingUsd)} is left in the brand's 24 h window. Nothing was spent.`;
  }
  return "This batch can't be approved as asked. Nothing was spent.";
}

/**
 * The one approval a headless batch asks for, read from the Backend's quote: what it makes, the
 * worst it can cost, and the cast step a cast-less brand goes through once. No ids: the slots and
 * blocks it names are the agent's, the money is the user's. Without a readable quote it fails
 * closed: money nobody was shown is never approved, so only Deny is offered.
 */
export function HeadlessBatchApprovalCard({
  quote,
  onApproveAction,
  onDenyAction,
  disabled,
}: {
  quote: HeadlessBatchQuote | null;
  onApproveAction: () => void;
  onDenyAction: () => void;
  disabled?: boolean;
}) {
  const titleId = useId();
  const batchWords = quote
    ? ` batch of ${quote.items} ${plural(quote.items, 'piece', 'pieces')}`
    : ' batch';
  return (
    <AgentDecisionCard
      data-slot="headless-batch-approval"
      data-quote={quote ? 'readable' : 'unreadable'}
      role="group"
      aria-labelledby={titleId}
      className="mt-0 w-[260px] shrink-0 self-start"
    >
      <CardContent className="space-y-2.5 px-3.5 pt-3.5 pb-2 tabular-nums">
        {quote ? (
          <QuoteBody quote={quote} titleId={titleId} />
        ) : (
          <p
            id={titleId}
            className="flex gap-1.5 text-xs leading-relaxed text-amber-700 dark:text-amber-300"
          >
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>
              The cost of this batch could not be read, so it can&apos;t be approved here.
            </span>
          </p>
        )}
      </CardContent>
      <CardFooter className="mt-auto flex items-center justify-end gap-1 border-t border-border/50 px-3 py-2">
        <AgentButton
          variant="ghost"
          disabled={disabled}
          onClick={onDenyAction}
          className="h-7 min-h-0 gap-1 px-2.5 text-xs"
        >
          <X className="h-3 w-3" />
          Deny
          <span className="sr-only">{batchWords}</span>
        </AgentButton>
        {quote ? (
          <AgentButton
            variant="primary"
            disabled={disabled || quote.refusal !== null}
            onClick={onApproveAction}
            className="h-7 min-h-0 gap-1 px-2.5 text-xs"
          >
            <Check className="h-3 w-3" />
            Approve
            <span className="sr-only">
              {`${batchWords}, first pass up to ${usd(quote.boundUsd)}`}
            </span>
          </AgentButton>
        ) : null}
      </CardFooter>
    </AgentDecisionCard>
  );
}

function QuoteBody({ quote, titleId }: { quote: HeadlessBatchQuote; titleId: string }) {
  return (
    <>
      <div>
        <p id={titleId} className="text-sm font-medium text-foreground">
          Make <span data-field="items">{quote.items}</span>{' '}
          {plural(quote.items, 'piece', 'pieces')}
        </p>
        <p className="text-xs text-muted-foreground">
          {quote.reels > 0 ? (
            <span>
              <span data-field="reels">{quote.reels}</span> {plural(quote.reels, 'reel', 'reels')}
            </span>
          ) : null}
          {quote.reels > 0 && quote.stillSets > 0 ? ' · ' : null}
          {quote.stillSets > 0 ? (
            <span>
              <span data-field="still-sets">{quote.stillSets}</span>{' '}
              {plural(quote.stillSets, 'still set', 'still sets')}
            </span>
          ) : null}
        </p>
      </div>
      <div>
        <p className="text-sm text-foreground">
          First pass up to <span data-field="bound-usd">{usd(quote.boundUsd)}</span>
        </p>
        <p className="text-2xs leading-relaxed text-muted-foreground">
          pieces <span data-field="cap-usd">{usd(quote.capUsd)}</span>
          {quote.copyUsd > 0 ? (
            <>
              {' · copy '}
              <span data-field="copy-usd">{usd(quote.copyUsd)}</span>
            </>
          ) : null}
          {quote.castPackUsd > 0 ? (
            <>
              {' · character packs up to '}
              <span data-field="cast-pack-usd">{usd(quote.castPackUsd)}</span>
            </>
          ) : null}
        </p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
        <dt className="text-muted-foreground">Typically</dt>
        <dd data-field="expected-usd" className="text-right text-foreground">
          {usd(quote.expectedUsd)}
        </dd>
        <dt className="text-muted-foreground">With re-directs, up to</dt>
        <dd data-field="max-usd" className="text-right text-foreground">
          {usd(quote.maxUsd)}
        </dd>
      </dl>
      {quote.windowRemainingUsd !== null ? (
        <p className="text-xs text-muted-foreground">
          <span data-field="window-remaining-usd">{usd(quote.windowRemainingUsd)}</span> left in the
          brand&apos;s 24 h window
        </p>
      ) : null}
      {quote.castApprovalNeeded ? (
        <p data-field="cast-step" className="text-xs leading-relaxed text-foreground/80">
          No approved cast yet: the first piece drafts the people and places, you approve them once
          on the batch card, and the rest wait for it.
        </p>
      ) : null}
      {quote.refusal ? (
        <p className="flex gap-1.5 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span data-field="refusal">{refusalWords(quote)}</span>
        </p>
      ) : null}
    </>
  );
}

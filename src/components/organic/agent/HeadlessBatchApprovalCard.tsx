'use client';

import type { HeadlessBatchQuote } from '@continuum/contracts';
import { Check, TriangleAlert, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useId } from 'react';
import { AgentButton, AgentDecisionCard } from '@/components/shared/agent-cards/agentCardKit';
import { CardContent, CardFooter } from '@/components/ui/card';
import type { UiLocale } from '@/i18n/config';
import { formatDecimal } from '@/lib/format/decimal';

const usd = (value: number, locale: UiLocale) => `$${formatDecimal(value, 2, locale)}`;

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
  const uiText = useTranslations('organic');
  const uiLocale = useLocale();
  const titleId = useId();
  const batchWords = quote
    ? uiText('batchDescription', { count: quote.items })
    : uiText('batchDescriptionUnknown');
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
            <span>{uiText('the_cost_of_this_batch_could_not_be_read_so_i_54169db')}</span>
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
          {uiText('batchDeny')}
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
            {uiText('batchApprove')}
            <span className="sr-only">
              {uiText('batchApprovalDescription', {
                count: quote.items,
                amount: usd(quote.boundUsd, uiLocale),
              })}
            </span>
          </AgentButton>
        ) : null}
      </CardFooter>
    </AgentDecisionCard>
  );
}

function QuoteBody({ quote, titleId }: { quote: HeadlessBatchQuote; titleId: string }) {
  const uiText = useTranslations('organic');
  const uiLocale = useLocale();
  return (
    <>
      <div>
        <p id={titleId} className="text-sm font-medium text-foreground">
          {uiText.rich('batchMake', {
            count: quote.items,
            items: (chunks) => <span data-field="items">{chunks}</span>,
          })}
        </p>
        <p className="text-xs text-muted-foreground">
          {quote.reels > 0 ? (
            <span>
              {uiText.rich('batchReels', {
                count: quote.reels,
                items: (chunks) => <span data-field="reels">{chunks}</span>,
              })}
            </span>
          ) : null}
          {quote.reels > 0 && quote.stillSets > 0 ? ' · ' : null}
          {quote.stillSets > 0 ? (
            <span>
              {uiText.rich('batchStillSets', {
                count: quote.stillSets,
                items: (chunks) => <span data-field="still-sets">{chunks}</span>,
              })}
            </span>
          ) : null}
        </p>
      </div>
      <div>
        <p className="text-sm text-foreground">
          {uiText.rich('batchFirstPass', {
            amount: () => <span data-field="bound-usd">{usd(quote.boundUsd, uiLocale)}</span>,
          })}
        </p>
        <p className="text-2xs leading-relaxed text-muted-foreground">
          {uiText.rich('batchPiecesCost', {
            amount: () => <span data-field="cap-usd">{usd(quote.capUsd, uiLocale)}</span>,
          })}
          {quote.copyUsd > 0 ? (
            <>
              {uiText.rich('batchCopyCost', {
                amount: () => <span data-field="copy-usd">{usd(quote.copyUsd, uiLocale)}</span>,
              })}
            </>
          ) : null}
          {quote.castPackUsd > 0 ? (
            <>
              {uiText.rich('batchCastCost', {
                amount: () => (
                  <span data-field="cast-pack-usd">{usd(quote.castPackUsd, uiLocale)}</span>
                ),
              })}
            </>
          ) : null}
        </p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
        <dt className="text-muted-foreground">{uiText('typically_2063443')}</dt>
        <dd data-field="expected-usd" className="text-right text-foreground">
          {usd(quote.expectedUsd, uiLocale)}
        </dd>
        <dt className="text-muted-foreground">{uiText('with_re_directs_up_to_d1088f4')}</dt>
        <dd data-field="max-usd" className="text-right text-foreground">
          {usd(quote.maxUsd, uiLocale)}
        </dd>
      </dl>
      {quote.windowRemainingUsd !== null ? (
        <p className="text-xs text-muted-foreground">
          {uiText.rich('batchRemainingWindow', {
            amount: () => (
              <span data-field="window-remaining-usd">
                {quote.windowRemainingUsd === null ? '' : usd(quote.windowRemainingUsd, uiLocale)}
              </span>
            ),
          })}
        </p>
      ) : null}
      {quote.castApprovalNeeded ? (
        <p data-field="cast-step" className="text-xs leading-relaxed text-foreground/80">
          {uiText('no_approved_cast_yet_the_first_piece_drafts_t_df1f187')}
        </p>
      ) : null}
      {quote.refusal ? (
        <p className="flex gap-1.5 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span data-field="refusal">
            {quote.boundUsd > quote.maxUsd
              ? uiText('batchOverCeiling', {
                  bound: usd(quote.boundUsd, uiLocale),
                  ceiling: usd(quote.maxUsd, uiLocale),
                })
              : quote.windowRemainingUsd !== null && quote.boundUsd > quote.windowRemainingUsd
                ? uiText('batchOverWindow', {
                    remaining: usd(quote.windowRemainingUsd, uiLocale),
                  })
                : uiText('batchRefused')}
          </span>
        </p>
      ) : null}
    </>
  );
}

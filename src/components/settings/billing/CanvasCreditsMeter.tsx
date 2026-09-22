'use client';

import type { CreditPackOffer } from '@continuum/contracts';
import { useState } from 'react';
import { TopUpPackPicker, useCreditCheckout } from '@/components/billing/TopUpDialog';
import { Button } from '@/components/ui/button';
import { type CanvasCreditsView, formatCredits, formatUsd } from '@/lib/billing/billingViewModel';
import { DEFAULT_TOP_UP_PACKS } from '@/lib/billing/topUp';
import { cn } from '@/lib/utils';

// The Canvas meter is one bar split in the order generations actually spend credits —
// rollover, then this period's included credits, then purchased packs — so the leftmost
// segment is always the next one to shrink. Overage is money, not credits, so it is a line
// of text under the bar rather than a segment in it.

const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

type Segment = { key: string; label: string; credits: number; swatch: string };

export function CanvasCreditsMeter({ credits }: { credits: CanvasCreditsView }) {
  const segments: Segment[] = [
    {
      key: 'rollover',
      label: 'Rollover',
      credits: credits.rolloverCredits,
      swatch: 'bg-primary/45',
    },
    {
      key: 'included',
      label: 'Included',
      credits: credits.includedRemainingCredits,
      swatch: 'bg-primary',
    },
    {
      key: 'purchased',
      label: 'Purchased',
      credits: credits.purchasedCredits,
      swatch: 'bg-secondary',
    },
  ];
  const total = Math.max(credits.availableCredits, 1);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm text-muted-foreground">
          <span
            className="font-mono text-xl font-semibold text-foreground tabular-nums"
            data-testid="canvas-credits-available"
          >
            {formatCredits(credits.availableCredits)}
          </span>{' '}
          credits available
        </p>
        {credits.includedCredits > 0 ? (
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatCredits(credits.includedUsedCredits)} of {formatCredits(credits.includedCredits)}{' '}
            included used
            {credits.periodEnd ? ` · resets ${dateFormat.format(new Date(credits.periodEnd))}` : ''}
          </p>
        ) : null}
      </div>

      <div
        role="img"
        aria-label={segments.map((s) => `${s.label} ${formatCredits(s.credits)}`).join(', ')}
        className="flex h-2 w-full gap-px overflow-hidden rounded-full bg-muted"
      >
        {segments
          .filter((segment) => segment.credits > 0)
          .map((segment) => (
            <div
              key={segment.key}
              className={cn('h-full first:rounded-l-full last:rounded-r-full', segment.swatch)}
              style={{ width: `${(segment.credits / total) * 100}%` }}
            />
          ))}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 @[36rem]/settings-section:grid-cols-4">
        {segments.map((segment) => (
          <div key={segment.key} className="min-w-0">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn('size-2 shrink-0 rounded-full', segment.swatch)} aria-hidden />
              {segment.label}
            </dt>
            <dd className="font-mono text-sm text-foreground tabular-nums">
              {formatCredits(segment.credits)}
            </dd>
          </div>
        ))}
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Billed to card this period</dt>
          <dd className="font-mono text-sm text-foreground tabular-nums">
            {formatUsd(credits.overageUsd)}
            {credits.overageCapUsd !== null ? (
              <span className="text-xs text-muted-foreground">
                {' '}
                of {formatUsd(credits.overageCapUsd)}
              </span>
            ) : null}
          </dd>
        </div>
      </dl>

      <p className="max-w-[70ch] text-xs text-muted-foreground">
        Each generation spends rollover credits first, then this month&apos;s included credits, then
        purchased packs.{' '}
        {credits.billsOverageToCard
          ? `After that, usage is billed to your card at ${formatUsd(0.01)} per credit${
              credits.overageCapUsd !== null
                ? `, up to ${formatUsd(credits.overageCapUsd)} a month`
                : ''
            }.`
          : 'When credits run out, generation pauses until you buy a pack — or turn on auto-billing.'}
      </p>
    </div>
  );
}

/** The same pack picker as the Top up dialog, returning to Billing after Checkout. */
export function BuyCreditsControl({
  brandId,
  offer,
  purchasedCredits,
}: {
  brandId: string;
  offer: CreditPackOffer;
  purchasedCredits: number;
}) {
  const [packs, setPacks] = useState(DEFAULT_TOP_UP_PACKS);
  const { buy, redirecting } = useCreditCheckout(brandId, purchasedCredits);

  return (
    <div className="space-y-3">
      <TopUpPackPicker
        packs={packs}
        onPacksChange={setPacks}
        offer={offer}
        className="@[36rem]/settings-section:grid-cols-3"
      />
      <div className="flex justify-end">
        <Button disabled={redirecting} aria-busy={redirecting} onClick={() => buy(packs)}>
          {redirecting ? 'Opening checkout…' : `Buy credits · ${formatUsd(packs * offer.priceUsd)}`}
        </Button>
      </div>
    </div>
  );
}

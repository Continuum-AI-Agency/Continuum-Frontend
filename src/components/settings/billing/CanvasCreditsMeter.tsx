'use client';

import type { CreditPackOffer } from '@continuum/contracts';
import { useMutation } from '@tanstack/react-query';
import { Minus, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
  NumberFieldRoot,
} from '@/components/ui/number-field';
import { useToast } from '@/components/ui/ToastProvider';
import { startCreditCheckout } from '@/lib/billing/billingApi';
import {
  type CanvasCreditsView,
  checkoutReturnParams,
  formatCredits,
  formatUsd,
} from '@/lib/billing/billingViewModel';
import { billingReturnUrl } from '@/lib/billing/useBilling';
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
        purchased credits.{' '}
        {credits.billsOverageToCard
          ? `After that, usage is billed to your card at ${formatUsd(0.01)} per credit${
              credits.overageCapUsd !== null
                ? `, up to ${formatUsd(credits.overageCapUsd)} a month`
                : ''
            }.`
          : 'After that, generation pauses until you buy more credits.'}
      </p>
    </div>
  );
}

export function BuyCreditsControl({
  brandId,
  offer,
  purchasedCredits,
}: {
  brandId: string;
  offer: CreditPackOffer;
  purchasedCredits: number;
}) {
  const { show } = useToast();
  const [packs, setPacks] = useState(1);
  const checkout = useMutation({
    mutationFn: (count: number) => {
      const query = checkoutReturnParams({
        kind: 'credits_added',
        purchasedCreditsBefore: purchasedCredits,
      });
      return startCreditCheckout(brandId, {
        packs: count,
        successUrl: billingReturnUrl(query.success),
        cancelUrl: billingReturnUrl(query.cancel),
      });
    },
    onSuccess: (session) => window.location.assign(session.url),
    onError: (error) =>
      show({ title: 'Could not open checkout', description: error.message, variant: 'error' }),
  });
  const redirecting = checkout.isPending || checkout.isSuccess;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <NumberFieldRoot
        value={packs}
        min={1}
        max={offer.maxPacks}
        step={1}
        onValueChange={(next) => setPacks(next ?? 1)}
        className="shrink-0"
      >
        <NumberFieldGroup className="flex h-8 items-center rounded-md border border-input bg-background focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/45 dark:bg-input/30">
          <NumberFieldDecrement
            aria-label="Fewer packs"
            className="flex h-full items-center px-2 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/45 disabled:opacity-40"
          >
            <Minus className="size-3.5" />
          </NumberFieldDecrement>
          <NumberFieldInput
            aria-label="Credit packs"
            className="h-full w-10 bg-transparent text-center text-sm tabular-nums text-foreground outline-none"
          />
          <NumberFieldIncrement
            aria-label="More packs"
            className="flex h-full items-center px-2 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/45 disabled:opacity-40"
          >
            <Plus className="size-3.5" />
          </NumberFieldIncrement>
        </NumberFieldGroup>
      </NumberFieldRoot>
      <p className="text-sm text-muted-foreground tabular-nums">
        {packs === 1 ? 'pack' : 'packs'} · {formatCredits(packs * offer.credits)} credits ·{' '}
        <span className="text-foreground">{formatUsd(packs * offer.priceUsd)}</span>
      </p>
      <Button
        variant="default"
        disabled={redirecting}
        aria-busy={redirecting}
        onClick={() => checkout.mutate(packs)}
        className="ml-auto"
      >
        {redirecting ? 'Opening checkout…' : 'Buy credits'}
      </Button>
    </div>
  );
}

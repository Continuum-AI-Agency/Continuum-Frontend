'use client';

import type { CreditPackOffer, CreditWallet } from '@continuum/contracts';
import { useState } from 'react';
import {
  PromoCodeRedeem,
  TopUpPackPicker,
  useCreditCheckout,
} from '@/components/billing/TopUpDialog';
import { Button } from '@/components/ui/button';
import { UsageSummary } from '@/components/ui/usage-summary';
import {
  type CanvasCreditsView,
  formatCredits,
  formatUsd,
  X_LINK_POST_CREDITS,
  X_POST_CREDITS,
  type XWalletView,
} from '@/lib/billing/billingViewModel';
import { DEFAULT_TOP_UP_PACKS } from '@/lib/billing/topUp';

// The Canvas meter: the balance split in the order generations spend credits — rollover, then
// this period's included credits, then purchased packs — so the leftmost segment is always the
// next one to shrink. The budget bar is the included allowance. Overage is money, not credits,
// so it is a line under the bar rather than a segment in it. billing-api exposes period totals
// only, so there is no daily chart.

const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

const SOURCES = [
  {
    id: 'rollover',
    name: 'Rollover',
    color: 'color-mix(in oklab, var(--primary) 45%, transparent)',
  },
  { id: 'included', name: 'Included', color: 'var(--primary)' },
  { id: 'purchased', name: 'Purchased', color: 'var(--color-secondary)' },
];

const amount = (credits: number) => ({ tokens: credits, cost: credits / 100 });

export function CanvasCreditsMeter({ credits }: { credits: CanvasCreditsView }) {
  const resets = credits.periodEnd
    ? ` · resets ${dateFormat.format(new Date(credits.periodEnd))}`
    : '';
  return (
    <UsageSummary
      title="Canvas credits"
      unit="credits"
      formatAmount={formatCredits}
      className="max-w-2xl"
      subtitle={
        <>
          <span
            className="font-medium text-foreground tabular-nums"
            data-testid="canvas-credits-available"
          >
            {formatCredits(credits.availableCredits)}
          </span>{' '}
          credits available{resets}
        </>
      }
      data={{
        models: SOURCES,
        totals: {
          rollover: amount(credits.rolloverCredits),
          included: amount(credits.includedRemainingCredits),
          purchased: amount(credits.purchasedCredits),
        },
        budget:
          credits.includedCredits > 0
            ? {
                limit: credits.includedCredits / 100,
                used: credits.includedUsedCredits / 100,
                label: `${formatCredits(credits.includedUsedCredits)} of ${formatCredits(credits.includedCredits)} included used`,
                warnLabel: 'Included credits running low',
                overLabel: 'Included credits used up',
              }
            : undefined,
      }}
    >
      <div className="space-y-2 px-3.5 pb-3 text-[0.8125rem]">
        <p className="flex items-center justify-between gap-3 text-muted-foreground">
          Billed to card this period
          <span className="font-mono tabular-nums" data-testid="canvas-credits-overage">
            <span className="text-foreground">{formatUsd(credits.overageUsd)}</span>
            {credits.overageCapUsd !== null ? ` of ${formatUsd(credits.overageCapUsd)}` : null}
          </span>
        </p>
        <p className="max-w-[70ch] text-xs text-muted-foreground">
          Each generation spends rollover credits first, then this month&apos;s included credits,
          then purchased packs.{' '}
          {credits.billsOverageToCard
            ? `After that, usage is billed to your card at ${formatUsd(0.01)} per credit${
                credits.overageCapUsd !== null
                  ? `, up to ${formatUsd(credits.overageCapUsd)} a month`
                  : ''
              }.`
            : 'When credits run out, generation pauses until you buy a pack — or turn on auto-billing.'}
        </p>
      </div>
    </UsageSummary>
  );
}

/** The prepaid X API wallet: one balance, spent per X call at X's list price × 1.15. */
export function XCreditsMeter({ x }: { x: XWalletView }) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        <span
          className="font-mono text-xl font-semibold text-foreground tabular-nums"
          data-testid="x-credits-available"
        >
          {formatCredits(x.balanceCredits)}
        </span>{' '}
        X API credits · about {formatCredits(x.postsLeft)} posts
      </p>
      <p className="max-w-[70ch] text-xs text-muted-foreground">
        X charges per API call, and this balance pays for it: {X_POST_CREDITS} credits a post,{' '}
        {X_LINK_POST_CREDITS} for a post with a link, and about 1 credit per 8 posts read for
        analytics. Canvas credits are never used for X.
      </p>
    </div>
  );
}

/** The same pack picker as the Top up dialog, returning to Billing after Checkout. */
export function BuyCreditsControl({
  brandId,
  offer,
  purchasedCredits,
  wallet = 'canvas',
}: {
  brandId: string;
  offer: CreditPackOffer;
  purchasedCredits: number;
  wallet?: CreditWallet;
}) {
  const [packs, setPacks] = useState(DEFAULT_TOP_UP_PACKS);
  const { buy, redirecting } = useCreditCheckout(brandId, purchasedCredits, wallet);

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
          {redirecting
            ? 'Opening checkout…'
            : `Buy ${wallet === 'x' ? 'X ' : ''}credits · ${formatUsd(packs * offer.priceUsd)}`}
        </Button>
      </div>
      {/* Promo codes (CONTINUUM200) are for Canvas credits only. */}
      {wallet === 'canvas' ? (
        <PromoCodeRedeem brandId={brandId} purchasedCreditsBefore={purchasedCredits} />
      ) : null}
    </div>
  );
}

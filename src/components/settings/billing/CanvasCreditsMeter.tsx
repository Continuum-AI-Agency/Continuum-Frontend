'use client';

import type { CreditPackOffer, CreditWallet } from '@continuum/contracts';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  PromoCodeRedeem,
  TopUpPackPicker,
  useCreditCheckout,
} from '@/components/billing/TopUpDialog';
import { Button } from '@/components/ui/button';
import {
  type CanvasCreditsView,
  formatCredits,
  formatUsd,
  X_LINK_POST_CREDITS,
  X_POST_CREDITS,
  type XWalletView,
} from '@/lib/billing/billingViewModel';
import { DEFAULT_TOP_UP_PACKS } from '@/lib/billing/topUp';
import { cn } from '@/lib/utils';

// The Canvas meter is one bar split in the order generations actually spend credits —
// rollover, then this period's included credits, then purchased packs — so the leftmost
// segment is always the next one to shrink. Overage is money, not credits, so it is a line
// of text under the bar rather than a segment in it.

type Segment = { key: string; label: string; credits: number; swatch: string };

export function CanvasCreditsMeter({ credits }: { credits: CanvasCreditsView }) {
  const uiLocale = useLocale();

  const tUi = useTranslations('settings');
  const dateFormat = new Intl.DateTimeFormat(useLocale(), { month: 'short', day: 'numeric' });

  const segments: Segment[] = [
    {
      key: 'rollover',
      label: tUi('m_434ecbfc21'),
      credits: credits.rolloverCredits,
      swatch: 'bg-primary/45',
    },
    {
      key: 'included',
      label: tUi('m_3e2c570409'),
      credits: credits.includedRemainingCredits,
      swatch: 'bg-primary',
    },
    {
      key: 'purchased',
      label: tUi('m_8b70c504aa'),
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
            {formatCredits(credits.availableCredits, uiLocale)}
          </span>{' '}
          {tUi('m_e379e39ff9')}
        </p>
        {credits.includedCredits > 0 ? (
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatCredits(credits.includedUsedCredits, uiLocale)}
            {tUi('m_607f2de6ce')}
            {formatCredits(credits.includedCredits, uiLocale)} {tUi('m_3c1c8da652')}
            {credits.periodEnd
              ? tUi('m_1d444fa9d1', { v0: String(dateFormat.format(new Date(credits.periodEnd))) })
              : ''}
          </p>
        ) : null}
      </div>

      <div
        role="img"
        aria-label={segments
          .map((s) => `${s.label} ${formatCredits(s.credits, uiLocale)}`)
          .join(', ')}
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
              {formatCredits(segment.credits, uiLocale)}
            </dd>
          </div>
        ))}
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">{tUi('m_7061ddf99d')}</dt>
          <dd className="font-mono text-sm text-foreground tabular-nums">
            {formatUsd(credits.overageUsd, 'usd', uiLocale)}
            {credits.overageCapUsd !== null ? (
              <span className="text-xs text-muted-foreground">
                {' '}
                {tUi('m_2449d65241')}
                {formatUsd(credits.overageCapUsd, 'usd', uiLocale)}
              </span>
            ) : null}
          </dd>
        </div>
      </dl>

      <p className="max-w-[70ch] text-xs text-muted-foreground">
        {tUi('m_0929d25adc')}{' '}
        {credits.billsOverageToCard
          ? tUi('m_1ea8de0e33', {
              v0: String(formatUsd(0.01, 'usd', uiLocale)),
              v1: String(
                credits.overageCapUsd !== null
                  ? `, up to ${formatUsd(credits.overageCapUsd, 'usd', uiLocale)} a month`
                  : '',
              ),
            })
          : tUi('m_31d098c349')}
      </p>
    </div>
  );
}

/** The prepaid X API wallet: one balance, spent per X call at X's list price × 1.15. */
export function XCreditsMeter({ x }: { x: XWalletView }) {
  const uiLocale = useLocale();

  const tUi = useTranslations('settings');

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        <span
          className="font-mono text-xl font-semibold text-foreground tabular-nums"
          data-testid="x-credits-available"
        >
          {formatCredits(x.balanceCredits, uiLocale)}
        </span>{' '}
        {tUi('m_e69bc0da4b')}
        {formatCredits(x.postsLeft, uiLocale)}
        {tUi('m_7ddf0bf3ac')}
      </p>
      <p className="max-w-[70ch] text-xs text-muted-foreground">
        {tUi('m_e76c9794f3')}
        {X_POST_CREDITS}
        {tUi('m_228bdaae57')} {X_LINK_POST_CREDITS}
        {tUi('m_40d4712a54')}
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
  const uiLocale = useLocale();

  const tUi = useTranslations('settings');

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
            ? tUi('m_4b149ef50a')
            : tUi('m_c73e3d4b1e', {
                v0: String(wallet === 'x' ? 'X ' : ''),
                v1: String(formatUsd(packs * offer.priceUsd, 'usd', uiLocale)),
              })}
        </Button>
      </div>
      {/* Promo codes (CONTINUUM200) are for Canvas credits only. */}
      {wallet === 'canvas' ? (
        <PromoCodeRedeem brandId={brandId} purchasedCreditsBefore={purchasedCredits} />
      ) : null}
    </div>
  );
}

'use client';

import type { BillingPaymentRequired } from '@continuum/contracts';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { billingHref, creditsHref, PLAN_NAME } from '@/lib/billing/productAccess';
import { openTopUp } from '@/lib/billing/topUp';
import { cn } from '@/lib/utils';

// The Backend's 402 on screen: the body's own sentence and the ONE control its `action`
// names — a plan to add, credits to buy, or someone to talk to. Rendered wherever a gated
// call was refused in place (the Jaina chat, a generation), so a refusal is never a blank:
// two real customers reached /api/agents/jaina with a 402 the client never surfaced
// (PP-L4-jaina-402-for-two-customer-accounts).

export const SUPPORT_HREF = '/support';

type PaymentRequiredNoticeProps = {
  body: BillingPaymentRequired;
  /** The page the refusal happened on: Billing offers the way back after the purchase. */
  from?: string;
  className?: string;
};

function ActionControl({ body, from }: { body: BillingPaymentRequired; from?: string }) {
  const { action } = body;
  if (action.kind === 'buy_credits') {
    return (
      <Button
        data-testid="payment-required-buy-credits"
        onClick={() => openTopUp('toast', () => window.location.assign(creditsHref(from)))}
        size="sm"
        type="button"
      >
        Buy credits
      </Button>
    );
  }
  if (action.kind === 'upgrade_plan') {
    const planName = action.planCode ? PLAN_NAME[action.planCode] : null;
    return (
      <Link
        className={buttonVariants({ size: 'sm' })}
        data-testid="payment-required-upgrade-plan"
        href={billingHref(body.product, from)}
      >
        {planName ? `Add ${planName}` : 'See plans'}
      </Link>
    );
  }
  return (
    <Link
      className={buttonVariants({ size: 'sm', variant: 'outline' })}
      data-testid="payment-required-contact-us"
      href={SUPPORT_HREF}
    >
      Contact us
    </Link>
  );
}

export function PaymentRequiredNotice({ body, from, className }: PaymentRequiredNoticeProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm',
        className,
      )}
      data-action={body.action.kind}
      data-testid="payment-required-notice"
      role="alert"
    >
      <div className="min-w-0 space-y-0.5">
        <p className="font-semibold text-primary-ink">{body.productName} is not on this plan</p>
        <p className="text-muted-foreground">{body.message}</p>
      </div>
      <ActionControl body={body} from={from} />
    </div>
  );
}

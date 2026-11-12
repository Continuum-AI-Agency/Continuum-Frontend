'use client';

import type { BillingPaymentRequired } from '@continuum/contracts';
import { useTranslations } from 'next-intl';
import { Button, buttonVariants } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
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
  const uiText = useTranslations('common');
  const { action } = body;
  if (action.kind === 'buy_credits') {
    return (
      <Button
        data-testid="payment-required-buy-credits"
        onClick={() => openTopUp('toast', () => window.location.assign(creditsHref(from)))}
        size="sm"
        type="button"
      >
        {uiText('buy_credits_fd70f8c')}
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
        {planName ? uiText('m_1b7bee9522', { v0: String(planName) }) : uiText('see_plans_d989893')}
      </Link>
    );
  }
  return (
    <Link
      className={buttonVariants({ size: 'sm', variant: 'outline' })}
      data-testid="payment-required-contact-us"
      href={SUPPORT_HREF}
    >
      {uiText('m_4832e45812')}
    </Link>
  );
}

export function PaymentRequiredNotice({ body, from, className }: PaymentRequiredNoticeProps) {
  const tUi = useTranslations('common');
  const productKeys = {
    studio: 'm_d9626c6a4e',
    organic_agent: 'm_689e938780',
    paid_media: 'm_e31de60a69',
    trends: 'trends_e856c6c',
    mcp: 'm_6ff673d07b',
    listening: 'm_5f56441d1e',
  } as const;
  const product = tUi(productKeys[body.product]);
  const plan = body.planCode ? PLAN_NAME[body.planCode] : null;
  const message =
    body.error === 'credits_exhausted'
      ? tUi('m_6a4fddfa17')
      : plan
        ? tUi('m_0df71412e4', { product, plan })
        : tUi('m_ae9e83fb41', { product });

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-lg bg-warning/10 px-4 py-3 text-sm',
        className,
      )}
      data-action={body.action.kind}
      data-testid="payment-required-notice"
      role="alert"
    >
      <div className="min-w-0 space-y-0.5">
        <p className="font-semibold text-foreground">
          {product}
          {tUi('m_3e851de5ae')}
        </p>
        <p className="text-muted-foreground">{message}</p>
      </div>
      <ActionControl body={body} from={from} />
    </div>
  );
}

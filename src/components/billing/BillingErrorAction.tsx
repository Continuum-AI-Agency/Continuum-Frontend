'use client';
import { useTranslations } from 'next-intl';
import { Button, buttonVariants } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { billingHref, creditsHref } from '@/lib/billing/productAccess';
import { openTopUp } from '@/lib/billing/topUp';

// The fix for a billing refusal, on the canvas node that was refused: a spent balance tops up
// in place (the node keeps its prompt, so one more click reruns it); a missing plan links to
// Billing. Any other error has nothing to buy, so nothing renders.

const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();

export function BillingErrorAction({ errorCode }: { errorCode: unknown }) {
  const uiText = useTranslations('common');
  const from = () => `${window.location.pathname}${window.location.search}`;
  if (errorCode === 'credits_exhausted') {
    return (
      <Button
        size="sm"
        data-testid="node-buy-credits"
        onMouseDown={stop}
        onClick={(event) => {
          stop(event);
          openTopUp('node', () => window.location.assign(creditsHref(from())));
        }}
      >
        {uiText('buy_credits_fd70f8c')}
      </Button>
    );
  }
  if (errorCode === 'product_required') {
    return (
      <Link
        href={billingHref('studio')}
        onMouseDown={stop}
        className={buttonVariants({ size: 'sm' })}
      >
        {uiText('see_plans_d989893')}
      </Link>
    );
  }
  return null;
}

'use client';

import type { BillingSubscriptionView } from '@continuum/billing-ui';
import { CreditCard } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatMoney, formatShortDate } from './billingFormat';

type PaymentPanelProps = {
  /** True when Stripe has a card — Continuum never receives PAN/last4/exp. */
  hasPaymentMethod: boolean;
  subscriptions: BillingSubscriptionView[];
  customerEmail: string | null;
  onManagePortal: () => void;
  busy?: boolean;
};

/**
 * Payment method UI is Stripe-hosted only (Customer Portal / Checkout).
 * Continuum never collects or displays full card material.
 */
export function PaymentPanel({
  hasPaymentMethod,
  subscriptions,
  customerEmail,
  onManagePortal,
  busy,
}: PaymentPanelProps) {
  const active = subscriptions.filter((sub) =>
    ['active', 'trialing', 'past_due', 'unpaid'].includes(sub.status),
  );

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="border-b border-border/60">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="text-base">Payment method</CardTitle>
            <CardDescription>
              Cards are entered and stored only on Stripe. Continuum never handles card numbers.
            </CardDescription>
          </div>
          <Button type="button" size="sm" disabled={busy} onClick={onManagePortal}>
            Manage card in Stripe
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 pt-5 md:grid-cols-2">
        <div className="rounded-lg border border-border/70 bg-muted/15 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <CreditCard className="size-4 text-muted-foreground" aria-hidden />
            Card status
          </div>
          {hasPaymentMethod ? (
            <p className="text-sm">
              A payment method is on file with Stripe. Open the portal to view or update it.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No card on file yet. Subscribe to a module or open the Stripe portal to add one.
            </p>
          )}
          {customerEmail ? (
            <p className="mt-2 text-xs text-muted-foreground">Billing email {customerEmail}</p>
          ) : null}
        </div>

        <div className="rounded-lg border border-border/70 bg-muted/15 p-4">
          <p className="mb-3 text-sm font-medium">Active subscriptions</p>
          {active.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active Stripe subscriptions.</p>
          ) : (
            <ul className="space-y-3">
              {active.map((sub) => (
                <li key={sub.id} className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="capitalize">
                      {sub.status.replace('_', ' ')}
                    </Badge>
                    {sub.cancelAtPeriodEnd ? (
                      <span className="text-xs text-amber-700 dark:text-amber-400">
                        Cancels at period end
                      </span>
                    ) : null}
                  </div>
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {sub.items.map((item) => (
                      <li key={item.id}>
                        {item.productName ?? item.catalogCode ?? 'Line item'}
                        {item.unitAmount != null && item.currency
                          ? ` · ${formatMoney(item.unitAmount, item.currency)}/${item.interval ?? 'mo'}`
                          : ''}
                        {item.quantity > 1 ? ` × ${item.quantity}` : ''}
                      </li>
                    ))}
                  </ul>
                  {sub.currentPeriodEnd ? (
                    <p className="text-xs text-muted-foreground">
                      Renews {formatShortDate(sub.currentPeriodEnd)}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

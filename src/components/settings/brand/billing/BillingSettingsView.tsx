'use client';

import { useMemo, useState } from 'react';
import type { BillingInvoiceView, BillingManagementModel } from '@continuum/billing-ui';
import { AlertCircle, HardDrive } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ChargeLogPanel } from './ChargeLogPanel';
import { InvoiceEmailDialog } from './InvoiceEmailDialog';
import { InvoiceFeed } from './InvoiceFeed';
import { InvoiceReceiptSheet } from './InvoiceReceiptSheet';
import { MeteredCreditsCard } from './MeteredCreditsCard';
import { PaymentPanel } from './PaymentPanel';
import { ProductModulesGrid } from './ProductModulesGrid';
import {
  formatBytes,
  formatTierExplain,
  formatTierMode,
} from './billingFormat';

export type BillingSettingsActions = {
  openCustomerPortal: () => Promise<void> | void;
  startCheckout: (codes: string[]) => Promise<void> | void;
};

type BillingSettingsViewProps = {
  model: BillingManagementModel;
  actions: BillingSettingsActions;
  busy?: 'portal' | 'checkout' | null;
  error?: string | null;
  brandName?: string | null;
  selfEmail?: string | null;
};

/**
 * Design read: Continuum product billing for brand owners.
 * Quiet zinc surfaces, emerald accent, shadcn composition, receipt-card invoices (no tables).
 * Signature: the credit balance as the operational thesis of the page.
 */
export function BillingSettingsView({
  model,
  actions,
  busy = null,
  error = null,
  brandName = null,
  selfEmail = null,
}: BillingSettingsViewProps) {
  const { summary, meteredUsage, stripeAccount, groups, activeOwnership, trendsPack } = model;
  const storagePct = Math.min(100, Math.max(0, summary.storage.utilizationPercent));
  const isLocked =
    summary.entitlements.tier === 0 || summary.entitlements.tierMode === 'emergency_lock';
  const invoices = stripeAccount?.invoices ?? [];
  const subscriptions = stripeAccount?.subscriptions ?? [];

  const [selectedInvoice, setSelectedInvoice] = useState<BillingInvoiceView | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [emailInvoice, setEmailInvoice] = useState<BillingInvoiceView | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);

  const openInvoice = (invoice: BillingInvoiceView) => {
    setSelectedInvoice(invoice);
    setSheetOpen(true);
  };

  const openEmail = (invoice: BillingInvoiceView) => {
    setEmailInvoice(invoice);
    setEmailOpen(true);
  };

  const printInvoice = (invoice: BillingInvoiceView) => {
    // Open the print-ready receipt sheet; user confirms Print there (or Stripe PDF).
    setSelectedInvoice(invoice);
    setSheetOpen(true);
  };

  const ownershipPreview = useMemo(() => activeOwnership.slice(0, 6), [activeOwnership]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-3 border-b border-border/70 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Workspace billing
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">Billing</h2>
          <p className="max-w-xl text-sm text-muted-foreground">
            Credits, invoices, and modules for this brand. Subscribe captures a card in Stripe;
            portal updates payment methods and cancel paths.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={busy !== null}
          onClick={() => void actions.openCustomerPortal()}
        >
          {busy === 'portal' ? 'Opening portal…' : 'Manage card & invoices'}
        </Button>
      </header>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Billing action failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {isLocked ? (
        <Alert>
          <AlertCircle className="size-4" />
          <AlertTitle>Emergency lock (tier 0)</AlertTitle>
          <AlertDescription>
            Paid features are shut off for this brand. Contact Continuum support to restore access.
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Billing snapshot">
        <Snapshot
          label="Access"
          value={formatTierMode(summary.entitlements.tierMode)}
          detail={formatTierExplain(summary.entitlements.tier, summary.entitlements.tierMode)}
        />
        <Snapshot
          label="Credits left"
          value={String(meteredUsage.creditsAvailable)}
          detail={`${meteredUsage.healthLabel} · ${meteredUsage.spent7Days} used in 7 days`}
        />
        <Snapshot
          label="Library used"
          value={formatBytes(summary.storage.usedBytes)}
          detail={`${formatBytes(summary.storage.capacityBytes)} capacity`}
        />
      </section>

      <MeteredCreditsCard
        usage={meteredUsage}
        busy={busy === 'checkout'}
        onBuyCredits={() => void actions.startCheckout(['canvas_credits'])}
      />

      <PaymentPanel
        hasPaymentMethod={Boolean(
          stripeAccount?.hasPaymentMethod ?? stripeAccount?.defaultPaymentMethod?.last4,
        )}
        subscriptions={subscriptions}
        customerEmail={stripeAccount?.customerEmail ?? null}
        onManagePortal={() => void actions.openCustomerPortal()}
        busy={busy === 'portal'}
      />

      <InvoiceFeed
        invoices={invoices}
        busy={busy === 'portal'}
        onOpen={openInvoice}
        onEmail={openEmail}
        onPrint={printInvoice}
        onManagePortal={() => void actions.openCustomerPortal()}
      />

      <ChargeLogPanel model={model} />

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="border-b border-border/60">
          <CardTitle className="flex items-center gap-2 text-base">
            <HardDrive className="size-4 text-muted-foreground" aria-hidden />
            Library storage
          </CardTitle>
          <CardDescription>
            Persistent capacity. Separate from AI Studio credits. Buy more under Capacity modules.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-muted-foreground">
              {formatBytes(summary.storage.usedBytes)} of{' '}
              {formatBytes(summary.storage.capacityBytes)}
            </span>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {storagePct.toFixed(0)}%
            </span>
          </div>
          <Progress value={storagePct} className="h-2" aria-label="Library storage used" />
          <p className="text-xs text-muted-foreground">
            {formatBytes(summary.storage.availableBytes)} free
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">What you own</CardTitle>
          <CardDescription>
            Entitlements and Trends pack status for this brand.
            {trendsPack.plus
              ? ' Trends Plus is active.'
              : trendsPack.core
                ? ` Trends Core · ${trendsPack.entitledProviderCount}/3 providers.`
                : ' Trends not subscribed.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            {ownershipPreview.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Separator />

      <ProductModulesGrid
        groups={groups}
        busy={busy === 'checkout'}
        onSubscribe={(codes) => void actions.startCheckout(codes)}
      />

      <footer className="border-t border-border/70 pt-4 text-xs text-muted-foreground">
        Brand {model.brandId.slice(0, 8)}… · Catalog {model.catalogVersion}
        {stripeAccount?.customerId ? ` · ${stripeAccount.customerId}` : ''}
        {stripeAccount ? ' · Stripe test mode' : ''}
      </footer>

      <InvoiceReceiptSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        invoice={selectedInvoice}
        brandName={brandName}
        onEmail={() => {
          if (selectedInvoice) openEmail(selectedInvoice);
        }}
      />

      <InvoiceEmailDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        invoice={emailInvoice}
        defaultSelfEmail={selfEmail}
        brandName={brandName}
      />
    </div>
  );
}

function Snapshot({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="border-border/80 shadow-sm">
      <CardContent className="space-y-1.5 pt-5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="text-xl font-semibold tracking-tight tabular-nums">{value}</p>
        <p className="text-xs leading-snug text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

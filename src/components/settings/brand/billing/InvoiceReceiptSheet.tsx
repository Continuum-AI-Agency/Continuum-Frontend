'use client';

import { useRef } from 'react';
import type { BillingInvoiceView } from '@continuum/billing-ui';
import { Mail, Printer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { formatMoney, formatShortDate } from './billingFormat';

type InvoiceReceiptSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: BillingInvoiceView | null;
  brandName?: string | null;
  onEmail: () => void;
};

export function InvoiceReceiptSheet({
  open,
  onOpenChange,
  invoice,
  brandName,
  onEmail,
}: InvoiceReceiptSheetProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    if (!invoice || !printRef.current) return;
    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=800,height=900');
    if (!printWindow) {
      window.print();
      return;
    }
    const markup = printRef.current.innerHTML;
    printWindow.document.write(`<!doctype html><html><head><title>Invoice ${
      invoice.number ?? invoice.id
    }</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; color: #18181b; padding: 32px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 24px 0 8px; }
  p, li { font-size: 13px; line-height: 1.5; margin: 0; }
  .muted { color: #71717a; }
  .row { display: flex; justify-content: space-between; gap: 16px; padding: 8px 0; border-bottom: 1px solid #e4e4e7; }
  .total { font-weight: 600; font-size: 16px; margin-top: 16px; }
  ul { list-style: none; padding: 0; margin: 0; }
</style></head><body>${markup}</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Invoice receipt</SheetTitle>
          <SheetDescription>
            Review charges, print this receipt, or email it to stakeholders.
          </SheetDescription>
        </SheetHeader>

        {invoice ? (
          <div className="flex h-full flex-col gap-4 px-4 pb-6">
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" className="gap-1.5" onClick={handlePrint}>
                <Printer className="size-3.5" aria-hidden />
                Print
              </Button>
              <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={onEmail}>
                <Mail className="size-3.5" aria-hidden />
                Email
              </Button>
              {invoice.hostedInvoiceUrl ? (
                <Button type="button" size="sm" variant="ghost" asChild>
                  <a href={invoice.hostedInvoiceUrl} target="_blank" rel="noreferrer">
                    Open in Stripe
                  </a>
                </Button>
              ) : null}
            </div>

            <div
              ref={printRef}
              className="flex-1 overflow-y-auto rounded-lg border border-border bg-card p-4 text-card-foreground"
            >
              <div className="space-y-1">
                <h1 className="text-lg font-semibold tracking-tight">
                  {brandName ? `${brandName} · ` : ''}
                  Invoice {invoice.number ?? invoice.id.slice(0, 12)}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {formatShortDate(invoice.createdAt)}
                  {invoice.periodStart && invoice.periodEnd
                    ? ` · period ${formatShortDate(invoice.periodStart)} - ${formatShortDate(invoice.periodEnd)}`
                    : ''}
                </p>
                <Badge variant="secondary" className="mt-2 capitalize">
                  {invoice.status ?? 'unknown'}
                </Badge>
              </div>

              <Separator className="my-4" />

              <h2 className="mb-2 text-sm font-semibold">Charges</h2>
              {invoice.lines.length === 0 ? (
                <p className="text-sm text-muted-foreground">No line items on this invoice.</p>
              ) : (
                <ul className="space-y-0">
                  {invoice.lines.map((line) => (
                    <li
                      key={line.id}
                      className="flex items-start justify-between gap-3 border-b border-border/70 py-2.5 last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-snug">
                          {line.description ?? 'Charge'}
                        </p>
                        {line.quantity && line.quantity > 1 ? (
                          <p className="text-xs text-muted-foreground">Qty {line.quantity}</p>
                        ) : null}
                      </div>
                      <p className="shrink-0 font-mono text-sm tabular-nums">
                        {formatMoney(line.amount, line.currency || invoice.currency)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-border pt-3">
                <span className="text-sm font-medium">Total</span>
                <span className="font-mono text-base font-semibold tabular-nums">
                  {formatMoney(invoice.total, invoice.currency)}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Paid {formatMoney(invoice.amountPaid, invoice.currency)}
                {invoice.amountDue > 0
                  ? ` · due ${formatMoney(invoice.amountDue, invoice.currency)}`
                  : ''}
              </p>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

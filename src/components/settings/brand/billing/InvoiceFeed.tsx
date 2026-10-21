'use client';

import type { BillingInvoiceView } from '@continuum/billing-ui';
import { FileText, Mail, Printer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatMoney, formatShortDate } from './billingFormat';

type InvoiceFeedProps = {
  invoices: BillingInvoiceView[];
  onOpen: (invoice: BillingInvoiceView) => void;
  onEmail: (invoice: BillingInvoiceView) => void;
  onPrint: (invoice: BillingInvoiceView) => void;
  onManagePortal: () => void;
  busy?: boolean;
};

export function InvoiceFeed({
  invoices,
  onOpen,
  onEmail,
  onPrint,
  onManagePortal,
  busy,
}: InvoiceFeedProps) {
  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="border-b border-border/60">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="text-base">Invoices</CardTitle>
            <CardDescription>
              Scrollable receipt cards. Open any invoice to print, email, or inspect every charge.
            </CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onManagePortal}>
            Stripe portal
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-10 text-center">
            <FileText className="size-5 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">No invoices yet</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              After the first successful Checkout, receipts land here as cards you can print or email.
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[min(28rem,55vh)] pr-3">
            <ul className="flex flex-col gap-3 pb-1">
              {invoices.map((invoice) => (
                <li key={invoice.id}>
                  <article className="rounded-lg border border-border/80 bg-muted/10 p-4 transition-colors hover:bg-muted/25">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-mono text-sm font-semibold tracking-tight">
                            {invoice.number ?? invoice.id.slice(0, 14)}
                          </h3>
                          <Badge variant="outline" className="capitalize">
                            {invoice.status ?? 'unknown'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatShortDate(invoice.createdAt)}
                          {invoice.periodEnd
                            ? ` · through ${formatShortDate(invoice.periodEnd)}`
                            : ''}
                        </p>
                      </div>
                      <p className="font-mono text-base font-semibold tabular-nums">
                        {formatMoney(invoice.total, invoice.currency)}
                      </p>
                    </div>

                    <ul className="mt-3 space-y-1.5 border-t border-border/50 pt-3">
                      {(invoice.lines.length > 0 ? invoice.lines : [{ id: 'total', description: 'Invoice total', amount: invoice.total, currency: invoice.currency, quantity: 1 }])
                        .slice(0, 4)
                        .map((line) => (
                          <li
                            key={line.id}
                            className="flex items-start justify-between gap-3 text-xs"
                          >
                            <span className="min-w-0 truncate text-muted-foreground">
                              {line.description ?? 'Charge'}
                            </span>
                            <span className="shrink-0 font-mono tabular-nums text-foreground">
                              {formatMoney(line.amount, line.currency || invoice.currency)}
                            </span>
                          </li>
                        ))}
                      {invoice.lines.length > 4 ? (
                        <li className="text-xs text-muted-foreground">
                          +{invoice.lines.length - 4} more charges
                        </li>
                      ) : null}
                    </ul>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => onOpen(invoice)}
                      >
                        View charges
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => onPrint(invoice)}
                      >
                        <Printer className="size-3.5" aria-hidden />
                        Print
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => onEmail(invoice)}
                      >
                        <Mail className="size-3.5" aria-hidden />
                        Email
                      </Button>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

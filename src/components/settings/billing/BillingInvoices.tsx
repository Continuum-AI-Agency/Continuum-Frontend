import { ArrowUpRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Pill, PillIndicator } from '@/components/kibo-ui/pill';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { InvoiceRowView } from '@/lib/billing/billingViewModel';

// Stripe-hosted invoices, newest first as billing-api returns them. Receipts and PDFs live on
// Stripe's page; this list only links to them.

const STATUS_TONE: Record<string, 'success' | 'warning' | 'error' | 'info'> = {
  paid: 'success',
  open: 'warning',
  uncollectible: 'error',
  void: 'info',
};

export function BillingInvoices({ invoices }: { invoices: InvoiceRowView[] }) {
  const tUi = useTranslations('settings');
  const dateFormat = new Intl.DateTimeFormat(useLocale(), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  if (invoices.length === 0) {
    return <p className="text-sm text-muted-foreground">{tUi('m_b207228b5c')}</p>;
  }

  return (
    <Table aria-label={tUi('m_35f8f37b92')}>
      <TableHeader>
        <TableRow>
          <TableHead className="pl-0">{tUi('m_eb9a4bc1c0')}</TableHead>
          <TableHead className="hidden @[36rem]/settings-section:table-cell">
            {tUi('m_f9f38818c4')}
          </TableHead>
          <TableHead>{tUi('m_bae7d5be70')}</TableHead>
          <TableHead className="text-right">{tUi('m_43dc8532f7')}</TableHead>
          <TableHead className="pr-0">
            <span className="sr-only">{tUi('m_d0517071aa')}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((invoice) => (
          <TableRow key={invoice.id} data-testid="billing-invoice-row">
            <TableCell className="pl-0 tabular-nums">
              {dateFormat.format(new Date(invoice.createdAt))}
            </TableCell>
            <TableCell className="hidden font-mono text-xs text-muted-foreground @[36rem]/settings-section:table-cell">
              {invoice.label}
            </TableCell>
            <TableCell>
              <Pill>
                <PillIndicator variant={STATUS_TONE[invoice.status] ?? 'info'} />
                <span className="capitalize">{invoice.status}</span>
              </Pill>
            </TableCell>
            <TableCell className="text-right font-mono tabular-nums">
              {invoice.amountLabel}
            </TableCell>
            <TableCell className="pr-0 text-right">
              {invoice.href ? (
                <a
                  href={invoice.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-xs text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  {tUi('m_69bd4ef9fb')}
                  <ArrowUpRight className="size-3" aria-hidden />
                  <span className="sr-only">
                    {tUi('m_db675a2c87')}
                    {invoice.label}
                    {tUi('m_7f86ae77ef')}
                  </span>
                </a>
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

'use client';

import { useMemo, useState } from 'react';
import type { BillingInvoiceView } from '@continuum/billing-ui';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatMoney, formatShortDate } from './billingFormat';

type InvoiceEmailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: BillingInvoiceView | null;
  defaultSelfEmail?: string | null;
  brandName?: string | null;
};

function parseRecipients(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((part) => part.trim())
    .filter((part) => part.includes('@'));
}

export function InvoiceEmailDialog({
  open,
  onOpenChange,
  invoice,
  defaultSelfEmail,
  brandName,
}: InvoiceEmailDialogProps) {
  const [recipients, setRecipients] = useState(defaultSelfEmail ?? '');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const subject = useMemo(() => {
    if (!invoice) return 'Continuum invoice';
    const who = brandName ? `${brandName} ` : '';
    return `${who}invoice ${invoice.number ?? invoice.id}`;
  }, [brandName, invoice]);

  const body = useMemo(() => {
    if (!invoice) return '';
    const lines = [
      `Here is the Continuum invoice for this brand.`,
      ``,
      `Invoice: ${invoice.number ?? invoice.id}`,
      `Date: ${formatShortDate(invoice.createdAt)}`,
      `Status: ${invoice.status ?? 'unknown'}`,
      `Total: ${formatMoney(invoice.total, invoice.currency)}`,
      ``,
      ...(invoice.lines.length
        ? [
            'Charges:',
            ...invoice.lines.map(
              (line) =>
                `- ${line.description ?? 'Line'} · ${formatMoney(line.amount, line.currency || invoice.currency)}`,
            ),
            ``,
          ]
        : []),
      invoice.hostedInvoiceUrl ? `View invoice: ${invoice.hostedInvoiceUrl}` : '',
      invoice.invoicePdf ? `PDF: ${invoice.invoicePdf}` : '',
      note.trim() ? `` : '',
      note.trim() ? note.trim() : '',
      ``,
      'Sent from Continuum billing.',
    ];
    return lines.filter((line, index, arr) => !(line === '' && arr[index - 1] === '')).join('\n');
  }, [invoice, note]);

  const handleSend = () => {
    if (!invoice) return;
    const list = parseRecipients(recipients);
    if (list.length === 0) {
      setError('Add at least one email address.');
      return;
    }
    setError(null);
    const href = `mailto:${encodeURIComponent(list.join(','))}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;
    window.location.href = href;
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Email invoice</DialogTitle>
          <DialogDescription>
            Send this invoice to yourself or stakeholders. Opens your mail client with the invoice
            summary and Stripe link.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-1">
          <div className="grid gap-2">
            <Label htmlFor="invoice-recipients">Recipients</Label>
            <Input
              id="invoice-recipients"
              value={recipients}
              onChange={(event) => setRecipients(event.target.value)}
              placeholder="you@brand.com, finance@brand.com"
              autoComplete="email"
            />
            <p className="text-xs text-muted-foreground">Separate multiple addresses with commas.</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invoice-note">Optional note</Label>
            <Textarea
              id="invoice-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Please file this for Q3 close."
              rows={3}
            />
          </div>
          {invoice ? (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">
                {invoice.number ?? invoice.id} · {formatMoney(invoice.total, invoice.currency)}
              </p>
              <p className="mt-0.5">{formatShortDate(invoice.createdAt)}</p>
            </div>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSend}>
            Open email draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

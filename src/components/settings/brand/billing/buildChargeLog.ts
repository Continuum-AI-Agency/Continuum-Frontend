import type { BillingManagementModel } from '@continuum/billing-ui';
import { formatMoney, formatShortDate } from './billingFormat';
import { csvEscape } from './billingFormat';

export type ChargeLogRow = {
  kind: 'invoice_line' | 'credit_meter' | 'subscription';
  date: string;
  label: string;
  amountLabel: string;
  status: string;
  detail: string;
};

export function buildChargeLogRows(model: BillingManagementModel): ChargeLogRow[] {
  const rows: ChargeLogRow[] = [];
  const invoices = model.stripeAccount?.invoices ?? [];

  for (const invoice of invoices) {
    if (invoice.lines.length === 0) {
      rows.push({
        kind: 'invoice_line',
        date: invoice.createdAt,
        label: invoice.number ?? invoice.id,
        amountLabel: formatMoney(invoice.total, invoice.currency),
        status: invoice.status ?? 'unknown',
        detail: 'Invoice total',
      });
      continue;
    }
    for (const line of invoice.lines) {
      rows.push({
        kind: 'invoice_line',
        date: invoice.createdAt,
        label: line.description ?? invoice.number ?? invoice.id,
        amountLabel: formatMoney(line.amount, line.currency || invoice.currency),
        status: invoice.status ?? 'unknown',
        detail: `Invoice ${invoice.number ?? invoice.id}${
          line.quantity && line.quantity > 1 ? ` · qty ${line.quantity}` : ''
        }`,
      });
    }
  }

  for (const sub of model.stripeAccount?.subscriptions ?? []) {
    for (const item of sub.items) {
      rows.push({
        kind: 'subscription',
        date: sub.currentPeriodEnd ?? sub.currentPeriodStart ?? new Date().toISOString(),
        label: item.productName ?? item.catalogCode ?? item.priceId ?? sub.id,
        amountLabel:
          item.unitAmount != null && item.currency
            ? `${formatMoney(item.unitAmount * item.quantity, item.currency)}/${item.interval ?? 'mo'}`
            : '—',
        status: sub.status,
        detail: sub.cancelAtPeriodEnd ? 'Cancels at period end' : 'Active subscription line',
      });
    }
  }

  const usage = model.meteredUsage;
  rows.push({
    kind: 'credit_meter',
    date: usage.lastSpendAt ?? new Date().toISOString(),
    label: 'AI Studio credits balance',
    amountLabel: `${usage.creditsAvailable} credits left`,
    status: usage.health,
    detail: `Spent ${usage.spent7Days} (7d) · ${usage.spent30Days} (30d)`,
  });

  return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function chargeLogToCsv(model: BillingManagementModel): string {
  const rows = buildChargeLogRows(model);
  const header = ['kind', 'date', 'label', 'amount', 'status', 'detail'];
  const lines = [
    header.join(','),
    ...rows.map((row) =>
      [
        row.kind,
        formatShortDate(row.date),
        row.label,
        row.amountLabel,
        row.status,
        row.detail,
      ]
        .map((cell) => csvEscape(String(cell)))
        .join(','),
    ),
  ];
  return `${lines.join('\n')}\n`;
}

export function chargeLogToJson(model: BillingManagementModel): string {
  return `${JSON.stringify(
    {
      brandId: model.brandId,
      exportedAt: new Date().toISOString(),
      meteredUsage: model.meteredUsage,
      invoices: model.stripeAccount?.invoices ?? [],
      subscriptions: model.stripeAccount?.subscriptions ?? [],
      charges: buildChargeLogRows(model),
    },
    null,
    2,
  )}\n`;
}

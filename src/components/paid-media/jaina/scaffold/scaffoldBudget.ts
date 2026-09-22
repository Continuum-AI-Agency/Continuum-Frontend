import { formatCurrency } from '@/components/paid-media/optimizer/format';

/**
 * One ad set's opening budget as the card, the outline, the table and the graph node all
 * say it. Null is not zero: it means Jaina had no measured CPA and build will use the
 * Backend placeholder — a figure nobody derived, so it is named rather than priced.
 */
export const formatDailyBudget = (
  minorUnits: number | null | undefined,
  currency: string | null,
): string =>
  typeof minorUnits === 'number'
    ? `${formatCurrency(minorUnits / 100, currency)}/day`
    : 'Placeholder budget';

// A figure inside a block says which figure it is, the way a templated answer's figures do
// (`templates/Figure.tsx`): the raw value and its currency ride on the element, so a test or
// a parity bench checks the printed text against the value the Backend sent — never against
// the text itself.

import { normalizeCurrencyCode } from '@continuum/contracts';

export type BlockFigureAttributes = {
  'data-testid': 'figure';
  'data-figure-label': string;
  'data-figure-raw': string;
  'data-figure-currency': string;
};

export function blockFigureAttributes(
  label: string,
  value: number | string | null | undefined,
  currency: string | null | undefined,
): BlockFigureAttributes {
  const raw = typeof value === 'number' ? value : value == null ? Number.NaN : Number(value);
  return {
    'data-testid': 'figure',
    'data-figure-label': label,
    'data-figure-raw': Number.isFinite(raw) ? String(raw) : '',
    'data-figure-currency': normalizeCurrencyCode(currency) ?? 'none',
  };
}

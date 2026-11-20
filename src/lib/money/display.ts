// How money reads on a Performance+ screen, for every currency (M1, picked 2026-10-13):
// the currency's own symbol before the figure and its ISO code after it — "$85.47 MXN",
// "$85.47 USD", "€85.47 EUR". MXN and USD share "$", so the two spellings have the same shape
// and the same width, and the code says which one it is: a lone "$" never has to be guessed.
// A currency with no symbol of its own prints the code alone ("85.47 CHF" style); an unknown
// currency prints the bare figure, because a guessed "$" on a peso account misreads by ~20x.
//
// The symbol, the code and the sentence rule are @continuum/contracts' (optimization/money.ts),
// the same ones the Backend's prose and Jaina's prompt line follow, so a sentence the Backend
// wrote and the figure the screen prints beside it spell money one way. This file adds only what
// a screen needs on top: the parts (so a large figure can dim its symbol and code), the cell
// spelling for a column whose header names the code, and `splitMoney`, the inverse.

import { currencyGlyph, normalizeCurrencyCode } from '@continuum/contracts';
import type { UiLocale } from '@/i18n/config';

export { currencyGlyph };

/** The account's ISO code, or null when the value is not a usable one. Null is the answer,
 *  never a fallback: an unknown currency is not dollars. */
export const normalizeCurrency = normalizeCurrencyCode;

export type MoneyParts = {
  /** "-" or "". Stays outside the symbol: "-$25.54" reads as a debit, "$-25.54" as a typo. */
  sign: string;
  glyph: string | null;
  /** The formatted magnitude, grouping and decimals already applied ("1,091.85", "30.5K"). */
  body: string;
  code: string | null;
};

export function moneyParts(
  negative: boolean,
  body: string,
  currency: string | null | undefined,
): MoneyParts {
  const code = normalizeCurrency(currency);
  return { sign: negative ? '-' : '', glyph: code ? currencyGlyph(code) : null, body, code };
}

export function joinMoney({ sign, glyph, body, code }: MoneyParts): string {
  return `${sign}${glyph ?? ''}${body}${code ? ` ${code}` : ''}`;
}

/** The cell spelling for a table whose header already names the code: the symbol stays, the
 *  code moves up to the header ("CPL · MXN" over "$99.57"). */
export function joinMoneyInColumn(parts: MoneyParts): string {
  return joinMoney({ ...parts, code: null });
}

// Two decimals under 100 and none at or above: the digit rule `money()` in contracts follows,
// so "$25.54/day · $766/mo" multiplies back. Grouping stays; digits follow the UI locale.
export function formatCurrency(
  value: number | null | undefined,
  currency: string | null | undefined,
  locale: UiLocale = 'en',
): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return joinMoney(moneyParts(value < 0, digitRuleBody(value, locale), currency));
}

/** A table cell under a header that names the code ("CPL · MXN" over "$99.57"): the symbol
 *  stays, the code moves to the header. Stamp the node with `figureProps(…, 'header')`. */
export function formatCurrencyInColumn(
  value: number | null | undefined,
  currency: string | null | undefined,
  locale: UiLocale = 'en',
): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return joinMoneyInColumn(moneyParts(value < 0, digitRuleBody(value, locale), currency));
}

function digitRuleBody(value: number, locale: string): string {
  const digits = Math.abs(value) >= 100 ? 0 : 2;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Math.abs(value));
}

// Presentation only: preserve separators and compact suffixes; never parse or round the value.
const MONEY_TEXT =
  /^(-?)([^\d\s-]*)(\d(?:[\d.,\u00a0\u202f]*\d)?(?:[\u00a0\u202f ]?(?:[KMBT]|mil|mi|bi|tri))?)(?: ([A-Z]{3}))?$/;

/** The parts of a string `joinMoney` produced, or null when the text is not money (a count,
 *  a percent, "—"). Only text carrying a symbol or a code counts as money. */
export function splitMoney(text: string): MoneyParts | null {
  const match = MONEY_TEXT.exec(text);
  if (!match) return null;
  const [, sign = '', glyph = '', body = '', code] = match;
  if (!glyph && !code) return null;
  return { sign, glyph: glyph || null, body, code: code ?? null };
}

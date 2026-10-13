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

const MONEY_TEXT = /^(-?)([^\d\s-]*)(\d[\d,]*(?:\.\d+)?[KMBT]?)(?: ([A-Z]{3}))?$/;

/** The parts of a string `joinMoney` produced, or null when the text is not money (a count,
 *  a percent, "—"). Only text carrying a symbol or a code counts as money. */
export function splitMoney(text: string): MoneyParts | null {
  const match = MONEY_TEXT.exec(text);
  if (!match) return null;
  const [, sign = '', glyph = '', body = '', code] = match;
  if (!glyph && !code) return null;
  return { sign, glyph: glyph || null, body, code: code ?? null };
}

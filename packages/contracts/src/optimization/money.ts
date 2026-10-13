// Money in a sentence a person reads — the ONE rule for prose composed on the Backend, in
// the optimization engine, and by a model writing under a prompt.
//
// M1 (Ramiro, 2026-10-13): every known currency prints its own symbol BEFORE the figure and
// its ISO code AFTER it — "$85.47 MXN", "$85.47 USD", "€85.47 EUR". MXN and USD share "$", so
// the two spellings have the same shape and the code says which one it is: a lone "$" never
// has to be guessed. A currency with no symbol of its own prints the code alone ("85.47 CHF");
// an unknown currency prints the bare figure. This is the Frontend's screen rule
// (src/lib/money/display.ts: `moneyParts` / `joinMoney`, symbol from Intl narrowSymbol),
// mirrored exactly, so a figure inside a sentence and the figure printed beside it spell the
// same money the same way.
//
// AN UNKNOWN CURRENCY IS NOT DOLLARS. Every live ad account here once recorded a null
// currency and every one of them was Mexican, so a formatter that answers a missing code with
// "$" relabels pesos as dollars on a card a client reads (~20x off). Null prints the bare
// figure, "324" and not "$324".
//
// THE DIGIT RULE: two decimals under 100, none at or above it, en-US grouping.
// "$25.54/day · $766/mo" is the compiled card's spelling, and a sentence that says "$26/day"
// beside it is a sentence a reader multiplies and finds wrong.
//
// Never "currency units". A model handed a null currency once wrote "44.86 currency units"
// — its own workaround, and worse than the bare figure: it reads as a unit nobody has.

const ISO_CURRENCY = /^[A-Z]{3}$/;

/** The account's ISO code, or null when the value is not a usable one. Null is the answer,
 *  never a fallback — see the note at the top of this file. */
export function normalizeCurrencyCode(currency: string | null | undefined): string | null {
  const trimmed = (currency ?? '').trim().toUpperCase();
  return ISO_CURRENCY.test(trimmed) ? trimmed : null;
}

const glyphCache = new Map<string, string | null>();

/** The currency's narrow symbol ("$" for MXN and USD, "€", "R$"), or null when it has none
 *  that differs from its code ("CHF"). */
export function currencyGlyph(code: string): string | null {
  if (glyphCache.has(code)) return glyphCache.get(code) ?? null;
  let glyph: string | null = null;
  try {
    const part = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
    })
      .formatToParts(0)
      .find((p) => p.type === 'currency')?.value;
    glyph = part && part !== code && !ISO_CURRENCY.test(part) ? part : null;
  } catch {
    glyph = null;
  }
  glyphCache.set(code, glyph);
  return glyph;
}

/**
 * A money figure for a sentence: "$25.54 USD", "$25.54 MXN", "25.54 CHF", or the bare
 * "25.54" when the currency is unknown. A missing or non-finite value prints "—", exactly as
 * the Frontend does, so a template never has to guard the figure itself.
 */
export function formatMoney(
  value: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const code = normalizeCurrencyCode(currency);
  const digits = Math.abs(value) >= 100 ? 0 : 2;
  const body = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Math.abs(value));
  // The sign stays outside the symbol: "-$25.54" reads as a debit, "$-25.54" reads as a typo.
  const sign = value < 0 ? '-' : '';
  if (!code) return `${sign}${body}`;
  return `${sign}${currencyGlyph(code) ?? ''}${body} ${code}`;
}

/**
 * The same rule, in one sentence, for a prompt that lets a model write money. Every prompt
 * whose output reaches a screen verbatim carries this line, from here, so the rule a model
 * follows and the rule the code follows are one rule.
 */
export function moneyProseRule(currency: string | null | undefined): string {
  const code = normalizeCurrencyCode(currency);
  if (!code) {
    return (
      "Money: this account's currency is not known, so write every amount as the bare figure " +
      '("324", "25.54") — no currency symbol, no currency code, and never the words "currency units".'
    );
  }
  const glyph = currencyGlyph(code);
  if (!glyph) {
    return `Money: write every amount as the figure followed by the code ${code} ("324 ${code}", "25.54 ${code}") — never a currency symbol.`;
  }
  return (
    `Money: write every amount as "${glyph}" before the figure and the code ${code} after it ` +
    `("${glyph}324 ${code}", "${glyph}25.54 ${code}") — never the symbol without the code, never the code without the symbol.`
  );
}

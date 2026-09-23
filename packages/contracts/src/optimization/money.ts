// Money in a sentence a person reads — the ONE rule for prose composed on the Backend, in
// the optimization engine, and by a model writing under a prompt.
//
// AN UNKNOWN CURRENCY IS NOT DOLLARS. Every live ad account here records a null currency and
// every one of them is Mexican, so a formatter that answers a missing code with "$" relabels
// pesos as dollars on a card a client reads. The Frontend stopped doing that (its
// `formatCurrency` in components/paid-media/optimizer/format.ts): a code that is not a
// 3-letter ISO code prints the bare figure, "324" and not "$324"; USD keeps its symbol; any
// other code follows the figure, "324 MXN". Sentence BODIES arrived with the symbol already
// baked in — "$29.10 per lead", "CPP 14d $198" — because each template carried its own
// `$${x.toFixed(2)}`, so one card mixed the Frontend's bare "28.68/day" with the engine's
// "$198". This module is that Frontend rule, mirrored exactly, so a figure inside a sentence
// and the figure printed beside it cannot disagree about what money it is in.
//
// THE DIGIT RULE IS THE SAME ONE: two decimals under 100, none at or above it, en-US
// grouping. "$25.54/day · $766/mo" is the compiled card's spelling, and a sentence that says
// "$26/day" beside it is a sentence a reader multiplies and finds wrong.
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

/**
 * A money figure for a sentence: "$25.54", "25.54 MXN", or the bare "25.54" when the
 * currency is unknown. A missing or non-finite value prints "—", exactly as the Frontend's
 * `formatCurrency` does, so a template never has to guard the figure itself.
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
  // The sign stays outside the unit: "-$25.54" reads as a debit, "$-25.54" reads as a typo.
  const sign = value < 0 ? '-' : '';
  if (!code) return `${sign}${body}`;
  return code === 'USD' ? `${sign}$${body}` : `${sign}${body} ${code}`;
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
  if (code === 'USD') {
    return 'Money: write every amount as "$" followed by the figure ("$324", "$25.54").';
  }
  return `Money: write every amount as the figure followed by the code ${code} ("324 ${code}", "25.54 ${code}") — never a currency symbol.`;
}

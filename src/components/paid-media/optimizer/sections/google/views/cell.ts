// A figure as the Google views print it: its text, or "—" with the reason it is missing. A
// figure Google did not report is never a zero (presentation standard §5), and the reason is
// said once under the table it sits in (ReasonNotes).

export type Cell = { text: string; reason: null } | { text: '—'; reason: string };

export const shown = (text: string): Cell => ({ text, reason: null });
export const missing = (reason: string): Cell => ({ text: '—', reason });

/** The distinct reasons behind a set of "—", in the order they first appear. */
export function reasonsOf(cells: Iterable<Cell>): string[] {
  const reasons = new Set<string>();
  for (const cell of cells) if (cell.reason) reasons.add(cell.reason);
  return [...reasons];
}

/** A 0–1 share as a whole percent. Google reports "under 10%" as 0.0999 and "over 90%" as
 *  0.9001; those read as the bound Google means, not as a measured figure. */
export function shareText(share: number): string {
  if (share === 0.0999) return '<10%';
  if (share === 0.9001) return '>90%';
  return `${Math.round(share * 100)}%`;
}

/** Results with one decimal, as Google counts fractional conversions. */
export function resultsText(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

/** Said under a conversion figure when the account's goals name no single result. */
export const CONVERSIONS_NOT_COUNTED =
  "Conversions aren't counted on this account: its conversion goals name no single result";

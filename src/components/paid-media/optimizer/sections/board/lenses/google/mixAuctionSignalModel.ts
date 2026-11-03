// What the Google lenses G05 Mix, G06 Auction and G10 Signal share, without React: the Optimizer's
// account findings (P8, variant google_account_finding) and the figures they state, and shares and
// counts as the board prints them. A lens reads a finding by its stable keys (idea, bars, flags,
// numbers); a figure stated only in a fact is read under its label in either language the engine
// writes (@continuum/contracts boardCopy). Every sentence in the account's language is built there
// too: this surface ships English chrome only.

import type { PlatformCard } from '@continuum/contracts';

export type FindingCard = Extract<PlatformCard, { variant: 'google_account_finding' }>;
export type FindingIdea = FindingCard['idea'];

/** The account findings of one P8 idea among the account's pending cards, in card order. */
export function findingsOf(cards: readonly PlatformCard[], idea: FindingIdea): FindingCard[] {
  return cards.filter(
    (card): card is FindingCard => card.variant === 'google_account_finding' && card.idea === idea,
  );
}

/** The figure a finding states under any of `labels` (its English and Spanish wording), as the
 *  producer worded it; null when absent. */
export function factOf(card: FindingCard, labels: string | readonly string[]): string | null {
  const wanted: readonly string[] = typeof labels === 'string' ? [labels] : labels;
  return card.facts.find((fact) => wanted.includes(fact.label))?.value ?? null;
}

/**
 * The number a producer-worded figure leads with: "$10.09 MXN" → 10.09, "3461 (85%)" → 3461,
 * "$1,179 MXN/día" → 1179. Null when the words carry no number, so a figure the producer did not
 * state is never read as a zero.
 */
export function leadingNumber(text: string | null | undefined): number | null {
  const match = text?.match(/-?\d[\d,]*(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0].replaceAll(',', ''));
  return Number.isFinite(value) ? value : null;
}

/** A 0–1 share as a whole percent. A share that is not zero never prints as 0%, and one short of
 *  the whole never prints as 100%. */
export function shareLabel(share: number): string {
  if (share > 0 && share < 0.005) return '<1%';
  if (share < 1 && share > 0.995) return '>99%';
  return `${Math.round(share * 100)}%`;
}

/** A count as every screen prints it: whole, with thousands grouped ("4,051"). */
export function countLabel(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

const DAY_MS = 86_400_000;

/** The ISO day `days` after `day` (negative goes back). */
export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The row with the largest score; the first one wins a tie. Null for no rows. */
export function maxBy<T>(rows: readonly T[], score: (row: T) => number): T | null {
  let best: T | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    const value = score(row);
    if (value > bestScore) {
      best = row;
      bestScore = value;
    }
  }
  return best;
}

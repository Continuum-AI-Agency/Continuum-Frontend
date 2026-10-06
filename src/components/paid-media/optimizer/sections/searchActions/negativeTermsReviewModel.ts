// Which search terms a person keeps before the negatives are approved. Every term starts
// chosen — the producer already picked them — and the review only ever narrows the list.

export type ReviewTerm = {
  term: string;
  spend: number;
  clicks: number;
  conversions: number;
};

export function allChosen(terms: readonly ReviewTerm[]): ReadonlySet<string> {
  return new Set(terms.map((row) => row.term));
}

export function toggleTerm(chosen: ReadonlySet<string>, term: string): ReadonlySet<string> {
  const next = new Set(chosen);
  if (next.has(term)) next.delete(term);
  else next.add(term);
  return next;
}

/** The chosen terms in the card's own order, so the approval lists them as the table does. */
export function chosenTerms(terms: readonly ReviewTerm[], chosen: ReadonlySet<string>): string[] {
  return terms.filter((row) => chosen.has(row.term)).map((row) => row.term);
}

/** What the chosen terms spent: the money the negatives stop, over the card's window. */
export function chosenSpend(terms: readonly ReviewTerm[], chosen: ReadonlySet<string>): number {
  return terms.filter((row) => chosen.has(row.term)).reduce((sum, row) => sum + row.spend, 0);
}

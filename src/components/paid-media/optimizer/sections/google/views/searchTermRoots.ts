// The search-term explorer's model (P6 view 4): google_signals' search terms, Performance Max's
// included, grouped by root so 27k terms read as a few dozen themes; which terms a pending
// Optimizer card (G05 negatives, promote-to-keyword) already covers; and the question a free
// selection takes to Jaina. Nothing here writes: batch actions go only through those cards.

import type { GoogleSignalsRead, PlatformCard } from '@continuum/contracts';
import { SEARCH_TERM_STOPWORDS as STOPWORDS } from '@/lib/paid-media/searchTermStopwords';

type GoogleBlocks = NonNullable<NonNullable<GoogleSignalsRead['signals']>['google']>;
export type SearchTerm = NonNullable<GoogleBlocks['search_terms']>[number];

export type RootGroup = {
  root: string;
  /** By spend, most first. */
  terms: SearchTerm[];
  spend: number;
  clicks: number;
  conversions: number;
};

/** The read's search terms, or why it holds none to show. */
export function searchTermsOf(
  read: GoogleSignalsRead,
): { terms: SearchTerm[]; window: { since: string; until: string } } | { reason: string } {
  if (!read.signals) {
    return {
      reason: `The Google read came back incomplete${read.rejected.length ? `: ${read.rejected.join('; ')}` : ''}`,
    };
  }
  const terms = read.signals.google?.search_terms;
  if (!terms) {
    return {
      reason: read.skipped.read_failed_search_terms
        ? "Google's search-term read failed"
        : 'Search terms were not read for this account',
    };
  }
  return { terms, window: read.signals.window };
}

/** About 25 rows per table (standard §4); the rest is counted, not listed. */
export const ROOTS_SHOWN = 25;
export const TERMS_SHOWN = 25;


/** A term's meaningful words: lower case, no accents or punctuation, no stopwords, and a
 *  plural's final "s" dropped ("gimnasios" and "gimnasio" are one word). */
export function termWords(term: string): string[] {
  return term
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word))
    .map((word) =>
      word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word,
    );
}

/**
 * Each term joins the root of its word that the most terms share; a tie goes to the word that
 * comes first in the term. A term made only of stopwords is its own root.
 * ponytail: one-word roots by frequency; move to phrase clustering if roots read too coarse.
 */
export function groupByRoot(terms: readonly SearchTerm[]): RootGroup[] {
  const wordsOf = terms.map((term) => termWords(term.term));
  const termsPerWord = new Map<string, number>();
  for (const words of wordsOf) {
    for (const word of new Set(words)) termsPerWord.set(word, (termsPerWord.get(word) ?? 0) + 1);
  }
  const groups = new Map<string, RootGroup>();
  terms.forEach((term, index) => {
    const words = wordsOf[index] ?? [];
    const root =
      words.reduce<string | null>(
        (best, word) =>
          best === null || (termsPerWord.get(word) ?? 0) > (termsPerWord.get(best) ?? 0)
            ? word
            : best,
        null,
      ) ?? term.term.trim().toLowerCase();
    const group = groups.get(root) ?? { root, terms: [], spend: 0, clicks: 0, conversions: 0 };
    group.terms.push(term);
    group.spend += term.totals.spend;
    group.clicks += term.totals.clicks;
    group.conversions += term.totals.conversions;
    groups.set(root, group);
  });
  const out = [...groups.values()];
  for (const group of out) group.terms.sort((a, b) => b.totals.spend - a.totals.spend);
  return out.sort((a, b) => b.spend - a.spend);
}

/** One term in one place: the same words can be searched into two campaigns. */
export function termKey(term: SearchTerm): string {
  return `${term.campaign_id}:${term.ad_group_id ?? 'pmax'}:${term.term}`;
}

/** Performance Max reports its terms with no ad group and no status. */
export function isPmaxTerm(term: SearchTerm): boolean {
  return term.ad_group_id === null && term.status === null;
}

export type CardCover = 'negatives' | 'promote';

/** Terms a pending G05 card already proposes, by lower-cased term. */
export function termsInCards(cards: readonly PlatformCard[]): Map<string, CardCover> {
  const covered = new Map<string, CardCover>();
  for (const card of cards) {
    if (card.variant === 'google_negative_terms') {
      for (const entry of card.terms) covered.set(entry.term.trim().toLowerCase(), 'negatives');
    } else if (card.variant === 'google_promote_term') {
      covered.set(card.term.trim().toLowerCase(), 'promote');
    }
  }
  return covered;
}

/** At most this many terms are spelled out in a question to Jaina; the rest are counted. */
const PROMPT_TERMS = 30;

/** The question a free selection takes to Jaina: Jaina reads and proposes; nothing is changed
 *  from this page. */
export function jainaTermsPrompt(
  terms: readonly string[],
  window: { since: string; until: string },
): string {
  const distinct = [...new Set(terms)];
  const listed = distinct
    .slice(0, PROMPT_TERMS)
    .map((term) => `"${term}"`)
    .join(', ');
  const more = distinct.length > PROMPT_TERMS ? ` and ${distinct.length - PROMPT_TERMS} more` : '';
  return `Look at these Google Ads search terms from ${window.since} to ${window.until}: ${listed}${more}. Which should become negative keywords, which should become keywords, and which should stay as they are? Show spend, clicks and conversions for each.`;
}

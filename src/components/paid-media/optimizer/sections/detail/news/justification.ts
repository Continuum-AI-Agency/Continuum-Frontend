// The justification vocabulary: three layouts, one rule that picks between them.
//
// The complaint this exists to answer is that the figure was there and the ARGUMENT was
// not. A card that says "$120/day" has told a reader what, never why that number and not
// another. So every news card on this screen carries a justification block, and there are
// exactly three of them — a small vocabulary, reused, not a bespoke card per finding:
//
//   'arithmetic'  The pair IS the argument. Two figures and the operation between them:
//                 "$120 → $186 a day". Nothing is asserted that the pair does not contain.
//   'bounded'     A range with a point estimate inside it, and the thing that bounds it.
//                 A small number that is small FOR A REASON reads as weak until the reason
//                 is on the card next to it.
//   'open'        No point estimate exists. An ad set that bought nothing has no cost per
//                 result, so there is no centre to quote — the card says that rather than
//                 quoting a midpoint it does not hold.
//
// THE LAW: a card renders the model its own contents support. One with a real interval may
// not borrow the point-estimate layout, and one with no interval may not fake a bracket.
// That is why `pickJustification` reads the model and nothing else — not the module, not
// the detector, not a preference passed in from a caller.

import type { CandidateHeadline } from '@continuum/contracts';
import type { HeroCta } from '../heroModel';

export type JustificationModel = 'arithmetic' | 'bounded' | 'open';

/**
 * A range the card actually holds.
 *
 * `estimate` is nullable and the null is load-bearing: it is the difference between "between
 * $96 and $190, most likely $140" and "at least $96, and nothing above it can be ruled out".
 * The second is what zero conversions in a window really means.
 */
export type NewsInterval = {
  low: number;
  high: number;
  estimate: number | null;
  /** The line the interval is read against — "target" — or null when there is none. */
  referenceLabel: string | null;
  reference: number | null;
};

export type NewsCardModel = {
  id: string;
  /** The module in one word, above the card. */
  eyebrow: string;
  /** One sentence. The claim, as written — never regenerated here. */
  claim: string;
  /** A second, quieter sentence: the persisted reason. Null when the row has none. */
  reason: string | null;
  /**
   * The figure the card LEADS with, in the detector's own terms.
   *
   * Null when nothing the card holds can honestly lead — the card then leads with its
   * sentence. It does NOT fall back to leading with the money: money per day as a headline
   * is the framing this whole wave exists to remove.
   */
  headline: CandidateHeadline | null;
  /** The support line, always day · month, never the headline. Null when it would repeat it. */
  moneyPerDay: number | null;
  /**
   * The money the finding is worth per day, unsuppressed.
   *
   * Separate from `moneyPerDay` because the support LINE is hidden when it would only repeat
   * the headline, and the impact TIER still has to be read against the portfolio's daily
   * total. One value for reading, one for ranking — collapsing them silently drops the tier
   * off exactly the cards whose headline is already money.
   */
  impactPerDay: number | null;
  /** The formula behind the money, code-authored. */
  basis: string | null;
  /**
   * Why THIS and not the biggest number on the list.
   *
   * The brief requires it whenever the hero is not the highest-impact candidate, and a card
   * that drops it turns a deliberate choice into an unexplained one.
   */
  chosenOver: string | null;
  interval: NewsInterval | null;
  /**
   * Why the figure is smaller than the gap behind it, in words.
   *
   * A footnote in every model, never a selector: a cap explains a figure, it does not decide
   * how the figure is laid out.
   */
  cappedBy: string | null;
  cta: HeroCta | null;
};

/**
 * Which of the three a card gets, from what it holds.
 *
 * Order is a preference between things that are all true, not a fallback chain between
 * things that are progressively less so: when a card holds the pair, the pair is the
 * clearest possible argument and wins; a bounded range is the next clearest; and "there is
 * no point estimate" is a real finding, not the absence of one.
 */
export function pickJustification(card: {
  headline: CandidateHeadline | null;
  interval: NewsInterval | null;
}): JustificationModel {
  const headline = card.headline;
  if (headline && headline.from != null && headline.to != null) return 'arithmetic';
  if (card.interval && card.interval.estimate != null) return 'bounded';
  return 'open';
}

// ---------------------------------------------------------------------------
// Creative buckets — turn the labeller's free text into something a brief can
// reason from, and rank what is left by what it costs.
//
// THE PROBLEM THIS SOLVES, measured on a live account (brand 6f597f42, 30 days,
// value_stack/video/bof ads grouped by the labeller's `primaryTheme`):
//
//   Discounted trial offer            12 ads   $47.26 per conversation
//   Discounted Trial Offer             1 ad    $64.40
//   Promotion/Discount                10 ads   $35.11
//   Promotion and Discount             1 ad    $63.41
//   Affordability                      2 ads   $49.84
//   Affordability and ease of starting 5 ads   $36.29
//   ... 40-odd values at ~1.2 ads each
//
// The 4.5x spread across those rows is mostly BUCKETING NOISE. "Promotion/Discount"
// and "Promotion and Discount" are one idea the model wrote down twice; splitting
// them halves the evidence on both sides and invents a difference that is not there.
// Collapse them and the same data ranks cleanly, with sample sizes that survive a
// confidence interval:
//
//   incentive        5 ads  $19.62      affordability   23 ads  $30.81
//   trial offer     20 ads  $39.41      discount/promo  56 ads  $50.53
//
// -- which says the single biggest spend bucket is the second-worst performer.
// That sentence is a creative brief. Neither the raw rows nor a bigger sample
// could produce it; only the collapse could.
//
// DELIBERATELY DETERMINISTIC. No model, no embedding, no network. A brief that
// cites a bucket has to be reproducible from the same labels a month later, and a
// clustering that drifts with a model version would quietly re-rank history. The
// brand-scoped embedding store (brand_profiles.creative_concepts) is the richer
// home for this and is still empty; this is the pass that can fill it, because
// every cluster it makes can be replayed and checked by hand.
// ---------------------------------------------------------------------------

import { costInterval } from './significance';
import type { CpaInterval } from './types';

/** Words that carry no discriminating meaning in a marketing label. Kept small and
 *  domain-neutral on purpose: an aggressive stoplist merges ideas that differ. */
const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'or',
  'the',
  'of',
  'to',
  'for',
  'with',
  'in',
  'on',
  'at',
  'by',
  'from',
  'via',
  'based',
]);

/** Crude English singularisation. Only the endings that are unambiguous — 'ss' is
 *  left alone so "access" does not become "acces". */
function singularize(token: string): string {
  if (token.length <= 3) return token;
  if (token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.endsWith('ss')) return token;
  if (token.endsWith('s')) return token.slice(0, -1);
  return token;
}

/** The comparable token set of one raw label value. Lowercased, punctuation split
 *  (so "Promotion/Discount" and "Promotion and Discount" agree), stopworded and
 *  singularised. Order is discarded — these are labels, not sentences. */
export function labelTokens(raw: string): string[] {
  return [
    ...new Set(
      raw
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .split(' ')
        .filter((t) => t.length > 0 && !STOPWORDS.has(t))
        .map(singularize),
    ),
  ].sort();
}

/** A stable key for exact-after-normalisation matches. Two raw values with the same
 *  key are the same value written differently. */
export function canonicalKey(raw: string): string {
  return labelTokens(raw).join(' ');
}

/** Containment, NOT Jaccard. Jaccard punishes a length difference, so "Affordability"
 *  against "Affordability and ease of starting" scores 0.33 and the shorter spelling
 *  survives as its own thin bucket — the exact fragmentation this file exists to undo.
 *  Containment asks the question that actually matters: is the smaller label wholly
 *  inside the larger one? */
function containment(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  let shared = 0;
  for (const t of a) if (setB.has(t)) shared += 1;
  return shared / Math.min(a.length, b.length);
}

/** One input row: an ad's free-text label value plus what it cost. */
export type BucketItem = {
  adId: string;
  /** The raw label value (e.g. labels.primaryTheme). Null/empty is kept OUT of every
   *  bucket rather than pooled into "other" — an unlabelled ad is unknown, not a kind. */
  value: string | null | undefined;
  spend: number;
  events: number;
};

export type CreativeBucket = {
  /** Stable slug, derived from the canonical token set. Safe as a concept slug. */
  key: string;
  /** The most-funded raw spelling in the cluster — what a human recognises. */
  label: string;
  /** Every raw spelling that collapsed into this bucket, funded-first. Print these
   *  when the merge is surprising; a bucket that hides its members cannot be audited. */
  members: string[];
  adCount: number;
  spend: number;
  events: number;
  /** Cost per event with its Poisson interval. `cpa: 0` means no events — unknown. */
  interval: CpaInterval;
  /** True when this bucket's interval does NOT overlap the best bucket's. The only
   *  buckets a brief should contrast are separated ones. */
  separatedFromBest: boolean;
  /** Cleared the evidence floor (minSpend, and at least one event). An UNDER-evidenced
   *  bucket is reported in full but can never rank first and is never marked separated.
   *
   *  This is not a nicety. On a live account a bucket spelled "Descuento por tiempo
   *  limitado" took $6.11 of spend, produced one conversation, and by raw cost-per-event
   *  was the best-performing idea on the account by a factor of two. A brief that opened
   *  on it would be industrialising a single lucky impression. The standing RPC holds the
   *  same line with its own $25 / 1,000-impression floor. */
  evidenced: boolean;
};

export type RankBucketsOptions = {
  /** Containment above which two normalised values merge, where containment is
   *  shared / min(size). The default of 1 merges only a STRICT SUBSET: a spelling
   *  variant, or an elaboration that adds words without changing the idea
   *  ("Discounted trial offer" into "Discounted access/Trial offer").
   *
   *  It deliberately does NOT merge two distinct elaborations of a shared head —
   *  "Affordability and ease of starting" and "Affordability and habit formation"
   *  stay apart, because deciding those are one angle is a JUDGEMENT, not a string
   *  operation, and a wrong merge silently averages two different creatives into one
   *  recommendation. That judgement belongs to the brand-scoped concept store
   *  (brand_profiles.creative_concepts), which has embeddings and a merge chain that
   *  can be corrected. Lower this only when you have checked the members it fuses. */
  mergeThreshold?: number;
  /** Evidence floor. Buckets funded below this are reported in full but never rank
   *  first and are never marked separated — a $6 bucket with one conversion is not
   *  evidence however good its mean looks. Default 500. */
  minSpend?: number;
  z?: number;
};

/**
 * Cluster free-text label values and rank the clusters by cost per event.
 *
 * Clustering is two passes, both deterministic:
 *   1. exact match on the canonical token set  ("Promotion/Discount" == "Promotion and Discount")
 *   2. greedy containment merge, largest cluster first — a label wholly contained by
 *      another joins it ("Affordability" into "Affordability and ease of starting")
 *
 * Largest-first is what makes it replayable: seeded from the biggest cluster, the
 * result does not depend on input order.
 *
 * Ranking is cheapest-per-event first. A bucket with zero events sorts LAST and is
 * never marked separated — spending with no result is the worst outcome, but it is
 * not a measurement.
 */
export function rankCreativeBuckets(
  items: readonly BucketItem[],
  opts: RankBucketsOptions = {},
): CreativeBucket[] {
  const mergeThreshold = opts.mergeThreshold ?? 1;
  const minSpend = opts.minSpend ?? 500;
  const z = opts.z ?? 1.96;

  // --- pass 1: exact canonical match ---------------------------------------
  type Cluster = { tokens: string[]; raw: Map<string, number>; items: BucketItem[] };
  const byKey = new Map<string, Cluster>();
  for (const item of items) {
    const raw = (item.value ?? '').trim();
    if (raw === '') continue; // unlabelled is UNKNOWN, never a bucket
    const tokens = labelTokens(raw);
    if (tokens.length === 0) continue;
    const key = tokens.join(' ');
    let cluster = byKey.get(key);
    if (!cluster) {
      cluster = { tokens, raw: new Map(), items: [] };
      byKey.set(key, cluster);
    }
    cluster.raw.set(raw, (cluster.raw.get(raw) ?? 0) + item.spend);
    cluster.items.push(item);
  }

  // --- pass 2: greedy token-overlap merge, largest cluster first ------------
  const spendOf = (c: Cluster) => c.items.reduce((t, i) => t + i.spend, 0);
  const ordered = [...byKey.values()].sort((a, b) => {
    const d = spendOf(b) - spendOf(a);
    return d !== 0 ? d : a.tokens.join(' ') < b.tokens.join(' ') ? -1 : 1;
  });
  const merged: Cluster[] = [];
  for (const cluster of ordered) {
    const host = merged.find((m) => containment(m.tokens, cluster.tokens) >= mergeThreshold);
    if (host) {
      host.items.push(...cluster.items);
      for (const [raw, spend] of cluster.raw) {
        host.raw.set(raw, (host.raw.get(raw) ?? 0) + spend);
      }
    } else {
      merged.push({
        tokens: [...cluster.tokens],
        raw: new Map(cluster.raw),
        items: [...cluster.items],
      });
    }
  }

  // --- rank ----------------------------------------------------------------
  const buckets: CreativeBucket[] = merged.map((c) => {
    const spend = c.items.reduce((t, i) => t + i.spend, 0);
    const events = c.items.reduce((t, i) => t + i.events, 0);
    const members = [...c.raw.entries()]
      .sort((a, b) => (b[1] - a[1] !== 0 ? b[1] - a[1] : a[0] < b[0] ? -1 : 1))
      .map(([raw]) => raw);
    return {
      key: c.tokens.join('-'),
      label: members[0] ?? c.tokens.join(' '),
      members,
      adCount: c.items.length,
      spend,
      events,
      interval: costInterval(spend, events, z),
      separatedFromBest: false,
      evidenced: events > 0 && spend >= minSpend,
    };
  });

  buckets.sort((a, b) => {
    // Evidenced buckets first, so the head of the list is always something a brief may
    // safely cite. Then cheapest per event. Eventless buckets sort last of all.
    if (a.evidenced !== b.evidenced) return a.evidenced ? -1 : 1;
    const aHas = a.events > 0;
    const bHas = b.events > 0;
    if (aHas !== bHas) return aHas ? -1 : 1;
    if (!aHas) return b.spend - a.spend; // among the eventless, biggest waste first
    const d = a.interval.cpa - b.interval.cpa;
    return d !== 0 ? d : a.key < b.key ? -1 : 1;
  });

  // Separation is measured against the BEST EVIDENCED bucket, which is the one a brief
  // would ask for more of. Overlapping intervals mean "we cannot tell these apart yet".
  const best = buckets.find((b) => b.evidenced);
  if (best) {
    for (const b of buckets) {
      b.separatedFromBest = b !== best && b.evidenced && b.interval.lo > best.interval.hi;
    }
  }
  return buckets;
}

/** One-line evidence citations for a brief's `groundedOn`, newest arithmetic first.
 *  Every string is reconstructable from the bucket it came from — no adjectives. */
export function bucketCitations(buckets: readonly CreativeBucket[], limit = 4): string[] {
  return buckets
    .filter((b) => b.evidenced)
    .slice(0, limit)
    .map(
      (b) =>
        `${b.label}: ${b.interval.cpa.toFixed(2)} per event on ${b.spend.toFixed(0)} spend ` +
        `across ${b.adCount} ad${b.adCount === 1 ? '' : 's'} ` +
        `(95% CI ${b.interval.lo.toFixed(2)}-${b.interval.hi.toFixed(2)})`,
    );
}

// ---------------------------------------------------------------------------
// Apriori association-rule mining over creative attributes — a direct port of
// the legacy DCO's stats pipeline (services/stats/association-rules.js +
// the sample-size confidence bands from recommendation-engine.js). The DCO ran
// this statelessly per HTTP request and threw the output away; here it is
// staged as a pure module the service will run per portfolio over per-ad data
// (paid-media-metrics scope=ad_daily_trends + attribute tags) and persist.
//
// Division of labor vs creative_strategy_*: Gemini mines QUALITATIVE insights
// and produces the attribute TAGS (angle/hook/format); this module mines the
// statistically-supported attribute COMBINATIONS (support/confidence/lift)
// from quantitative per-ad performance. No content analysis is duplicated.
//
// STATUS: UNWIRED STUB (see rules/types.ts). Nothing calls this yet.
// ---------------------------------------------------------------------------

/** One ad (or ad set) with a performance score and its attribute tags.
 *  Attributes become items as `key:value` (e.g. `angle:social_proof`,
 *  `audience:prospecting`, `format:video`); empty values are skipped. */
export type MinableItem = {
  id: string;
  /** Any monotone "higher is better" score — spend-weighted events/$ fits the
   *  engine's idiom; the DCO used its Z-score composite. */
  score: number;
  attributes: Record<string, string | undefined>;
};

export type AssociationRule = {
  antecedent: string[];
  consequent: string[];
  support: number; // P(A ∧ B) among high performers
  confidence: number; // P(B | A)
  lift: number; // confidence / P(B) — > 1 means A pulls B above base rate
  interpretation: 'weak' | 'moderate' | 'strong' | 'very_strong';
};

export type MiningResult = {
  rules: AssociationRule[];
  /** How many high performers the itemsets came from — the DCO's sample-size
   *  confidence banding (>=30 high, >=10 medium, else low). */
  sampleSize: number;
  confidenceBand: 'high' | 'medium' | 'low';
};

/** DCO quantile (linear interpolation between closest ranks). */
export function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

/** DCO generateItemsets: keep items at/above the score percentile, convert
 *  each to its `key:value` attribute set. */
export function generateItemsets(items: MinableItem[], percentileThreshold = 0.7): string[][] {
  if (items.length === 0) return [];
  const threshold = quantile(
    items.map((i) => i.score),
    percentileThreshold,
  );
  return items
    .filter((i) => i.score >= threshold)
    .map((i) =>
      Object.entries(i.attributes)
        .filter(([, v]) => Boolean(v))
        .map(([k, v]) => `${k}:${v}`),
    );
}

const support = (itemset: string[], transactions: string[][]): number => {
  if (transactions.length === 0) return 0;
  let count = 0;
  for (const t of transactions) {
    const tSet = new Set(t);
    if (itemset.every((i) => tSet.has(i))) count += 1;
  }
  return count / transactions.length;
};

export function interpretLift(lift: number): AssociationRule['interpretation'] {
  if (lift >= 2.0) return 'very_strong';
  if (lift >= 1.5) return 'strong';
  if (lift >= 1.2) return 'moderate';
  return 'weak';
}

export function confidenceBand(sampleSize: number): MiningResult['confidenceBand'] {
  if (sampleSize >= 30) return 'high';
  if (sampleSize >= 10) return 'medium';
  return 'low';
}

/**
 * DCO simplified Apriori: frequent single items -> all 2-item directed rules
 * passing minSupport/minConfidence with lift > 1, sorted by lift descending.
 */
export function apriori(
  itemsets: string[][],
  minSupport = 0.3,
  minConfidence = 0.6,
): AssociationRule[] {
  if (itemsets.length === 0) return [];

  const itemCounts: Record<string, number> = {};
  for (const itemset of itemsets) {
    for (const item of itemset) {
      itemCounts[item] = (itemCounts[item] ?? 0) + 1;
    }
  }
  const frequentItems = Object.keys(itemCounts).filter(
    (item) => itemCounts[item] / itemsets.length >= minSupport,
  );

  const rules: AssociationRule[] = [];
  for (let i = 0; i < frequentItems.length; i++) {
    for (let j = i + 1; j < frequentItems.length; j++) {
      const itemA = frequentItems[i];
      const itemB = frequentItems[j];
      const supportA = support([itemA], itemsets);
      const supportB = support([itemB], itemsets);
      const supportAB = support([itemA, itemB], itemsets);
      if (supportAB === 0) continue;

      const confidenceAB = supportAB / supportA;
      const liftAB = confidenceAB / supportB;
      if (confidenceAB >= minConfidence && liftAB > 1.0) {
        rules.push({
          antecedent: [itemA],
          consequent: [itemB],
          support: supportAB,
          confidence: confidenceAB,
          lift: liftAB,
          interpretation: interpretLift(liftAB),
        });
      }

      const confidenceBA = supportAB / supportB;
      const liftBA = confidenceBA / supportA;
      if (confidenceBA >= minConfidence && liftBA > 1.0) {
        rules.push({
          antecedent: [itemB],
          consequent: [itemA],
          support: supportAB,
          confidence: confidenceBA,
          lift: liftBA,
          interpretation: interpretLift(liftBA),
        });
      }
    }
  }

  return rules.sort((a, b) => b.lift - a.lift);
}

/** Convenience wrapper: itemsets from high performers -> mined rules + banding. */
export function mineCreativeCombos(
  items: MinableItem[],
  opts: { percentileThreshold?: number; minSupport?: number; minConfidence?: number } = {},
): MiningResult {
  const itemsets = generateItemsets(items, opts.percentileThreshold ?? 0.7);
  return {
    rules: apriori(itemsets, opts.minSupport ?? 0.3, opts.minConfidence ?? 0.6),
    sampleSize: itemsets.length,
    confidenceBand: confidenceBand(itemsets.length),
  };
}

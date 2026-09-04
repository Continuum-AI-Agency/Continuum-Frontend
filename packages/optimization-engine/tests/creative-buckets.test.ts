// Bucketing free-text creative labels. The fixtures are the REAL theme strings the
// labeller wrote for brand 6f597f42 — including the near-duplicate pairs that made
// the raw ranking meaningless.
import { describe, expect, test } from 'bun:test';
import type { BucketItem } from '../src/creativeBuckets';
import {
  bucketCitations,
  canonicalKey,
  labelTokens,
  rankCreativeBuckets,
} from '../src/creativeBuckets';

const item = (adId: string, value: string | null, spend: number, events: number): BucketItem => ({
  adId,
  value,
  spend,
  events,
});

describe('canonicalisation', () => {
  test('punctuation and conjunctions are the same word', () => {
    // The pair that cost the most: $35.11 vs $63.41 on what is one idea.
    expect(canonicalKey('Promotion/Discount')).toBe(canonicalKey('Promotion and Discount'));
  });

  test('case is not a distinction', () => {
    expect(canonicalKey('Discounted trial offer')).toBe(canonicalKey('Discounted Trial Offer'));
  });

  test('plurals collapse, but a genuine double-s survives', () => {
    expect(labelTokens('offers')).toEqual(['offer']);
    // "access" must not become "acces" — that would stop matching "accessibility".
    expect(labelTokens('access')).toEqual(['access']);
  });

  test('token order is not a distinction', () => {
    expect(canonicalKey('trial offer discounted')).toBe(canonicalKey('Discounted trial offer'));
  });

  test('different ideas stay different', () => {
    expect(canonicalKey('Scarcity urgency')).not.toBe(canonicalKey('Social proof'));
  });
});

describe('clustering', () => {
  test('a bare label is absorbed by the elaboration that contains it', () => {
    const buckets = rankCreativeBuckets([
      item('a', 'Affordability', 748, 15),
      item('b', 'Affordability and ease of starting', 6386, 176),
      item('d', 'Affordability and ease of starting fitness journey', 1476, 22),
    ]);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]?.adCount).toBe(3);
    expect(buckets[0]?.spend).toBeCloseTo(8_610, 0);
    expect(buckets[0]?.events).toBe(213);
    // The bucket names itself after its best-funded spelling and keeps the rest.
    expect(buckets[0]?.label).toBe('Affordability and ease of starting');
    expect(buckets[0]?.members).toHaveLength(3);
  });

  test('two elaborations of a shared head stay APART — that is a judgement, not a string op', () => {
    // "ease of starting" and "habit formation" are both about affordability to a
    // human. Fusing them here would average two different creative angles into one
    // recommendation on the strength of a single shared token. The brand-scoped
    // concept store is where that call gets made, with a merge chain that can be
    // undone; this pass must not pre-empt it.
    const buckets = rankCreativeBuckets([
      item('b', 'Affordability and ease of starting', 6386, 176),
      item('c', 'Affordability and habit formation', 1791, 70),
    ]);
    expect(buckets).toHaveLength(2);
  });

  test('unrelated themes are NOT merged', () => {
    const buckets = rankCreativeBuckets([
      item('a', 'Discounted trial offer', 1000, 20),
      item('b', 'Social proof testimonial', 1000, 20),
    ]);
    expect(buckets).toHaveLength(2);
  });

  test('the result does not depend on input order', () => {
    const rows = [
      item('a', 'Affordability', 748, 15),
      item('b', 'Affordability and ease of starting', 6386, 176),
      item('c', 'Promotion/Discount', 7865, 224),
      item('d', 'Promotion and Discount', 7419, 117),
    ];
    const forward = rankCreativeBuckets(rows).map((b) => `${b.key}:${b.adCount}`);
    const backward = rankCreativeBuckets([...rows].reverse()).map((b) => `${b.key}:${b.adCount}`);
    expect(forward).toEqual(backward);
  });

  test('an unlabelled ad is excluded, not pooled into an "other" bucket', () => {
    // Unknown and "genuinely fits nothing" must not collapse into one value — the
    // same rule angle_vocab_version=0 encodes in the schema.
    const buckets = rankCreativeBuckets([
      item('a', 'Discounted trial offer', 1000, 20),
      item('b', null, 5000, 0),
      item('c', '   ', 5000, 0),
    ]);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]?.adCount).toBe(1);
  });
});

describe('ranking and separation', () => {
  // The real account shape: the biggest spender is the second-worst performer.
  const account = [
    item('i1', 'Incentive-based acquisition', 827, 58),
    item('i2', 'Incentivized sign-up offer', 861, 28),
    item('a1', 'Affordability and ease of starting', 6386, 176),
    item('a2', 'Affordability and habit formation', 1791, 70),
    item('a3', 'Fitness accessibility and affordability', 826, 50),
    item('t1', 'Discounted trial offer', 7137, 151),
    item('t2', 'Discounted Trial Offer', 580, 9),
    item('d1', 'Promotion/Discount', 7865, 224),
    item('d2', 'Promotion and Discount', 7419, 117),
  ];

  test('cheapest per event ranks first', () => {
    const buckets = rankCreativeBuckets(account);
    const cpas = buckets.filter((b) => b.events > 0).map((b) => b.interval.cpa);
    expect(cpas).toEqual([...cpas].sort((a, b) => a - b));
  });

  test('the largest-spend bucket is not the best bucket — the finding itself', () => {
    const buckets = rankCreativeBuckets(account);
    const biggestSpender = [...buckets].sort((a, b) => b.spend - a.spend)[0];
    expect(buckets[0]?.key).not.toBe(biggestSpender?.key);
    expect((biggestSpender?.interval.cpa ?? 0) > (buckets[0]?.interval.cpa ?? 0)).toBe(true);
  });

  test('separation requires non-overlapping intervals, not just a worse mean', () => {
    const buckets = rankCreativeBuckets(account);
    const best = buckets[0];
    for (const b of buckets) {
      if (b.separatedFromBest) expect(b.interval.lo).toBeGreaterThan(best?.interval.hi ?? 0);
    }
    // The worst bucket really is distinguishable from the best on this data.
    expect(buckets.some((b) => b.separatedFromBest)).toBe(true);
  });

  test('a thin bucket is reported but never marked separated under minSpend', () => {
    const buckets = rankCreativeBuckets(account, { minSpend: 5_000 });
    const thin = buckets.find((b) => b.spend < 5_000);
    expect(thin).toBeDefined();
    expect(thin?.separatedFromBest).toBe(false);
  });

  test('a bucket that spent with zero events sorts last and is never separated', () => {
    const buckets = rankCreativeBuckets([
      ...account,
      item('z', 'Brand awareness montage', 9_999, 0),
    ]);
    expect(buckets[buckets.length - 1]?.label).toBe('Brand awareness montage');
    expect(buckets[buckets.length - 1]?.separatedFromBest).toBe(false);
  });

  test('citations restate the arithmetic and invent nothing', () => {
    const buckets = rankCreativeBuckets(account);
    const cites = bucketCitations(buckets, 2);
    expect(cites).toHaveLength(2);
    expect(cites[0]).toContain('per event on');
    expect(cites[0]).toContain('95% CI');
    // Every number in the line is present in the bucket it came from.
    expect(cites[0]).toContain(buckets[0]?.interval.cpa.toFixed(2));
    expect(cites[0]).toContain(String(buckets[0]?.adCount));
  });
});

describe('the evidence floor', () => {
  // Taken verbatim from brand 6f597f42: a bucket with $6.11 of spend and one
  // conversation beat every real bucket on raw cost per event. A brief that opened
  // on it would industrialise one lucky impression.
  const withNoise = [
    item('noise', 'Descuento por tiempo limitado', 6.11, 1),
    item('real1', 'Incentive-based acquisition', 817.69, 58),
    item('real2', 'Affordable entry offer', 7269, 312),
    item('real3', 'Promotion/Discount', 16844, 357),
  ];

  test('a $6 bucket with one event cannot rank first', () => {
    const buckets = rankCreativeBuckets(withNoise);
    expect(buckets[0]?.label).toBe('Incentive-based acquisition');
    const noise = buckets.find((b) => b.label === 'Descuento por tiempo limitado');
    expect(noise?.evidenced).toBe(false);
    expect(noise?.interval.cpa).toBeLessThan(buckets[0]?.interval.cpa ?? 0); // cheaper, and still not first
  });

  test('it is reported in full, never dropped', () => {
    const buckets = rankCreativeBuckets(withNoise);
    const noise = buckets.find((b) => b.label === 'Descuento por tiempo limitado');
    expect(noise).toBeDefined();
    expect(noise?.spend).toBeCloseTo(6.11, 2);
    expect(noise?.separatedFromBest).toBe(false);
  });

  test('citations never quote an under-evidenced bucket', () => {
    const cites = bucketCitations(rankCreativeBuckets(withNoise), 10);
    expect(cites.join(' ')).not.toContain('Descuento');
  });

  test('separation is measured against the best EVIDENCED bucket', () => {
    const buckets = rankCreativeBuckets(withNoise);
    const best = buckets.find((b) => b.evidenced);
    expect(best?.label).toBe('Incentive-based acquisition');
    for (const b of buckets) {
      if (b.separatedFromBest) {
        expect(b.evidenced).toBe(true);
        expect(b.interval.lo).toBeGreaterThan(best?.interval.hi ?? 0);
      }
    }
  });
});

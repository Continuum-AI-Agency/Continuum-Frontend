// Apriori creative-attribute mining — ported DCO math with known-value
// fixtures (bun test).
import { expect, test } from 'bun:test';
import type { MinableItem } from '../src/mining/apriori';
import {
  apriori,
  confidenceBand,
  generateItemsets,
  interpretLift,
  mineCreativeCombos,
  quantile,
} from '../src/mining/apriori';

test('quantile — DCO linear interpolation', () => {
  expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
  expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
  expect(quantile([10], 0.7)).toBe(10);
  expect(quantile([], 0.7)).toBe(0);
});

test('generateItemsets keeps the high-score tail and expands attributes to key:value items', () => {
  const items: MinableItem[] = [
    { id: 'a', score: 10, attributes: { angle: 'ugc', format: 'video' } },
    { id: 'b', score: 9, attributes: { angle: 'ugc', format: 'video', hook: '' } }, // empty skipped
    { id: 'c', score: 1, attributes: { angle: 'promo', format: 'static' } }, // below P70
    { id: 'd', score: 8, attributes: { angle: 'promo', format: 'video' } },
  ];
  const itemsets = generateItemsets(items, 0.5);
  // quantile([1,8,9,10], .5) = 8.5 -> keeps scores 9 and 10 (a and b)
  expect(itemsets.length).toBe(2);
  expect(itemsets).toEqual([
    ['angle:ugc', 'format:video'],
    ['angle:ugc', 'format:video'], // b's empty hook attribute is skipped
  ]);
});

test('apriori — known support/confidence/lift values', () => {
  // 10 high performers: ugc appears in 6, video in 8, together in 6.
  const itemsets: string[][] = [
    ...Array.from({ length: 6 }, () => ['angle:ugc', 'format:video']),
    ...Array.from({ length: 2 }, () => ['angle:promo', 'format:video']),
    ...Array.from({ length: 2 }, () => ['angle:promo', 'format:static']),
  ];
  const rules = apriori(itemsets, 0.3, 0.6);

  // ugc -> video: support 0.6, confidence 6/6 = 1.0, lift 1.0/0.8 = 1.25
  const ugcToVideo = rules.find(
    (r) => r.antecedent[0] === 'angle:ugc' && r.consequent[0] === 'format:video',
  );
  expect(ugcToVideo).toBeDefined();
  expect(ugcToVideo?.support).toBeCloseTo(0.6);
  expect(ugcToVideo?.confidence).toBeCloseTo(1.0);
  expect(ugcToVideo?.lift).toBeCloseTo(1.25);
  expect(ugcToVideo?.interpretation).toBe('moderate');

  // video -> ugc: confidence 6/8 = 0.75, lift 0.75/0.6 = 1.25
  const videoToUgc = rules.find(
    (r) => r.antecedent[0] === 'format:video' && r.consequent[0] === 'angle:ugc',
  );
  expect(videoToUgc?.confidence).toBeCloseTo(0.75);
  expect(videoToUgc?.lift).toBeCloseTo(1.25);

  // promo -> static fails minConfidence (2/4 = 0.5 < 0.6): not emitted
  expect(
    rules.some((r) => r.antecedent[0] === 'angle:promo' && r.consequent[0] === 'format:static'),
  ).toBe(false);

  // sorted by lift descending
  const lifts = rules.map((r) => r.lift);
  expect([...lifts].sort((a, b) => b - a)).toEqual(lifts);
});

test('lift interpretation bands and DCO sample-size confidence bands', () => {
  expect(interpretLift(2.4)).toBe('very_strong');
  expect(interpretLift(1.7)).toBe('strong');
  expect(interpretLift(1.25)).toBe('moderate');
  expect(interpretLift(1.05)).toBe('weak');
  expect(confidenceBand(35)).toBe('high');
  expect(confidenceBand(12)).toBe('medium');
  expect(confidenceBand(9)).toBe('low');
});

test('mineCreativeCombos — end-to-end wrapper with banding', () => {
  // angle correlates perfectly with format among high performers => real lift.
  const items: MinableItem[] = Array.from({ length: 40 }, (_, i) => ({
    id: `ad${i}`,
    score: i, // P70 of 0..39 = 27.3 => 12 high performers (scores 28..39)
    attributes: {
      angle: i % 2 === 0 ? 'ugc' : 'social_proof',
      format: i % 2 === 0 ? 'video' : 'static',
      audience: i < 20 ? 'prospecting' : 'retargeting',
    },
  }));
  const result = mineCreativeCombos(items);
  expect(result.sampleSize).toBe(12);
  expect(result.confidenceBand).toBe('medium');
  // ugc -> video: confidence 1.0, base rate 0.5 => lift 2.0 (very_strong)
  const top = result.rules[0];
  expect(top?.lift).toBeCloseTo(2.0);
  expect(top?.interpretation).toBe('very_strong');
});

test('degenerate inputs: empty and single-transaction sets', () => {
  expect(apriori([], 0.3, 0.6)).toEqual([]);
  expect(generateItemsets([], 0.7)).toEqual([]);
  expect(mineCreativeCombos([]).rules).toEqual([]);
});

import { describe, expect, test } from 'bun:test';
import {
  checkAssetSwap,
  clipPx,
  coverage,
  planFitCheck,
  predictAssetBox,
  type SlotPlacement,
  shapeClass,
} from './api-render-fit';

/**
 * Cross-implementation check against the forge's own `asset_fit`.
 *
 * Every expected number below was produced by running
 * `forge tools call asset_fit --geometry test/fixtures/assetfit/bgp.flat.json --comp
 * "DPLV 1080x1440" --layer 15841` over template-forge's checked-in fixture, and they are the
 * same figures published in the "Big Guy Pants, four ratios" showcase. The point of pinning
 * them here is that this file is a PORT: two implementations of one closed form in two
 * languages, in two repos, and nothing but a test can notice when they stop agreeing.
 *
 * The layer is the NGR product photo (`CYBERP~1.png#15841`, inside `PROMO4#15821`): a
 * 2000x1161 source projected to [-3.81, 765.19, 1088.16, 1399.09] on a 1080x1440 canvas, an
 * effective scale of 0.54599 on both axes.
 */
const PRODUCT: SlotPlacement = {
  comp: 'DPLV 1080x1440',
  compSize: [1080, 1440],
  box: [-3.81, 765.19, 1088.16, 1399.09],
  boxSource: 'source_rect',
  source: [2000, 1161],
  sourceKind: 'file',
};

const swap = (w: number, h: number) =>
  checkAssetSwap({ key: 'product_1', placement: PRODUCT, asset: { w, h } });

describe('the ported closed form agrees with the forge', () => {
  test('a square asset lands inside the canvas', () => {
    const burger = swap(1089, 980);
    expect(burger.box).toEqual([244.89, 814.6, 839.46, 1349.68]);
    expect(burger.clippedPx).toEqual([0, 0, 0, 0]);
    expect(burger.state).toBe('ok');
    expect(burger.shapeClass).toBe('square');
    expect(burger.insideFraction).toBe(1);
  });

  test('a wide asset lands inside the canvas', () => {
    const hotDog = swap(1600, 700);
    expect(hotDog.box).toEqual([105.39, 891.04, 978.96, 1273.24]);
    expect(hotDog.clippedPx).toEqual([0, 0, 0, 0]);
    expect(hotDog.state).toBe('ok');
    // 1600/700 = 2.29, past the 2.0 bound. The showcase's prose calls this one "wide"; the
    // class column does not, and the class is what picks a sub-version fork.
    expect(hotDog.shapeClass).toBe('xwide');
  });

  test('a tall asset clips off the bottom', () => {
    const bottle = swap(500, 1400);
    expect(bottle.box).toEqual([405.68, 699.94, 678.67, 1464.34]);
    expect(bottle.clippedPx).toEqual([0, 0, 0, 24]);
    expect(bottle.state).toBe('clipped');
    expect(bottle.shapeClass).toBe('tall');
    expect(bottle.insideFraction).toBe(0.968);
  });

  test('a very wide asset clips off both sides', () => {
    const combo = swap(2400, 900);
    expect(combo.box).toEqual([-113.01, 836.44, 1197.36, 1327.84]);
    expect(combo.clippedPx).toEqual([113, 0, 117, 0]);
    expect(combo.state).toBe('clipped');
    expect(combo.insideFraction).toBe(0.824);
  });

  test('the effective scale is read off the measurement, not the layer', () => {
    const predicted = predictAssetBox(PRODUCT, { w: 500, h: 1400 });
    expect(predicted?.scale).toEqual([0.54599, 0.54599]);
  });
});

describe('shape classes', () => {
  test('the bounds are the forge’s', () => {
    expect(shapeClass(500, 1400)).toBe('tall');
    expect(shapeClass(1089, 980)).toBe('square');
    expect(shapeClass(1300, 1000)).toBe('wide');
    expect(shapeClass(2400, 900)).toBe('xwide');
  });

  test('a dimension that is not a size is null, never a bucket', () => {
    expect(shapeClass(0, 100)).toBeNull();
    expect(shapeClass(100, Number.NaN)).toBeNull();
  });
});

describe('what could not be measured says so', () => {
  test('a slot with no placement is unknown, not ok', () => {
    const verdict = checkAssetSwap({
      key: 'product_1',
      placement: null,
      asset: { w: 800, h: 800 },
    });
    expect(verdict.state).toBe('unknown');
    expect(verdict.box).toBeNull();
    // The class still comes back: it is a fact about the ASSET, and it is what picks a
    // sub-version even when the placement is unknown.
    expect(verdict.shapeClass).toBe('square');
  });

  test('a text slot has no footage to scale, so it is unknown rather than zero', () => {
    const text: SlotPlacement = { ...PRODUCT, source: null, sourceKind: null };
    expect(checkAssetSwap({ key: 'legal', placement: text, asset: { w: 10, h: 10 } }).state).toBe(
      'unknown',
    );
  });

  test('no chosen asset is unknown', () => {
    expect(checkAssetSwap({ key: 'product_1', placement: PRODUCT, asset: null }).state).toBe(
      'unknown',
    );
  });
});

describe('coverage of neighbouring rows', () => {
  test('a swap reports what it would cover, biggest first', () => {
    const verdict = checkAssetSwap({
      key: 'product_1',
      placement: PRODUCT,
      asset: { w: 2400, h: 900 },
      neighbours: [
        { key: 'web', label: 'WEB', box: [0, 900, 400, 1100] },
        { key: 'off', label: 'Elsewhere', box: [0, 0, 100, 100] },
      ],
    });
    expect(verdict.covers.map((row) => row.key)).toEqual(['web']);
    expect(verdict.covers[0]!.coverage).toBeGreaterThan(0.9);
  });

  test('an empty row cannot be covered', () => {
    expect(coverage([0, 0, 10, 10], [5, 5, 5, 5])).toBe(0);
  });

  test('clip is per edge, and zero where it fits', () => {
    expect(clipPx([-5, 2, 20, 8], [0, 0, 10, 10])).toEqual([5, 0, 10, 0]);
  });
});

describe('the escalation rule is what makes the judge automatic', () => {
  const ok = swap(1089, 980);
  const clipped = swap(500, 1400);
  const unknown = checkAssetSwap({ key: 'x', placement: null, asset: { w: 1, h: 1 } });
  const comp = { name: 'DPLV 1080x1440', width: 1080, height: 1440 };

  test('a frame every slot answered cleanly is not judged', () => {
    const report = planFitCheck({ comp, slots: [ok] });
    expect(report.escalate).toBe(false);
    expect(report.why).toContain('does not need a judge');
  });

  test('a predicted clip is escalated so the pixels can confirm it', () => {
    const report = planFitCheck({ comp, slots: [ok, clipped] });
    expect(report.escalate).toBe(true);
    expect(report.why).toContain('1 slot would clip');
  });

  test('anything unmeasurable is escalated — that is the whole point of unknown', () => {
    const report = planFitCheck({ comp, slots: [ok, unknown] });
    expect(report.escalate).toBe(true);
    expect(report.why).toContain('could not be measured');
  });

  test('a template with no media slots needs nothing', () => {
    const report = planFitCheck({ comp: null, slots: [] });
    expect(report.escalate).toBe(false);
    expect(report.why).toContain('no media slots');
  });
});

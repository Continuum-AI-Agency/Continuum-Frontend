import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { brandReportResultSchema } from './brand-report';
import { READINESS_DIMENSIONS, readinessEvidenceSource } from './readiness';
import {
  READINESS_CRITERIA,
  READINESS_DIMENSION_WEIGHTS,
  readinessCriteriaFor,
  readinessOverall,
} from './readiness-criteria';

// Walks a dotted path through the brand report schema, unwrapping
// optional/nullable/default/pipe/array layers, so a target_field that names no
// real brand-book field fails here instead of rendering a dead CTA.
function resolvesInBrandReport(path: string): boolean {
  let node: z.ZodType = brandReportResultSchema;
  for (const key of path.split('.')) {
    const shape = objectShape(node);
    const next = shape?.[key];
    if (!next) return false;
    node = next;
  }
  return true;
}

function objectShape(schema: z.ZodType): Record<string, z.ZodType> | null {
  let node: z.ZodType = schema;
  for (let depth = 0; depth < 10; depth += 1) {
    if (node instanceof z.ZodObject) return node.shape as Record<string, z.ZodType>;
    const def = (node as unknown as { def: Record<string, unknown> }).def;
    const inner = (def.innerType ?? def.out ?? def.element) as z.ZodType | undefined;
    if (!inner) return null;
    node = inner;
  }
  return null;
}

describe('READINESS_CRITERIA', () => {
  test('every dimension has 4-6 criteria whose integer weights sum to 100', () => {
    for (const dimension of READINESS_DIMENSIONS) {
      const criteria = readinessCriteriaFor(dimension);
      expect(criteria.length).toBeGreaterThanOrEqual(4);
      expect(criteria.length).toBeLessThanOrEqual(6);
      for (const c of criteria) expect(Number.isInteger(c.weight) && c.weight > 0).toBe(true);
      expect(criteria.reduce((sum, c) => sum + c.weight, 0)).toBe(100);
    }
  });

  test('dimension weights are positive integers summing to 100', () => {
    const weights = READINESS_DIMENSIONS.map((d) => READINESS_DIMENSION_WEIGHTS[d]);
    for (const w of weights) expect(Number.isInteger(w) && w > 0).toBe(true);
    expect(weights.reduce((a, w) => a + w, 0)).toBe(100);
  });

  test('ids are unique, bounded and stable-looking', () => {
    const ids = READINESS_CRITERIA.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9_]{2,63}$/);
  });

  test('every criterion can be answered from the brand site itself', () => {
    for (const c of READINESS_CRITERIA) {
      expect(c.sources.length).toBeGreaterThan(0);
      for (const s of c.sources) expect(readinessEvidenceSource.options).toContain(s);
      // brand.md is always eligible: on recompute it is the brand's own statement.
      expect(c.sources).toContain('brand_md');
    }
  });

  test('every target_field is a real brand-book field', () => {
    const dead = READINESS_CRITERIA.filter((c) => !resolvesInBrandReport(c.target_field));
    expect(dead.map((c) => `${c.id} → ${c.target_field}`)).toEqual([]);
  });

  test('labels and headlines fit the contract bounds', () => {
    for (const c of READINESS_CRITERIA) {
      expect(c.label.length).toBeLessThanOrEqual(120);
      expect(c.unmet_headline.length).toBeLessThanOrEqual(240);
    }
  });

  test('every criterion carries an anchored rubric, and partial is narrower than yes', () => {
    for (const c of READINESS_CRITERIA) {
      expect(c.rubric.yes.length).toBeGreaterThan(20);
      expect(c.rubric.yes.length).toBeLessThanOrEqual(200);
      if (c.rubric.partial !== null) {
        expect(c.rubric.partial.length).toBeGreaterThan(10);
        expect(c.rubric.partial.length).toBeLessThanOrEqual(200);
        expect(c.rubric.partial).not.toBe(c.rubric.yes);
      }
    }
  });
});

describe('readinessOverall', () => {
  const all = (score: number, coverage?: number) =>
    Object.fromEntries(READINESS_DIMENSIONS.map((d) => [d, { score, coverage }])) as Parameters<
      typeof readinessOverall
    >[0];

  test('equal scores give that score', () => {
    expect(readinessOverall(all(64, 1))).toBe(64);
  });

  test('weights the dimensions by READINESS_DIMENSION_WEIGHTS', () => {
    const dims = all(0, 1);
    dims.value_proposition = { score: 100, coverage: 1 };
    expect(readinessOverall(dims)).toBe(READINESS_DIMENSION_WEIGHTS.value_proposition);
  });

  test('renormalises over covered dimensions — an uncovered 0 is not a weak brand', () => {
    const dims = all(80, 1);
    dims.success_metrics = { score: 0, coverage: 0 };
    expect(readinessOverall(dims)).toBe(80);
  });

  test('legacy rows without coverage count every dimension', () => {
    expect(readinessOverall(all(50))).toBe(50);
  });

  test('no covered dimension scores 0', () => {
    expect(readinessOverall(all(90, 0))).toBe(0);
  });
});

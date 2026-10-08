import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { headlessGuidanceSchema, organicHeadlessGuidanceSchema } from './index';

const ACTRESS = '0a7a50fc-45a9-414b-849b-f6184ddb5d4c';

/** Every node of the JSON Schema a provider receives. */
function nodes(node: unknown): Record<string, unknown>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== 'object') return [];
  const record = node as Record<string, unknown>;
  return [record, ...Object.values(record).flatMap(nodes)];
}

describe('headlessGuidanceSchema', () => {
  it('takes ids and choices', () => {
    const guidance = headlessGuidanceSchema.parse({
      reels: 1,
      stills: 1,
      language: 'es',
      portfolioId: '20862688-0120-4f15-8344-92af03445580',
      persona: 'volume',
      angleIds: ['hook:tu primer mes por $12|angle:price'],
      characterElementIds: [ACTRESS],
      direction: 'Keep it warm and direct.',
    });
    expect(guidance.characterElementIds).toEqual([ACTRESS]);
  });

  it('refuses creative strings it has no field for, and counts past the bound', () => {
    expect(() =>
      headlessGuidanceSchema.parse({ reels: 1, stills: 0, language: 'es', cta: 'Compra ya' }),
    ).toThrow();
    expect(() => headlessGuidanceSchema.parse({ reels: 3, stills: 0, language: 'es' })).toThrow();
    expect(() =>
      headlessGuidanceSchema.parse({ reels: 1, stills: 0, language: 'spanish' }),
    ).toThrow();
    expect(() =>
      headlessGuidanceSchema.parse({
        reels: 1,
        stills: 0,
        language: 'es',
        characterElementIds: ['the blonde one'],
      }),
    ).toThrow();
  });

  it('gives a model a flat declaration: no union, no numeric enum', () => {
    for (const schema of [headlessGuidanceSchema, organicHeadlessGuidanceSchema]) {
      const all = nodes(z.toJSONSchema(schema, { io: 'input' }));
      expect(all.filter((node) => 'anyOf' in node || 'oneOf' in node || 'allOf' in node)).toEqual(
        [],
      );
      expect(
        all.filter(
          (node) =>
            Array.isArray(node.enum) && node.enum.some((value) => typeof value !== 'string'),
        ),
      ).toEqual([]);
    }
  });

  it('keeps the deliverable first and the free text last', () => {
    const keys = Object.keys(headlessGuidanceSchema.shape);
    expect(keys.slice(0, 3)).toEqual(['reels', 'stills', 'language']);
    expect(keys.at(-1)).toBe('direction');
  });

  it('gives the Organic agent no Optimizer ids', () => {
    expect(Object.keys(organicHeadlessGuidanceSchema.shape)).not.toContain('portfolioId');
    expect(() =>
      organicHeadlessGuidanceSchema.parse({
        reels: 1,
        stills: 0,
        language: 'es',
        recommendationId: '20862688-0120-4f15-8344-92af03445580',
      }),
    ).toThrow();
  });
});

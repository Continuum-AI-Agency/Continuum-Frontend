import { describe, expect, it } from 'bun:test';

import { audienceSegmentSchema, targetAudienceSchema } from './target-audience';

describe('targetAudienceSchema generation tolerance', () => {
  it("coerces a stringy list field into an array (regression: 'No object generated')", () => {
    const result = targetAudienceSchema.safeParse({
      demographics: 'Founders; Operators\n• Marketers',
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.demographics).toEqual([
      'Founders',
      'Operators',
      'Marketers',
    ]);
  });

  it('tolerates unknown extra keys the model adds instead of rejecting (was .strict())', () => {
    const result = targetAudienceSchema.safeParse({
      summary: 'Mid-market SaaS founders',
      unexpected_field: 'the model improvised this',
    });
    expect(result.success).toBe(true);
  });

  it('still accepts proper arrays, null, and an empty object', () => {
    expect(targetAudienceSchema.safeParse({ demographics: ['A', 'B'] }).success).toBe(true);
    expect(targetAudienceSchema.safeParse({ demographics: null }).success).toBe(true);
    expect(targetAudienceSchema.safeParse({}).success).toBe(true);
  });

  it('coerces stringy array fields inside a segment and tolerates extra segment keys', () => {
    const result = audienceSegmentSchema.safeParse({
      name: 'SMB owners',
      pains_verbatim: 'Too slow | Too costly',
      vibe: 'an extra field the model added',
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.pains_verbatim).toEqual(['Too slow', 'Too costly']);
  });
});

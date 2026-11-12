import { describe, expect, it } from 'bun:test';
import { elementErrorResponseSchema } from './element';

describe('Element error localization context', () => {
  it('accepts legacy error responses unchanged', () => {
    const legacy = {
      error: 'element_style_conflict',
      message: '/noir conflicts with /golden-hour',
    };
    expect(elementErrorResponseSchema.parse(legacy)).toEqual(legacy);
  });
  it('carries validated opaque style identities alongside compatible diagnostic prose', () => {
    const response = {
      error: 'element_style_conflict',
      message: 'diagnostic prose',
      styleSlugs: ['noir', 'golden-hour'],
    };
    expect(elementErrorResponseSchema.parse(response)).toEqual(response);
    expect(
      elementErrorResponseSchema.safeParse({
        ...response,
        styleSlugs: ['/noir'],
      }).success,
    ).toBe(false);
  });
});

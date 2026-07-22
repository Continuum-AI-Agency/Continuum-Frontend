import { describe, expect, it } from 'bun:test';
import { datasetCreativeRefSchema } from '@continuum/contracts';

import { isResolvableCreativeRef } from './jainaCreativePreview.client';

describe('isResolvableCreativeRef', () => {
  it('is true with brand + account + ad_id', () => {
    const ref = datasetCreativeRefSchema.parse({
      ad_id: 'ad9',
      ad_account_id: 'act_1',
      brand_id: 'b1',
    });
    expect(isResolvableCreativeRef(ref)).toBe(true);
  });

  it('is true with a creative_id instead of an ad_id', () => {
    const ref = datasetCreativeRefSchema.parse({
      creative_id: 'cr1',
      ad_account_id: 'act_1',
      brand_id: 'b1',
    });
    expect(isResolvableCreativeRef(ref)).toBe(true);
  });

  it("is false without brand/account context (older refs, can't resolve)", () => {
    expect(isResolvableCreativeRef(datasetCreativeRefSchema.parse({ ad_id: 'ad9' }))).toBe(false);
  });

  it('is false without any creative/ad id', () => {
    expect(
      isResolvableCreativeRef(
        datasetCreativeRefSchema.parse({ ad_account_id: 'act_1', brand_id: 'b1' }),
      ),
    ).toBe(false);
  });
});

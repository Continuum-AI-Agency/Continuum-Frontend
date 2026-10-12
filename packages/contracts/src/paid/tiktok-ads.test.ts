import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { TIKTOK_MARKETING_API_VERSION, TikTokEnvelopeSchema, tikTokEnvelopeOf } from './tiktok-ads';

const adGroupPage = z.object({
  list: z.array(z.object({ adgroup_id: z.string(), budget: z.number() })),
});

describe('TikTok Marketing API envelope', () => {
  test('pins v1.3', () => {
    expect(TIKTOK_MARKETING_API_VERSION).toBe('v1.3');
  });

  test('a success carries code 0 and typed data', () => {
    const envelope = tikTokEnvelopeOf(adGroupPage).parse({
      code: 0,
      message: 'OK',
      request_id: '2026100112000001',
      data: { list: [{ adgroup_id: '1800000000000000001', budget: 200 }] },
    });
    expect(envelope.code).toBe(0);
    if (envelope.code !== 0) throw new Error('expected success');
    expect(envelope.data.list[0]?.adgroup_id).toBe('1800000000000000001');
  });

  test('a failure carries a non-zero code and its request_id for support; data is not trusted', () => {
    const envelope = tikTokEnvelopeOf(adGroupPage).parse({
      code: 40002,
      message: 'Budget must be at least 105% of the current spend',
      request_id: 'req-1',
      data: {},
    });
    expect(envelope.code).toBe(40002);
    expect(envelope.request_id).toBe('req-1');
  });

  test('a success whose data does not match is refused, not read as a failure', () => {
    const parsed = tikTokEnvelopeOf(adGroupPage).safeParse({
      code: 0,
      message: 'OK',
      request_id: 'r',
      data: {},
    });
    expect(parsed.success).toBe(false);
  });

  test('the untyped envelope accepts any data and requires the four keys', () => {
    expect(
      TikTokEnvelopeSchema.safeParse({ code: 0, message: 'OK', request_id: 'r', data: { x: 1 } })
        .success,
    ).toBe(true);
    expect(TikTokEnvelopeSchema.safeParse({ code: 0, message: 'OK', data: {} }).success).toBe(
      false,
    );
  });
});

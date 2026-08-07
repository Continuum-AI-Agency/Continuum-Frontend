import { describe, expect, it } from 'bun:test';

import {
  JAINA_MAX_AD_ACCOUNTS,
  jainaChatRequestSchema,
  resolveJainaAdAccountIds,
} from './jaina-chat';

const baseRequest = (context: Record<string, unknown>) => ({
  query: 'how did we do last 30 days',
  context: { brandId: 'brand-1', ...context },
});

describe('jainaChatContextSchema', () => {
  it('accepts a single-account turn with no array at all', () => {
    const parsed = jainaChatRequestSchema.parse(baseRequest({ adAccountId: 'act_1' }));
    expect(parsed.context.adAccountIds).toBeUndefined();
  });

  it('accepts a multi-account turn whose primary is a member of the set', () => {
    const parsed = jainaChatRequestSchema.parse(
      baseRequest({ adAccountId: 'act_1', adAccountIds: ['act_1', 'act_2'] }),
    );
    expect(parsed.context.adAccountIds).toEqual(['act_1', 'act_2']);
  });

  it('rejects a set that does not contain the primary', () => {
    // The primary stamps the session/run row. A set excluding it would persist a scope the
    // conversation was never actually run against.
    expect(() =>
      jainaChatRequestSchema.parse(
        baseRequest({ adAccountId: 'act_9', adAccountIds: ['act_1', 'act_2'] }),
      ),
    ).toThrow(/must contain context.adAccountId/);
  });

  it('treats the primary as present regardless of act_ prefix form', () => {
    // Meta hands back `act_123` and `123` for the same account depending on the surface;
    // a prefix mismatch must not read as "primary missing from the selection".
    expect(() =>
      jainaChatRequestSchema.parse(
        baseRequest({ adAccountId: '1', adAccountIds: ['act_1', 'act_2'] }),
      ),
    ).not.toThrow();
  });

  it('rejects duplicates even when they differ only by prefix', () => {
    expect(() =>
      jainaChatRequestSchema.parse(
        baseRequest({ adAccountId: 'act_1', adAccountIds: ['act_1', '1'] }),
      ),
    ).toThrow(/must be unique/);
  });

  it('rejects an empty selection', () => {
    expect(() =>
      jainaChatRequestSchema.parse(baseRequest({ adAccountId: 'act_1', adAccountIds: [] })),
    ).toThrow();
  });

  it('rejects a selection beyond the fan-out ceiling', () => {
    const tooMany = Array.from({ length: JAINA_MAX_AD_ACCOUNTS + 1 }, (_, i) => `act_${i}`);
    expect(() =>
      jainaChatRequestSchema.parse(baseRequest({ adAccountId: 'act_0', adAccountIds: tooMany })),
    ).toThrow();
  });

  it('still requires the primary account and brand', () => {
    expect(() => jainaChatRequestSchema.parse(baseRequest({}))).toThrow();
    expect(() =>
      jainaChatRequestSchema.parse({ query: 'x', context: { adAccountId: 'act_1' } }),
    ).toThrow();
  });
});

describe('resolveJainaAdAccountIds', () => {
  it('falls back to the primary when no set was sent', () => {
    const { context } = jainaChatRequestSchema.parse(baseRequest({ adAccountId: 'act_1' }));
    expect(resolveJainaAdAccountIds(context)).toEqual(['act_1']);
  });

  it('returns the full set when one was sent', () => {
    const { context } = jainaChatRequestSchema.parse(
      baseRequest({ adAccountId: 'act_1', adAccountIds: ['act_1', 'act_2'] }),
    );
    expect(resolveJainaAdAccountIds(context)).toEqual(['act_1', 'act_2']);
  });
});

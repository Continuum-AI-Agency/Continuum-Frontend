import { describe, expect, it } from 'bun:test';

import {
  JAINA_MAX_AD_ACCOUNTS,
  jainaChatRequestSchema,
  resolveJainaAdAccountIds,
  resolveJainaDataScope,
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

  it('accepts an explicit paid data scope', () => {
    const parsed = jainaChatRequestSchema.parse(
      baseRequest({
        adAccountId: 'act_1',
        dataScope: {
          schemaVersion: 1,
          accounts: [
            { platform: 'meta', accountId: 'act_1' },
            { platform: 'google_ads', accountId: 'customers/2' },
          ],
          campaigns: { ids: [] },
        },
      }),
    );
    expect(parsed.context.dataScope?.campaigns?.ids).toEqual([]);
  });

  it('rejects non-paid platforms in an explicit Jaina data scope', () => {
    expect(() =>
      jainaChatRequestSchema.parse(
        baseRequest({
          adAccountId: 'act_1',
          dataScope: {
            schemaVersion: 1,
            accounts: [{ platform: 'instagram', accountId: 'ig-1' }],
          },
        }),
      ),
    ).toThrow(/paid account platforms/);
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

describe('resolveJainaDataScope', () => {
  it('normalizes legacy account fields to a Meta data scope', () => {
    const { context } = jainaChatRequestSchema.parse(
      baseRequest({ adAccountId: 'act_1', adAccountIds: ['act_1', 'act_2'] }),
    );
    expect(resolveJainaDataScope(context)).toEqual({
      schemaVersion: 1,
      accounts: [
        { platform: 'meta', accountId: 'act_1' },
        { platform: 'meta', accountId: 'act_2' },
      ],
    });
  });

  it('returns an explicit paid data scope unchanged', () => {
    const { context } = jainaChatRequestSchema.parse(
      baseRequest({
        adAccountId: 'act_1',
        dataScope: {
          schemaVersion: 1,
          accounts: [{ platform: 'google_ads', accountId: 'customers/2' }],
          ads: { ids: [] },
        },
      }),
    );
    expect(resolveJainaDataScope(context)).toBe(context.dataScope);
  });
});

describe('operator_action exclusivity', () => {
  const operatorAction = {
    tool: 'pause_meta_entity',
    input: {
      entity_id: '120200000000001',
      level: 'adset',
      reason: 'No conversions in 14 days.',
      dry_run: false,
      expected_status: 'ACTIVE',
    },
  };

  it('accepts an operator_action on its own', () => {
    const parsed = jainaChatRequestSchema.safeParse({
      ...baseRequest({ adAccountId: 'act_1' }),
      operator_action: operatorAction,
    });
    expect(parsed.success).toBe(true);
  });

  it.each([
    ['tool_action', { decision: 'approve', approval_id: 'appr_1' }],
    [
      'scaffold_action',
      {
        decision: 'approve',
        approval_id: 'appr_1',
        scaffold_version_id: '11111111-1111-4111-8111-111111111111',
        gate: 'build',
      },
    ],
    ['plan_action', { type: 'approve', plan_id: 'plan_1' }],
    ['clarification', { id: 'clar_1' }],
  ])('refuses operator_action alongside %s, naming both', (field, value) => {
    const parsed = jainaChatRequestSchema.safeParse({
      ...baseRequest({ adAccountId: 'act_1' }),
      operator_action: operatorAction,
      [field]: value,
    });
    expect(parsed.success).toBe(false);
    const issue = parsed.success ? null : parsed.error.issues[0];
    expect(issue?.path).toEqual(['operator_action']);
    expect(issue?.message).toContain(field);
  });
});

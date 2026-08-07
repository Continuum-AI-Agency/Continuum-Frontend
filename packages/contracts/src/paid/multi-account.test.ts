import { describe, expect, it } from 'bun:test';
import { z } from 'zod';

import {
  canSumAccounts,
  explainRollupBlocked,
  multiAccountEnvelopeSchema,
  normalizeAdAccountId,
} from './multi-account';

describe('normalizeAdAccountId', () => {
  it('canonicalizes prefixed, bare, and cased forms to one id', () => {
    expect(normalizeAdAccountId('123')).toBe('act_123');
    expect(normalizeAdAccountId('act_123')).toBe('act_123');
    expect(normalizeAdAccountId('ACT_123')).toBe('act_123');
    expect(normalizeAdAccountId('  act_123 ')).toBe('act_123');
  });
});

describe('canSumAccounts', () => {
  it('sums when every account shares a known currency', () => {
    const rollup = canSumAccounts([{ currency: 'MXN' }, { currency: 'MXN' }]);
    expect(rollup).toMatchObject({ summable: true, currency: 'MXN', account_count: 2 });
    expect(rollup.reason).toBeUndefined();
  });

  it('refuses across different currencies', () => {
    // Real production case: one brand links "BCP - COP - PPAL" and "BCP - USD PPAL".
    const rollup = canSumAccounts([{ currency: 'COP' }, { currency: 'USD' }]);
    expect(rollup.summable).toBe(false);
    expect(rollup.reason).toBe('currency_mismatch');
  });

  it('refuses when ANY currency is unknown rather than assuming they match', () => {
    // Currency is null for every production row today. Withholding a total is recoverable;
    // adding pesos to dollars is not.
    expect(canSumAccounts([{ currency: 'USD' }, { currency: null }])).toMatchObject({
      summable: false,
      reason: 'currency_unknown',
    });
    expect(canSumAccounts([{ currency: null }, { currency: null }])).toMatchObject({
      summable: false,
      reason: 'currency_unknown',
    });
  });

  it('refuses to roll up a single account', () => {
    expect(canSumAccounts([{ currency: 'USD' }])).toMatchObject({
      summable: false,
      reason: 'insufficient_accounts',
      account_count: 1,
    });
    expect(canSumAccounts([])).toMatchObject({ summable: false, account_count: 0 });
  });

  it('gives every blocked reason a user-facing explanation', () => {
    for (const reason of [
      'currency_mismatch',
      'currency_unknown',
      'insufficient_accounts',
    ] as const) {
      expect(explainRollupBlocked(reason).length).toBeGreaterThan(0);
    }
  });
});

describe('multiAccountEnvelopeSchema', () => {
  const envelope = multiAccountEnvelopeSchema(z.object({ spend: z.number() }));

  it('accepts a mixed success/failure fan-out', () => {
    const parsed = envelope.parse({
      by_account: [
        {
          ok: true,
          ad_account_id: 'act_1',
          account_name: 'ACQ',
          currency: 'MXN',
          naming_schema_scope: 'brand',
          data: { spend: 100 },
        },
        {
          ok: false,
          ad_account_id: 'act_2',
          account_name: 'Engagement',
          error: 'token_unavailable',
          error_detail: 'no token for act_2',
        },
      ],
      rollup: { summable: false, reason: 'insufficient_accounts', account_count: 1 },
      accounts_requested: ['act_1', 'act_2'],
      accounts_ok: ['act_1'],
      accounts_failed: [{ ad_account_id: 'act_2', error: 'token_unavailable' }],
    });
    expect(parsed.by_account).toHaveLength(2);
  });

  it('rejects a success slice that omits its naming-schema scope marker', () => {
    // The marker is not decoration: it records that naming was parsed against a
    // brand-wide taxonomy, which is the honest scope today.
    expect(() =>
      envelope.parse({
        by_account: [
          {
            ok: true,
            ad_account_id: 'act_1',
            account_name: 'ACQ',
            currency: 'MXN',
            data: { spend: 100 },
          },
        ],
        rollup: { summable: false, account_count: 1 },
        accounts_requested: ['act_1'],
        accounts_ok: ['act_1'],
        accounts_failed: [],
      }),
    ).toThrow();
  });
});

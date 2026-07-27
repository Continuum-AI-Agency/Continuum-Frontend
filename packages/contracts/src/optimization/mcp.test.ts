// The optimizer_manage / optimizer_query umbrellas are the ONLY money-write and read
// entry points the MCP surface exposes. Their action enums are the whitelist an agent is
// allowed to invoke, and each discriminated-union arm routes an `action` literal to the
// exact service payload that reaches Meta (or the RPC layer). An action that drifts open,
// or an arm whose discriminant routes to the wrong payload, is a money-safety hole: a
// caller could smuggle a convert-CBO body into an enroll arm, or invoke a write nobody
// whitelisted. These are fenced here.

import { describe, expect, test } from 'bun:test';
import {
  ConvertCboToolResponseSchema,
  OptimizerManageActionSchema,
  OptimizerManageInputSchema,
  OptimizerManageOutputSchema,
  OptimizerQueryActionSchema,
  OptimizerQueryInputSchema,
  OptimizerQueryOutputSchema,
} from './mcp';

const UUID = '11111111-1111-4111-8111-111111111111';
const UUID2 = '22222222-2222-4222-8222-222222222222';

describe('OptimizerManageActionSchema — the money-write whitelist', () => {
  test('carries exactly the 11 write actions, no more', () => {
    expect([...OptimizerManageActionSchema.options].sort()).toEqual([
      'archive_portfolio',
      'convert_cbo',
      'create_from_suggestion',
      'create_portfolio',
      'enroll_adsets',
      'run_now',
      'set_recommendation_status',
      'set_recommendation_statuses',
      'set_renewal_task_status',
      'unenroll_adsets',
      'update_portfolio',
    ]);
    expect(OptimizerManageActionSchema.options).toHaveLength(11);
  });

  test('rejects an action nobody whitelisted — the enum is closed', () => {
    expect(OptimizerManageActionSchema.safeParse('delete_everything').success).toBe(false);
    expect(OptimizerManageActionSchema.safeParse('run_all').success).toBe(false);
  });
});

describe('OptimizerQueryActionSchema — the read whitelist', () => {
  test('carries exactly the 11 read actions', () => {
    expect([...OptimizerQueryActionSchema.options].sort()).toEqual([
      'adsets',
      'angle_matrix',
      'cpa_series',
      'insight',
      'logs',
      'pending_recs',
      'performance',
      'portfolios',
      'renewal_tasks',
      'status',
      'suggestions',
    ]);
    expect(OptimizerQueryActionSchema.options).toHaveLength(11);
  });

  test('rejects an undefined read action', () => {
    expect(OptimizerQueryActionSchema.safeParse('dump_secrets').success).toBe(false);
  });
});

describe('OptimizerManageInputSchema — each arm routes to the right payload', () => {
  test('set_recommendation_status: valid single-rec status write', () => {
    const parsed = OptimizerManageInputSchema.parse({
      action: 'set_recommendation_status',
      payload: { portfolio_id: UUID2, recommendation_id: UUID, status: 'approved' },
    });
    expect(parsed.action).toBe('set_recommendation_status');
    if (parsed.action === 'set_recommendation_status') {
      expect(parsed.payload.status).toBe('approved');
      // The precondition is opt-OUT, not opt-in: an approval that names no
      // expected state still refuses to re-decide a row that already moved.
      expect(parsed.payload.expected_status).toBe('pending');
    }
  });
  test('set_recommendation_status: rejects a non-enum status', () => {
    expect(
      OptimizerManageInputSchema.safeParse({
        action: 'set_recommendation_status',
        payload: { portfolio_id: UUID2, recommendation_id: UUID, status: 'maybe' },
      }).success,
    ).toBe(false);
  });
  test('set_recommendation_status: requires the portfolio that owns the row', () => {
    // Without it the tool cannot read the row back, so it can neither enforce the
    // precondition nor build a receipt — and the RPC has no brand check of its own.
    expect(
      OptimizerManageInputSchema.safeParse({
        action: 'set_recommendation_status',
        payload: { recommendation_id: UUID, status: 'approved' },
      }).success,
    ).toBe(false);
  });

  test('set_recommendation_statuses: valid bulk status write', () => {
    const parsed = OptimizerManageInputSchema.parse({
      action: 'set_recommendation_statuses',
      payload: { portfolio_id: UUID2, recommendation_ids: [UUID, UUID2], status: 'rejected' },
    });
    if (parsed.action === 'set_recommendation_statuses') {
      expect(parsed.payload.recommendation_ids).toHaveLength(2);
      expect(parsed.payload.expected_status).toBe('pending');
    }
  });
  test('set_recommendation_statuses: rejects an empty id list (min 1)', () => {
    expect(
      OptimizerManageInputSchema.safeParse({
        action: 'set_recommendation_statuses',
        payload: { portfolio_id: UUID2, recommendation_ids: [], status: 'approved' },
      }).success,
    ).toBe(false);
  });

  test('convert_cbo: preview mode defaults on and needs no confirm_token', () => {
    const parsed = OptimizerManageInputSchema.parse({
      action: 'convert_cbo',
      payload: { brandId: UUID, accountId: 'act_1', campaignId: 'c1' },
    });
    if (parsed.action === 'convert_cbo') {
      expect(parsed.payload.mode).toBe('preview');
      expect(parsed.payload.confirm_token).toBeUndefined();
    }
  });
  test('convert_cbo: apply mode carries the confirm_token bound to the previewed budgets', () => {
    const parsed = OptimizerManageInputSchema.parse({
      action: 'convert_cbo',
      payload: {
        brandId: UUID,
        accountId: 'act_1',
        campaignId: 'c1',
        mode: 'apply',
        confirm_token: 'tok_abc',
      },
    });
    if (parsed.action === 'convert_cbo') {
      expect(parsed.payload.mode).toBe('apply');
      expect(parsed.payload.confirm_token).toBe('tok_abc');
    }
  });
  test('convert_cbo: rejects an empty campaignId (min 1) and an unknown mode', () => {
    expect(
      OptimizerManageInputSchema.safeParse({
        action: 'convert_cbo',
        payload: { brandId: UUID, accountId: 'act_1', campaignId: '' },
      }).success,
    ).toBe(false);
    expect(
      OptimizerManageInputSchema.safeParse({
        action: 'convert_cbo',
        payload: { brandId: UUID, accountId: 'act_1', campaignId: 'c1', mode: 'commit' },
      }).success,
    ).toBe(false);
  });

  test('enroll_adsets: valid adset-id enrollment', () => {
    const parsed = OptimizerManageInputSchema.parse({
      action: 'enroll_adsets',
      payload: { portfolio_id: UUID, adset_ids: ['as1', 'as2'] },
    });
    if (parsed.action === 'enroll_adsets') {
      expect(parsed.payload.adset_ids).toEqual(['as1', 'as2']);
    }
  });
  test('enroll_adsets: rejects both adset_ids AND campaign_id (exactly-one refine)', () => {
    expect(
      OptimizerManageInputSchema.safeParse({
        action: 'enroll_adsets',
        payload: { portfolio_id: UUID, adset_ids: ['as1'], campaign_id: 'c1' },
      }).success,
    ).toBe(false);
  });

  test('unenroll_adsets: valid removal', () => {
    const parsed = OptimizerManageInputSchema.parse({
      action: 'unenroll_adsets',
      payload: { portfolio_id: UUID, adset_ids: ['as1'] },
    });
    if (parsed.action === 'unenroll_adsets') {
      expect(parsed.payload.adset_ids).toEqual(['as1']);
    }
  });
  test('unenroll_adsets: rejects an empty adset_ids list (min 1)', () => {
    expect(
      OptimizerManageInputSchema.safeParse({
        action: 'unenroll_adsets',
        payload: { portfolio_id: UUID, adset_ids: [] },
      }).success,
    ).toBe(false);
  });

  const SUGGESTION = {
    objective: 'purchase' as const,
    name: 'Prospecting',
    mode: 'balanced' as const,
    daily_total: 500,
    adset_ids: ['as1', 'as2'],
    summary: { adsets: 2, spend14: 1000, conv14: 20 },
    reason: 'grouped by objective',
  };

  test('create_from_suggestion: valid create-and-enroll from an onboarding suggestion', () => {
    const parsed = OptimizerManageInputSchema.parse({
      action: 'create_from_suggestion',
      payload: { brand_id: UUID, ad_account_id: 'act_1', suggestion: SUGGESTION },
    });
    if (parsed.action === 'create_from_suggestion') {
      expect(parsed.payload.suggestion.name).toBe('Prospecting');
      expect(parsed.payload.suggestion.level).toBe('adset'); // default applied
    }
  });
  test('create_from_suggestion: rejects a suggestion with an unknown objective', () => {
    expect(
      OptimizerManageInputSchema.safeParse({
        action: 'create_from_suggestion',
        payload: {
          brand_id: UUID,
          ad_account_id: 'act_1',
          suggestion: { ...SUGGESTION, objective: 'vibes' },
        },
      }).success,
    ).toBe(false);
  });

  test('run_now: valid portfolio-form cycle trigger', () => {
    const parsed = OptimizerManageInputSchema.parse({
      action: 'run_now',
      payload: { portfolio_id: UUID },
    });
    expect(parsed.action).toBe('run_now');
  });
  test('run_now: rejects a payload matching neither run-cycle form', () => {
    expect(
      OptimizerManageInputSchema.safeParse({
        action: 'run_now',
        payload: { nonsense: true },
      }).success,
    ).toBe(false);
  });
  test('run_now: the ad-hoc adset form is NOT advertised on the MCP surface', () => {
    // `RunCycleRequestSchema` still carries it for the service + cron, but the
    // optimizer-run EDGE parses only { portfolio_id } and 400s on this arm — an
    // action the agent could select and never complete.
    expect(
      OptimizerManageInputSchema.safeParse({
        action: 'run_now',
        payload: {
          brand_id: UUID,
          ad_account_id: 'act_1',
          adset_ids: ['1'],
          objective: 'purchase',
        },
      }).success,
    ).toBe(false);
  });

  test('rejects an unknown action on the union', () => {
    expect(
      OptimizerManageInputSchema.safeParse({
        action: 'wire_money',
        payload: {},
      }).success,
    ).toBe(false);
  });

  test('a set_recommendation_status body does NOT parse under the convert_cbo arm', () => {
    // The discriminant is load-bearing: routing a status body through the CBO arm would let a
    // convert slip past status validation. The arms must not be interchangeable.
    expect(
      OptimizerManageInputSchema.safeParse({
        action: 'convert_cbo',
        payload: { recommendation_id: UUID, status: 'approved' },
      }).success,
    ).toBe(false);
  });
});

describe('OptimizerManageOutputSchema — arms carry the matching service response', () => {
  test('set_recommendation_status returns a RECEIPT, not an echo of the request', () => {
    const parsed = OptimizerManageOutputSchema.parse({
      action: 'set_recommendation_status',
      result: {
        recommendation_id: UUID,
        portfolio_id: UUID2,
        adset_ids: ['23851234567890'],
        ad_id: null,
        kind: 'creative_refresh',
        before_status: 'pending',
        status: 'approved',
        actor: 'user-1',
        decided_at: '2026-07-23T10:00:00.000Z',
        opened_renewal_task_id: UUID2,
        replayed: false,
      },
    });
    if (parsed.action === 'set_recommendation_status') {
      expect(parsed.result.before_status).toBe('pending');
      expect(parsed.result.adset_ids).toEqual(['23851234567890']);
      expect(parsed.result.opened_renewal_task_id).toBe(UUID2);
    }
    // The old echo shape proved nothing and must no longer validate.
    expect(
      OptimizerManageOutputSchema.safeParse({
        action: 'set_recommendation_status',
        result: { recommendation_id: UUID, status: 'applied' },
      }).success,
    ).toBe(false);
  });
  test('set_recommendation_statuses is ITEMIZED — a bare count no longer validates', () => {
    const parsed = OptimizerManageOutputSchema.parse({
      action: 'set_recommendation_statuses',
      result: {
        applied: [UUID],
        skipped: [{ id: 'not-a-rec', reason: 'no recommendation with this id in the portfolio' }],
        status: 'approved',
      },
    });
    if (parsed.action === 'set_recommendation_statuses') {
      expect(parsed.result.applied).toEqual([UUID]);
      expect(parsed.result.skipped[0]?.reason).toContain('no recommendation');
    }
    // `{updated: n}` hid partial failure — the whole point of the change.
    expect(
      OptimizerManageOutputSchema.safeParse({
        action: 'set_recommendation_statuses',
        result: { updated: 4, status: 'approved' },
      }).success,
    ).toBe(false);
  });

  test('convert_cbo preview result: budgets + confirm_token, mode discriminated', () => {
    const parsed = OptimizerManageOutputSchema.parse({
      action: 'convert_cbo',
      result: {
        mode: 'preview',
        ok: true,
        campaignId: 'c1',
        currency: 'USD',
        adset_budgets: [{ adset_id: 'as1', daily_budget: 1000, daily_major: 10 }],
        confirm_token: 'tok_abc',
      },
    });
    if (parsed.action === 'convert_cbo' && parsed.result.mode === 'preview') {
      expect(parsed.result.confirm_token).toBe('tok_abc');
      expect(parsed.result.adset_budgets[0].daily_budget).toBe(1000);
    }
  });
  test('convert_cbo apply result: converted count on the apply arm', () => {
    const parsed = OptimizerManageOutputSchema.parse({
      action: 'convert_cbo',
      result: { mode: 'apply', ok: true, converted: 3, adset_budgets: [] },
    });
    if (parsed.action === 'convert_cbo' && parsed.result.mode === 'apply') {
      expect(parsed.result.converted).toBe(3);
    }
  });
  test('convert_cbo result rejects an unknown mode discriminant', () => {
    expect(
      OptimizerManageOutputSchema.safeParse({
        action: 'convert_cbo',
        result: { mode: 'committed', ok: true },
      }).success,
    ).toBe(false);
  });

  test('enroll_adsets returns the enrolled count + queued first cycle', () => {
    const parsed = OptimizerManageOutputSchema.parse({
      action: 'enroll_adsets',
      result: { enrolled: 2, first_cycle: 'queued' },
    });
    if (parsed.action === 'enroll_adsets') {
      expect(parsed.result.enrolled).toBe(2);
    }
  });

  test('create_from_suggestion returns the new portfolio id + enrolled count', () => {
    const parsed = OptimizerManageOutputSchema.parse({
      action: 'create_from_suggestion',
      result: { portfolio_id: UUID, enrolled: 5 },
    });
    if (parsed.action === 'create_from_suggestion') {
      expect(parsed.result.enrolled).toBe(5);
    }
  });

  test('run_now carries the RunCycleResponse count envelope', () => {
    const parsed = OptimizerManageOutputSchema.parse({
      action: 'run_now',
      result: {
        portfolioId: UUID,
        runId: UUID2,
        snapshotCount: 8,
        recommendations: 1,
        applied: 0,
        failed: 0,
        deduped: 0,
        stubbed: 0,
        held: 0,
      },
    });
    if (parsed.action === 'run_now') {
      expect(parsed.result.recommendations).toBe(1);
    }
  });
});

describe('ConvertCboToolResponseSchema — the two-phase preview/apply union', () => {
  test('a preview result defaults adset_budgets to an empty array', () => {
    const parsed = ConvertCboToolResponseSchema.parse({
      mode: 'preview',
      ok: false,
      reason: 'no_adsets',
    });
    if (parsed.mode === 'preview') {
      expect(parsed.adset_budgets).toEqual([]);
      expect(parsed.reason).toBe('no_adsets');
    }
  });
  test('rejects a result with no mode discriminant', () => {
    expect(ConvertCboToolResponseSchema.safeParse({ ok: true }).success).toBe(false);
  });
});

describe('OptimizerQueryInputSchema — read arms', () => {
  test('pending_recs targets one portfolio', () => {
    const parsed = OptimizerQueryInputSchema.parse({
      action: 'pending_recs',
      brand_id: UUID,
      portfolio_id: UUID2,
    });
    expect(parsed.action).toBe('pending_recs');
    if (parsed.action === 'pending_recs') {
      expect(parsed.portfolio_id).toBe(UUID2);
    }
  });
  test('pending_recs rejects a missing portfolio_id', () => {
    expect(
      OptimizerQueryInputSchema.safeParse({ action: 'pending_recs', brand_id: UUID }).success,
    ).toBe(false);
  });

  test('adsets targets one portfolio', () => {
    const parsed = OptimizerQueryInputSchema.parse({
      action: 'adsets',
      brand_id: UUID,
      portfolio_id: UUID2,
    });
    if (parsed.action === 'adsets') {
      expect(parsed.portfolio_id).toBe(UUID2);
    }
  });
  test('adsets rejects a non-uuid brand_id', () => {
    expect(
      OptimizerQueryInputSchema.safeParse({
        action: 'adsets',
        brand_id: 'brand-1',
        portfolio_id: UUID2,
      }).success,
    ).toBe(false);
  });

  test('renewal_tasks needs only the brand; status is optional', () => {
    const bare = OptimizerQueryInputSchema.parse({ action: 'renewal_tasks', brand_id: UUID });
    expect(bare.action).toBe('renewal_tasks');
    const filtered = OptimizerQueryInputSchema.parse({
      action: 'renewal_tasks',
      brand_id: UUID,
      status: 'done',
    });
    if (filtered.action === 'renewal_tasks') {
      expect(filtered.status).toBe('done');
    }
  });
  test('renewal_tasks rejects an unknown status', () => {
    expect(
      OptimizerQueryInputSchema.safeParse({
        action: 'renewal_tasks',
        brand_id: UUID,
        status: 'closed',
      }).success,
    ).toBe(false);
  });
});

describe('OptimizerQueryOutputSchema — read arms', () => {
  test('pending_recs returns the portfolio id + recommendation rows', () => {
    const parsed = OptimizerQueryOutputSchema.parse({
      action: 'pending_recs',
      portfolio_id: UUID,
      recommendations: [
        {
          id: UUID2,
          adset_id: 'as1',
          kind: 'pause',
          trigger: 'P1',
          severity: null,
          reason: null,
          status: 'pending',
        },
      ],
    });
    if (parsed.action === 'pending_recs') {
      expect(parsed.recommendations).toHaveLength(1);
    }
  });

  test('adsets returns the enrolled ad-set membership rows', () => {
    const parsed = OptimizerQueryOutputSchema.parse({
      action: 'adsets',
      portfolio_id: UUID,
      adsets: [{ adset_id: 'as1', adset_name: 'Prospecting // Broad', active: true }],
    });
    if (parsed.action === 'adsets') {
      expect(parsed.adsets[0].active).toBe(true);
    }
  });

  test('renewal_tasks returns the open work items', () => {
    const parsed = OptimizerQueryOutputSchema.parse({
      action: 'renewal_tasks',
      tasks: [
        {
          id: UUID,
          portfolio_id: UUID2,
          portfolio_name: 'Prospecting',
          adset_id: 'as1',
          kind: 'creative_refresh',
          reason: 'fatigue',
          status: 'open',
          created_at: '2026-07-01T09:00:00Z',
        },
      ],
    });
    if (parsed.action === 'renewal_tasks') {
      expect(parsed.tasks[0].kind).toBe('creative_refresh');
    }
  });

  test('an output arm whose payload belongs to a different action fails to parse', () => {
    // renewal_tasks carries `tasks`, not `adsets` — a mismatched payload must not slip through.
    expect(
      OptimizerQueryOutputSchema.safeParse({
        action: 'renewal_tasks',
        portfolio_id: UUID,
        adsets: [],
      }).success,
    ).toBe(false);
  });
});

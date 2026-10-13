import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { jainaOperatorActionSchema } from '@continuum/contracts';
import { FunctionsHttpError } from '@supabase/supabase-js';
import * as supabaseClientModule from '@/lib/supabase/client';
import {
  budgetDisplay,
  buildEntityStatusAction,
  CAMPAIGN_STATUSES,
  campaignStatusBucket,
  countCampaignBuckets,
  DEFAULT_PAUSE_REASON,
  DEFAULT_UNPAUSE_REASON,
  describeEntityStatusAction,
  ensureOperationsSession,
  fetchScaleAdSets,
  fetchScaleAds,
  fetchScaleCampaigns,
  readEntityStatusOutcome,
  type ScaleEntityRow,
  ScaleLoadError,
} from './campaignsClient';

type InvokeCall = [string, { method: string; body: Record<string, unknown> }];

function stubInvoke(result: { data: unknown; error: unknown }) {
  const invoke = mock(async (..._args: InvokeCall) => result);
  const spy = spyOn(supabaseClientModule, 'createSupabaseBrowserClient').mockReturnValue({
    functions: { invoke },
  } as unknown as ReturnType<typeof supabaseClientModule.createSupabaseBrowserClient>);
  return { invoke, spy };
}

function callOf(invoke: ReturnType<typeof stubInvoke>['invoke']) {
  const [path, options] = invoke.mock.calls[0] as InvokeCall;
  const [route, query] = path.split('?');
  return { route, query: new URLSearchParams(query), body: options.body, method: options.method };
}

const scope = { brandId: 'brand-1', adAccountId: 'act_123' };

describe('buildEntityStatusAction', () => {
  it('pauses an ACTIVE row with expected_status taken from the row as read', () => {
    const action = buildEntityStatusAction({ id: 'c-1', status: 'ACTIVE' }, 'campaign');
    expect(action).toEqual({
      tool: 'pause_meta_entity',
      input: {
        entity_id: 'c-1',
        level: 'campaign',
        reason: DEFAULT_PAUSE_REASON,
        dry_run: false,
        expected_status: 'ACTIVE',
      },
    });
    expect(jainaOperatorActionSchema.safeParse(action).success).toBe(true);
  });

  it('unpauses a PAUSED row with expected_status PAUSED', () => {
    const action = buildEntityStatusAction({ id: 'as-9', status: 'paused' }, 'adset');
    expect(action).toEqual({
      tool: 'activate_meta_entity',
      input: {
        entity_id: 'as-9',
        level: 'adset',
        reason: DEFAULT_UNPAUSE_REASON,
        dry_run: false,
        expected_status: 'PAUSED',
      },
    });
    expect(jainaOperatorActionSchema.safeParse(action).success).toBe(true);
  });

  it('maps each level through unchanged', () => {
    for (const level of ['campaign', 'adset', 'ad'] as const) {
      expect(buildEntityStatusAction({ id: 'x', status: 'ACTIVE' }, level)?.input).toMatchObject({
        level,
      });
    }
  });

  it('offers no action for any status other than ACTIVE or PAUSED', () => {
    for (const status of ['ARCHIVED', 'DELETED', 'UNKNOWN', 'IN_PROCESS', 'CAMPAIGN_PAUSED']) {
      expect(buildEntityStatusAction({ id: 'x', status }, 'ad')).toBeNull();
    }
  });

  it('sends the edited reason trimmed, falls back when blank, caps it at 500', () => {
    const row = { id: 'x', status: 'ACTIVE' };
    expect(buildEntityStatusAction(row, 'ad', '  Creative fatigue  ')?.input.reason).toBe(
      'Creative fatigue',
    );
    expect(buildEntityStatusAction(row, 'ad', '   ')?.input.reason).toBe(DEFAULT_PAUSE_REASON);
    const long = buildEntityStatusAction(row, 'ad', 'a'.repeat(600));
    expect(long?.input.reason).toHaveLength(500);
    expect(jainaOperatorActionSchema.safeParse(long).success).toBe(true);
  });

  it('describes the ask the way the conversation records it', () => {
    const action = buildEntityStatusAction({ id: 'x', status: 'ACTIVE' }, 'adset');
    if (!action) throw new Error('expected an action');
    expect(describeEntityStatusAction(action, { name: 'Summer Sale' }, 'adset')).toBe(
      'Pause ad set "Summer Sale"',
    );
  });
});

describe('fetchScaleCampaigns', () => {
  afterEach(() => mock.restore());

  it('asks for every status the function lists, in the query and the body', async () => {
    const { invoke } = stubInvoke({ data: { campaigns: [] }, error: null });

    await fetchScaleCampaigns(scope);

    const call = callOf(invoke);
    expect(call.route).toBe('paid-media-reporting/campaigns');
    expect(call.method).toBe('POST');
    expect(call.query.get('statuses')?.split(',')).toEqual([
      'ACTIVE',
      'ARCHIVED',
      'CAMPAIGN_PAUSED',
      'IN_PROCESS',
      'PAUSED',
      'WITH_ISSUES',
    ]);
    expect(call.query.get('brandId')).toBe('brand-1');
    expect(call.query.get('adAccountId')).toBe('act_123');
    expect(call.query.get('platform')).toBe('meta');
    expect(call.query.has('refresh')).toBe(false);
    expect(call.body).toEqual({
      platform: 'meta',
      brandId: 'brand-1',
      adAccountId: 'act_123',
      statuses: CAMPAIGN_STATUSES,
    });
  });

  it('bypasses the edge cache only when asked', async () => {
    const { invoke } = stubInvoke({ data: { campaigns: [] }, error: null });

    await fetchScaleCampaigns(scope, { refresh: true });

    const call = callOf(invoke);
    expect(call.query.get('refresh')).toBe('true');
    expect(call.body.refresh).toBe(true);
  });

  it('normalizes rows from the new function (effective_status, cachedAt)', async () => {
    stubInvoke({
      data: {
        cachedAt: '2026-09-25T10:00:00.000Z',
        campaigns: [
          {
            id: 'c-1',
            name: 'Scaffold build',
            status: 'PAUSED',
            effective_status: 'PAUSED',
            dailyBudget: '2500',
          },
          { name: 'no id is dropped' },
        ],
      },
      error: null,
    });

    const page = await fetchScaleCampaigns(scope);

    expect(page.fetchedAt).toBe('2026-09-25T10:00:00.000Z');
    expect(page.rows).toEqual([
      {
        id: 'c-1',
        name: 'Scaffold build',
        status: 'PAUSED',
        effectiveStatus: 'PAUSED',
        dailyBudget: '2500',
        lifetimeBudget: null,
      },
    ]);
  });

  it('reads the old function (ACTIVE only, no cache stamp) without inventing one', async () => {
    stubInvoke({
      data: { campaigns: [{ id: 'c-2', name: 'Always on', status: 'ACTIVE' }] },
      error: null,
    });

    const page = await fetchScaleCampaigns(scope);

    expect(page.fetchedAt).toBeNull();
    expect(page.rows[0]).toMatchObject({ id: 'c-2', status: 'ACTIVE', effectiveStatus: null });
  });

  it('surfaces the edge errorCode and retryAfter', async () => {
    stubInvoke({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          json: async () => ({
            error: 'Rate limited by Meta',
            errorCode: 'RATE_LIMITED',
            retryAfter: 30,
          }),
        },
      },
    });

    const failure = await fetchScaleCampaigns(scope).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ScaleLoadError);
    // The function's own sentence, as the "why" under "Couldn't load campaigns".
    expect(failure).toMatchObject({
      message: 'rate limited by Meta.',
      errorCode: 'RATE_LIMITED',
      retryAfter: 30,
    });
  });

  it('a 500 with an HTML body says the service answered with an error — never the library string', async () => {
    stubInvoke({
      data: null,
      error: Object.assign(
        new FunctionsHttpError(new Response('<!DOCTYPE html>502', { status: 500 })),
        {
          context: { status: 500, json: async () => Promise.reject(new SyntaxError('not JSON')) },
        },
      ),
    });

    const failure = await fetchScaleCampaigns(scope).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ScaleLoadError);
    expect((failure as Error).message).toBe('the service answered with an error.');
    expect((failure as Error).message).not.toContain('non-2xx');
  });
});

describe('ad set and ad loaders', () => {
  afterEach(() => mock.restore());

  it('reads a campaign’s ad sets through the adsets route', async () => {
    const { invoke } = stubInvoke({
      data: { adsets: [{ id: 'as-1', name: 'Broad', status: 'ACTIVE', dailyBudget: '1000' }] },
      error: null,
    });

    const page = await fetchScaleAdSets({ ...scope, campaignId: 'c-1' });

    const call = callOf(invoke);
    expect(call.route).toBe('paid-media-reporting/adsets');
    expect(call.query.get('campaignId')).toBe('c-1');
    expect(call.body).toMatchObject({ campaignId: 'c-1', platform: 'meta' });
    expect(page.rows[0]).toMatchObject({ id: 'as-1', status: 'ACTIVE', dailyBudget: '1000' });
  });

  it('reads an ad set’s ads with their effectiveStatus', async () => {
    const { invoke } = stubInvoke({
      data: {
        ads: [{ id: 'ad-1', name: 'Hook A', status: 'ACTIVE', effectiveStatus: 'ADSET_PAUSED' }],
      },
      error: null,
    });

    const page = await fetchScaleAds({ ...scope, adSetId: 'as-1' });

    const call = callOf(invoke);
    expect(call.route).toBe('paid-media-reporting/ads');
    expect(call.query.get('adSetId')).toBe('as-1');
    expect(call.body).toMatchObject({ adSetId: 'as-1', datePreset: 'last_7d' });
    expect(page.rows[0]).toMatchObject({ id: 'ad-1', effectiveStatus: 'ADSET_PAUSED' });
  });
});

describe('readEntityStatusOutcome', () => {
  it('returns Meta’s read-back on success', () => {
    const readBack = {
      entity_id: 'c-1',
      level: 'campaign',
      status: 'PAUSED',
      effective_status: null,
    };
    expect(
      readEntityStatusOutcome({ ok: true, output: { ok: true, read_back: readBack } }),
    ).toEqual({ kind: 'read_back', readBack });
  });

  it('returns the tool’s refusal with its code', () => {
    expect(
      readEntityStatusOutcome({
        ok: true,
        output: { ok: false, error: { code: 'status_drifted', message: 'It is already paused.' } },
      }),
    ).toEqual({ kind: 'refused', code: 'status_drifted', message: 'It is already paused.' });
  });

  it('returns a failed tool call as a refusal', () => {
    expect(readEntityStatusOutcome({ ok: false, error: 'Meta 500' })).toEqual({
      kind: 'refused',
      code: null,
      message: 'Meta 500',
    });
  });

  it('says so when the tool reported neither', () => {
    expect(readEntityStatusOutcome({ ok: true, output: { ok: true } })).toEqual({
      kind: 'unreported',
    });
  });
});

describe('ensureOperationsSession', () => {
  afterEach(() => mock.restore());

  it('creates the conversation with the tab’s session id and returns the confirmed id', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ session_id: 'session-1', brand_id: 'brand-1' }), {
        status: 200,
      }),
    );

    const confirmed = await ensureOperationsSession({ ...scope, sessionId: 'session-1' });

    expect(confirmed).toBe('session-1');
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/agents/jaina/chat/conversations');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      context: { adAccountId: 'act_123', brandId: 'brand-1', sessionId: 'session-1' },
    });
  });

  it('throws the server’s detail when the session cannot be created', async () => {
    spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Brand access denied', { status: 403 }),
    );

    await expect(ensureOperationsSession({ ...scope, sessionId: 's' })).rejects.toThrow(
      'Brand access denied',
    );
  });
});

function entity(over: Partial<ScaleEntityRow> & { id: string }): ScaleEntityRow {
  return {
    name: over.id,
    status: 'ACTIVE',
    effectiveStatus: null,
    dailyBudget: null,
    lifetimeBudget: null,
    ...over,
  };
}

describe('budgetDisplay', () => {
  it("reads a CBO campaign's own daily budget, then its lifetime one", () => {
    expect(budgetDisplay(entity({ id: 'c', dailyBudget: '70000' }), 'campaign')).toEqual({
      kind: 'amount',
      minor: 70000,
      basis: 'daily',
      source: 'self',
    });
    expect(budgetDisplay(entity({ id: 'c', lifetimeBudget: '24000' }), 'campaign')).toEqual({
      kind: 'amount',
      minor: 24000,
      basis: 'lifetime',
      source: 'self',
    });
  });

  // The Easy Fit shape from prod: every active campaign is ABO, the budgets sit on the ad sets
  // (lifetime_budget "0" beside the daily one).
  it('sums the ACTIVE ad sets of an ABO campaign', () => {
    const adSets = [
      entity({ id: 'a1', dailyBudget: '2719', lifetimeBudget: '0' }),
      entity({ id: 'a2', dailyBudget: '2067', lifetimeBudget: '0' }),
      entity({
        id: 'a3',
        status: 'PAUSED',
        dailyBudget: '3347',
        lifetimeBudget: '0',
      }),
    ];
    expect(budgetDisplay(entity({ id: 'c' }), 'campaign', adSets)).toEqual({
      kind: 'amount',
      minor: 4786,
      basis: 'daily',
      source: 'adsets',
    });
  });

  it('says the budget is on the ad sets when they were not read or do not add up', () => {
    const abo = entity({ id: 'c' });
    expect(budgetDisplay(abo, 'campaign')).toEqual({ kind: 'adsets' });
    expect(budgetDisplay(abo, 'campaign', [])).toEqual({ kind: 'adsets' });
    expect(
      budgetDisplay(abo, 'campaign', [
        entity({ id: 'a1', dailyBudget: '100' }),
        entity({ id: 'a2', lifetimeBudget: '900' }),
      ]),
    ).toEqual({ kind: 'adsets' });
  });

  it('leaves an ad set without its own budget (inside a CBO campaign) blank', () => {
    expect(budgetDisplay(entity({ id: 'a', lifetimeBudget: '0' }), 'adset')).toBeNull();
  });
});

describe('campaign status buckets', () => {
  it('files every configured status under Active, Paused or Archived', () => {
    expect(campaignStatusBucket('ACTIVE')).toBe('active');
    expect(campaignStatusBucket('WITH_ISSUES')).toBe('active');
    expect(campaignStatusBucket('PAUSED')).toBe('paused');
    expect(campaignStatusBucket('ARCHIVED')).toBe('archived');
    expect(campaignStatusBucket('DELETED')).toBe('archived');
    expect(
      countCampaignBuckets([
        { status: 'ACTIVE' },
        { status: 'PAUSED' },
        { status: 'PAUSED' },
        { status: 'ARCHIVED' },
      ]),
    ).toEqual({ active: 1, paused: 2, archived: 1 });
  });
});

import { describe, expect, it } from 'bun:test';
import type { PlatformCandidateAccount, PortfolioSuggestion } from '@continuum/contracts';
import {
  buildCreateConfig,
  draftFromScratch,
  draftFromSuggestion,
  effectiveTargetMetric,
  emptyDraft,
  enrollLabel,
  hasMetaSelection,
  memberBlockReason,
  memberKey,
  memberPayload,
  membersByAccount,
  planReadout,
  platformAccountNotes,
  platformHost,
  selectedMembers,
  selectedMembersBudget,
  selectionByPlatform,
  selectionCurrency,
  stepIssues,
  suggestedGuardrails,
  suggestionPlatformCounts,
} from './wizardModel';

const suggestion: PortfolioSuggestion = {
  objective: 'lead',
  name: 'Leads · Efficiency',
  level: 'adset',
  mode: 'efficiency',
  daily_total: 1600,
  cpa_target: 36,
  adset_ids: ['as-1', 'as-2'],
  summary: { adsets: 2, spend14: 4200, conv14: 60 },
  reason: 'Grouped by objective',
};

const ctx = { selectedBudgetSum: 1600, blockedCount: 0 };
const createCtx = { currency: 'USD', selectedBudgetSum: 1600, level: 'adset' as const };

describe('draftFromSuggestion', () => {
  it('seeds name, objective, mode, ad sets and the target in display units', () => {
    const draft = draftFromSuggestion(suggestion);
    expect(draft.source).toBe('suggestion');
    expect(draft.name).toBe('Leads · Efficiency');
    expect(draft.objective).toBe('lead');
    expect(draft.mode).toBe('efficiency');
    expect(draft.adsetIds).toEqual(['as-1', 'as-2']);
    expect(draft.target).toBe('36');
    expect(draft.applyMode).toBe('recommend');
  });
  it('shows an awareness target as CPM and drops a zero baseline', () => {
    const draft = draftFromSuggestion({
      ...suggestion,
      objective: 'awareness',
      cpa_target: 0.012,
    });
    expect(draft.target).toBe('12');
    expect(draftFromSuggestion({ ...suggestion, cpa_target: 0 }).target).toBe('');
  });
});

describe('effectiveTargetMetric', () => {
  it('honours an allowed alternative and drops a foreign one', () => {
    expect(effectiveTargetMetric({ objective: 'traffic', targetMetric: 'link_clicks' })).toBe(
      'link_clicks',
    );
    expect(effectiveTargetMetric({ objective: 'purchase', targetMetric: 'link_clicks' })).toBe(
      'purchase',
    );
    expect(effectiveTargetMetric({ objective: 'lead', targetMetric: null })).toBe('lead');
  });
});

describe('stepIssues', () => {
  it('names what each step still needs', () => {
    const draft = emptyDraft();
    expect(stepIssues(draft, 'start', ctx)).toHaveLength(1);
    expect(stepIssues(draft, 'assets', ctx)).toEqual(['Select at least one ad set.']);
    expect(
      stepIssues({ ...draft, adsetIds: ['a'] }, 'assets', { ...ctx, blockedCount: 2 })[0],
    ).toMatch(/2 selected ad sets are held/);
    expect(stepIssues({ ...draft, mode: 'scale' }, 'goal', ctx)[0]).toMatch(/how much to grow/);
    expect(
      stepIssues(
        { ...draft, mode: 'scale', scaleGrowthPct: '10', scaleCadenceDays: '7' },
        'goal',
        ctx,
      ),
    ).toEqual([]);
    expect(stepIssues({ ...draft, name: '' }, 'plan', ctx)[0]).toMatch(/name/);
  });
  it('the plan step checks the flight, the budget and the guardrails', () => {
    const base = { ...emptyDraft(), name: 'P', adsetIds: ['a'] };
    expect(stepIssues(base, 'plan', ctx)).toEqual([]);
    expect(stepIssues(base, 'plan', { ...ctx, selectedBudgetSum: 0 })[0]).toMatch(/daily budget/);
    expect(
      stepIssues({ ...base, flightFrom: '2026-09-01', flightTo: '2026-09-30' }, 'plan', ctx)[0],
    ).toMatch(/Give the flight a budget/);
    expect(
      stepIssues({ ...base, budgetAmount: '3000', budgetGranularity: 'monthly' }, 'plan', ctx)[0],
    ).toMatch(/monthly budget needs a flight/);
    expect(stepIssues({ ...base, applyMode: 'autopilot' }, 'plan', ctx)).toHaveLength(2);
    expect(
      stepIssues(
        { ...base, applyMode: 'autopilot', maxDailyApply: '2400', maxChangePct: '20' },
        'plan',
        ctx,
      ),
    ).toEqual([]);
  });
});

describe('buildCreateConfig', () => {
  it('a suggestion draft matches the selection and carries only what was chosen', () => {
    const config = buildCreateConfig(draftFromSuggestion(suggestion), createCtx);
    expect(config).toMatchObject({
      name: 'Leads · Efficiency',
      objective: 'lead',
      level: 'adset',
      mode: 'efficiency',
      apply_mode: 'recommend',
      daily_total: 1600,
      budget_source: 'observed',
      lookback_window: 'd14',
      budget_granularity: 'daily',
      cpa_target: 36,
    });
    expect(config.target_metric).toBeUndefined();
    expect(config.period_budget).toBeUndefined();
    expect(config.max_daily_apply_minor).toBeUndefined();
    expect(config.scale_growth_pct).toBeUndefined();
  });

  it('a full plan derives the flight budget and the daily total from the typed granularity', () => {
    const draft = {
      ...emptyDraft(),
      name: 'Q4',
      objective: 'traffic' as const,
      targetMetric: 'link_clicks' as const,
      target: '0.5',
      flightFrom: '2026-10-01',
      flightTo: '2026-10-30',
      budgetAmount: '240000',
      budgetGranularity: 'monthly' as const,
    };
    const config = buildCreateConfig(draft, createCtx);
    expect(config.period_start).toBe('2026-10-01');
    expect(config.period_end).toBe('2026-10-30');
    expect(config.period_budget).toBe(240_000);
    expect(config.daily_total).toBe(8000);
    expect(config.budget_source).toBe('fixed');
    expect(config.budget_granularity).toBe('monthly');
    expect(config.target_metric).toBe('link_clicks');
    expect(config.cpa_target).toBe(0.5);
  });

  it('autopilot guardrails land in minor units and fractions; the scale plan in fractions and days', () => {
    const draft = {
      ...emptyDraft(),
      name: 'Grow',
      mode: 'scale' as const,
      scaleGrowthPct: '10',
      scaleCadenceDays: '7',
      scaleMaxDaily: '5000',
      applyMode: 'autopilot' as const,
      maxDailyApply: '2400',
      maxChangePct: '20',
    };
    const config = buildCreateConfig(draft, createCtx);
    expect(config.max_daily_apply_minor).toBe(240_000);
    expect(config.max_change_pct_per_cycle).toBe(0.2);
    expect(config.scale_growth_pct).toBe(0.1);
    expect(config.scale_cadence_days).toBe(7);
    expect(config.scale_max_daily).toBe(5000);
    const jpy = buildCreateConfig(draft, { ...createCtx, currency: 'JPY' });
    expect(jpy.max_daily_apply_minor).toBe(2400);
  });

  it('prices an awareness target per thousand', () => {
    const config = buildCreateConfig(
      { ...emptyDraft(), name: 'Reach', objective: 'awareness', target: '12' },
      createCtx,
    );
    expect(config.cpa_target).toBeCloseTo(0.012, 9);
  });
});

describe('planReadout / suggestedGuardrails', () => {
  it('reads the typed budget back per day and for the flight', () => {
    const readout = planReadout({
      ...emptyDraft(),
      flightFrom: '2026-09-01',
      flightTo: '2026-09-30',
      budgetAmount: '8000',
      budgetGranularity: 'daily',
    });
    expect(readout).toEqual({ days: 30, perDay: 8000, total: 240_000 });
    expect(planReadout(emptyDraft())).toEqual({ days: null, perDay: null, total: null });
  });
  it('suggests a ceiling of 1.5× the daily total and a 20% cap', () => {
    expect(suggestedGuardrails(1600)).toEqual({ maxDailyApply: '2400', maxChangePct: '20' });
    expect(suggestedGuardrails(0)).toEqual({ maxDailyApply: '', maxChangePct: '20' });
  });
});

describe('a custom conversion, named at creation', () => {
  const described = {
    ...emptyDraft(),
    name: 'Demo funnel',
    objective: 'custom' as const,
    adsetIds: ['as-1'],
    dailyTotal: '1600',
    conversion: {
      event_id: 'offsite_conversion.fb_pixel_custom.demo',
      result_label: 'Demos booked',
      cost_label: 'Cost per demo booked',
      typical_lag_days: '4',
      events_per_week: '18',
      carries_revenue: false,
      analog: null,
    },
  };

  it('refuses the goal step while the conversion has no name', () => {
    // Otherwise the portfolio is created reporting "conversions" for an event the business
    // calls something else, and nothing ever asks again.
    expect(stepIssues({ ...emptyDraft(), objective: 'custom' }, 'goal', ctx)[0]).toMatch(
      /Name the event/,
    );
    expect(stepIssues(described, 'goal', ctx)).toEqual([]);
  });

  it('sends the descriptor with the create config, analog inferred', () => {
    const config = buildCreateConfig(described, createCtx);
    expect(config.conversion_descriptor?.result_label).toBe('Demos booked');
    expect(config.conversion_descriptor?.analog).toBe('lead');
    expect(config.conversion_descriptor?.analog_source).toBe('inferred');
  });

  it('never sends a descriptor for an objective that is not custom', () => {
    const config = buildCreateConfig({ ...described, objective: 'purchase' }, createCtx);
    expect(config.conversion_descriptor).toBeUndefined();
  });
});

/** The shape optimizer-suggest returns for Easy Fit: Meta ad sets and Google campaigns that
 *  all buy leads, in one currency. */
const crossPlatform: PortfolioSuggestion = {
  objective: 'lead',
  name: 'Leads // All platforms',
  level: 'adset',
  mode: 'efficiency',
  daily_total: 2100,
  cpa_target: 40,
  adset_ids: ['as-1', 'as-2'],
  members: [
    { platform: 'meta', account_id: 'act_521903353286118', entity_id: 'as-1', level: 'adset' },
    { platform: 'meta', account_id: 'act_521903353286118', entity_id: 'as-2', level: 'adset' },
    {
      platform: 'google_ads',
      account_id: '5251780631',
      entity_id: 'g-1',
      level: 'campaign',
      name: 'Search · Leads GDL',
    },
  ],
  by_platform: [
    {
      platform: 'meta',
      account_id: 'act_521903353286118',
      members: 2,
      daily_total: 1600,
      spend14: 4200,
      conv14: 60,
    },
    {
      platform: 'google_ads',
      account_id: '5251780631',
      members: 1,
      daily_total: 500,
      spend14: 1400,
      conv14: 45,
    },
  ],
  currency: 'MXN',
  summary: { adsets: 3, spend14: 5600, conv14: 105 },
  reason: '2 ad sets on Meta and 1 campaign on Google Ads, all buying Leads',
};

describe('a cross-platform suggestion', () => {
  it('pre-selects its members on every platform: Meta as ad sets, the rest as members', () => {
    const draft = draftFromSuggestion(crossPlatform);
    expect(draft.adsetIds).toEqual(['as-1', 'as-2']);
    expect(draft.proposedMembers.map((m) => m.entity_id)).toEqual(['g-1']);
    expect(draft.memberKeys).toEqual(['google_ads:5251780631:g-1']);
  });

  it('leaves a Meta-only suggestion with no other-platform members', () => {
    const draft = draftFromSuggestion(suggestion);
    expect(draft.proposedMembers).toEqual([]);
    expect(draft.memberKeys).toEqual([]);
    expect(suggestionPlatformCounts(suggestion)).toBeNull();
  });

  it("counts members per platform in each platform's own unit", () => {
    expect(suggestionPlatformCounts(crossPlatform)).toEqual([
      { platform: 'meta', count: 2, label: '2 ad sets' },
      { platform: 'google_ads', count: 1, label: '1 campaign' },
    ]);
    expect(suggestionPlatformCounts({ ...crossPlatform, level: 'campaign' })?.[0]?.label).toBe(
      '2 campaigns',
    );
  });

  it('groups proposed members by account and keys them per platform', () => {
    const groups = membersByAccount(draftFromSuggestion(crossPlatform).proposedMembers);
    expect(groups.map((g) => [g.platform, g.accountId, g.members.length])).toEqual([
      ['google_ads', '5251780631', 1],
    ]);
    expect(memberKey({ platform: 'meta', account_id: 'a', entity_id: '1' })).not.toBe(
      memberKey({ platform: 'google_ads', account_id: 'a', entity_id: '1' }),
    );
  });

  it('starts from scratch with nothing proposed', () => {
    expect(emptyDraft().proposedMembers).toEqual([]);
  });
});

describe('enrolling the members a cross-platform suggestion proposed', () => {
  const googleOnly = () => ({
    ...draftFromSuggestion(crossPlatform),
    adsetIds: [] as string[],
    dailyTotal: '500',
  });

  it('sends the ticked members only, in the RPC shape, Google at campaign level', () => {
    const draft = draftFromSuggestion(crossPlatform);
    expect(memberPayload(selectedMembers(draft))).toEqual([
      {
        platform: 'google_ads',
        account_id: '5251780631',
        entity_id: 'g-1',
        level: 'campaign',
        name: 'Search · Leads GDL',
      },
    ]);
    expect(selectedMembers({ ...draft, memberKeys: [] })).toEqual([]);
  });

  it('allows a Google-only portfolio: every Meta ad set unticked, a Google campaign kept', () => {
    const draft = googleOnly();
    expect(hasMetaSelection(draft)).toBe(false);
    expect(stepIssues(draft, 'assets', { selectedBudgetSum: 0, blockedCount: 0 })).toEqual([]);
    expect(
      stepIssues({ ...draft, memberKeys: [] }, 'assets', { selectedBudgetSum: 0, blockedCount: 0 }),
    ).toEqual(['Select at least one ad set or campaign.']);
    expect(platformHost(draft)).toEqual({ platform: 'google_ads', account_id: '5251780631' });
    expect(platformHost(draftFromSuggestion(crossPlatform))).toBeNull();
  });

  it('keeps autopilot off: the default is recommend, and a Google-only portfolio refuses it', () => {
    const mixed = draftFromSuggestion(crossPlatform);
    expect(mixed.applyMode).toBe('recommend');
    expect(buildCreateConfig(mixed, createCtx).apply_mode).toBe('recommend');
    const armed = {
      ...googleOnly(),
      applyMode: 'autopilot' as const,
      maxDailyApply: '600',
      maxChangePct: '20',
    };
    expect(stepIssues(armed, 'plan', { selectedBudgetSum: 0, blockedCount: 0 })).toContain(
      'Autopilot writes only to Meta: a portfolio with no Meta ad set runs on recommendations.',
    );
    const config = buildCreateConfig(armed, { ...createCtx, selectedBudgetSum: 0 });
    expect(config.apply_mode).toBe('recommend');
    expect(config.max_daily_apply_minor).toBeUndefined();
    expect(config.level).toBe('campaign');
    expect(config.daily_total).toBe(500);
  });

  it('counts the selection per platform and says so on the Create button', () => {
    const mixed = draftFromSuggestion(crossPlatform);
    expect(selectionByPlatform(mixed)).toEqual([
      { platform: 'meta', label: '2 ad sets' },
      { platform: 'google_ads', label: '1 campaign' },
    ]);
    expect(enrollLabel(mixed)).toBe('Create & enroll 2 ad sets + 1 Google campaign');
    expect(enrollLabel(googleOnly())).toBe('Create & enroll 1 Google campaign');
    expect(enrollLabel(draftFromSuggestion(suggestion))).toBe('Create & enroll 2 ad sets');
    expect(selectionByPlatform(emptyDraft())).toEqual([]);
  });
});

// Vivo 47's from-scratch list: two Google campaigns in MXN, one in another account in USD.
const CANDIDATES: PlatformCandidateAccount[] = [
  {
    platform: 'google_ads',
    account_id: '3710693645',
    currency: 'MXN',
    candidates: [
      {
        entity_id: '20775796216',
        name: 'VIVO 47-EKATAR',
        objectives: ['lead'],
        daily_budget: 1179,
        spend14: 15287,
        channel_type: 'SEARCH',
      },
      {
        entity_id: '24331887298',
        name: 'SALES-PMAX-OCTUBRE',
        objectives: ['lead'],
        daily_budget: 450,
        spend14: 0,
        channel_type: 'PERFORMANCE_MAX',
      },
    ],
  },
  {
    platform: 'google_ads',
    account_id: '999',
    currency: 'USD',
    candidates: [
      {
        entity_id: 'u1',
        name: 'US search',
        objectives: [],
        daily_budget: 50,
        spend14: 10,
        channel_type: 'SEARCH',
      },
    ],
  },
];

describe('a portfolio from scratch on any platform', () => {
  it('lists every other-platform campaign, none ticked', () => {
    const draft = draftFromScratch(CANDIDATES);
    expect(draft.source).toBe('scratch');
    expect(draft.memberKeys).toEqual([]);
    expect(draft.proposedMembers.map((m) => [m.entity_id, m.currency, m.daily_budget])).toEqual([
      ['20775796216', 'MXN', 1179],
      ['24331887298', 'MXN', 450],
      ['u1', 'USD', 50],
    ]);
    expect(stepIssues(draft, 'assets', ctx)).toEqual(['Select at least one ad set or campaign.']);
  });

  it("a Google-only selection is hosted on Google, recommend-only, at its campaigns' budget", () => {
    const base = draftFromScratch(CANDIDATES);
    const draft = {
      ...base,
      name: 'Leads // Google Ads only',
      objective: 'lead' as const,
      memberKeys: base.proposedMembers.slice(0, 2).map(memberKey),
      applyMode: 'autopilot' as const,
    };
    expect(platformHost(draft)).toEqual({
      platform: 'google_ads',
      account_id: '3710693645',
    });
    expect(selectedMembersBudget(draft)).toBe(1629);
    expect(stepIssues(draft, 'assets', ctx)).toEqual([]);
    expect(enrollLabel(draft)).toBe('Create & enroll 2 Google campaigns');
    const config = buildCreateConfig(draft, {
      currency: 'MXN',
      selectedBudgetSum: selectedMembersBudget(draft),
      level: 'adset',
    });
    expect(config.apply_mode).toBe('recommend');
    expect(config.level).toBe('campaign');
    expect(config.daily_total).toBe(1629);
  });

  it('holds the selection to one currency and says why a campaign is disabled', () => {
    const base = draftFromScratch(CANDIDATES);
    const [ekatar, , usd] = base.proposedMembers;
    const draft = { ...base, memberKeys: [memberKey(ekatar)] };
    expect(selectionCurrency(draft, 'MXN')).toBe('MXN');
    expect(memberBlockReason(usd, draft, 'MXN')).toBe('Bills in USD; this portfolio is in MXN.');
    expect(memberBlockReason(ekatar, draft, 'MXN')).toBeNull();
    // A Meta ad set fixes the currency to the Meta account's.
    const metaUsd = { ...base, adsetIds: ['as-1'] };
    expect(memberBlockReason(ekatar, metaUsd, 'USD')).toBe(
      'Bills in MXN; this portfolio is in USD.',
    );
    // Should a mixed selection arrive anyway, the step refuses it.
    const mixed = { ...base, memberKeys: [memberKey(ekatar), memberKey(usd)] };
    expect(stepIssues(mixed, 'assets', { ...ctx, metaCurrency: 'MXN' })).toEqual([
      'A portfolio holds one currency, and this selection bills in MXN and USD. Untick one side.',
    ]);
  });
});

describe('platformAccountNotes', () => {
  const googleOnly: PortfolioSuggestion = {
    objective: 'lead',
    name: 'Leads // Google Ads only',
    level: 'campaign',
    mode: 'efficiency',
    daily_total: 1629,
    adset_ids: [],
    by_platform: [
      {
        platform: 'google_ads',
        account_id: '3710693645',
        members: 2,
        daily_total: 1629,
        spend14: 15287,
        conv14: 232,
      },
    ],
    summary: { adsets: 2, spend14: 15287, conv14: 232 },
    reason: '2 campaigns on Google Ads buying Leads',
  };

  it('says why each account was not combined, and where its campaigns went', () => {
    expect(
      platformAccountNotes(
        [
          {
            platform: 'google_ads',
            account_id: '3710693645',
            currency: 'MXN',
            status: 'no_shared_objective',
          },
          {
            platform: 'google_ads',
            account_id: '999',
            currency: 'USD',
            status: 'currency_mismatch',
          },
          {
            platform: 'google_ads',
            account_id: '5',
            currency: null,
            status: 'read_failed',
          },
          {
            platform: 'google_ads',
            account_id: '6',
            currency: 'MXN',
            status: 'joined',
          },
        ],
        [googleOnly],
        'MXN',
      ),
    ).toEqual([
      'Google Ads account 3710693645 buys different results than this Meta account, so it has a suggestion of its own.',
      'Google Ads account 999 bills in USD and this Meta account in MXN, and a portfolio holds one currency, so its campaigns are under Start from scratch.',
      'Google Ads account 5 could not be read just now, so its campaigns are missing here.',
    ]);
  });
});

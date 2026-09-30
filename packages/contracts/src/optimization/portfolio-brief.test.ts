import { describe, expect, it } from 'bun:test';
import mensajesFixture from './fixtures/optimizer-status-mensajes.json';
import toursFixture from './fixtures/optimizer-status-tours.json';
import {
  allowedNumberTokens,
  type BriefCandidate,
  type BriefGrowth,
  briefFigures,
  deterministicBrief,
  heroThresholdMet,
  impactTier,
  numbersOutsidePacket,
  portfolioBriefSchema,
  rankCandidates,
  readBriefStanding,
  topCandidatePerModule,
  validateHeroPick,
} from './portfolio-brief';

const cand = (over: Partial<BriefCandidate>): BriefCandidate => ({
  id: 'rec:1',
  module: 'pause',
  kind: 'pause',
  trigger: 'P1_zero_upper_funnel',
  adset_id: 'as-1',
  adset_name: 'Cold',
  impact_per_day: 120,
  impact_unit: 'currency',
  results_per_day: null,
  impact_basis: 'spend/day on an ad set with 0 conversions in 7d',
  reason: 'Spent $840 in 7 days and produced no conversions.',
  cta: { kind: 'queue_row', target_id: 'rec:1' },
  ...over,
});
const growth: BriefGrowth = {
  spend: 3200,
  results: 41,
  cost_per_result: 78.05,
  target: 70,
  deltas: { spend: 0.12, results: 0.3, cost_per_result: -0.14 },
  pacing: { status: 'on_track', ratio: 1.01, note: null },
  scale: null,
  window: 'd7',
  as_of: '2026-09-19T06:10:00Z',
  currency: 'USD',
  result_label: 'leads',
};

describe('portfolio brief', () => {
  it('ranks by money then module order, and applies the impact floor', () => {
    const ranked = rankCandidates([
      cand({ id: 'rec:a', module: 'creative', impact_per_day: 50 }),
      cand({ id: 'rec:b', module: 'budget', impact_per_day: 50 }),
      cand({ id: 'rec:c', impact_per_day: 120 }),
    ]);
    expect(ranked.map((c) => c.id)).toEqual(['rec:c', 'rec:b', 'rec:a']);
    expect(heroThresholdMet([cand({ impact_per_day: 4 })], 100)).toBe(false);
    expect(heroThresholdMet([cand({ impact_per_day: 6 })], 100)).toBe(true);
  });
  it('tiers impact against the daily total and keeps one candidate per module', () => {
    expect(impactTier(4, 1000)).toBe('low');
    expect(impactTier(20, 1000)).toBe('medium');
    expect(impactTier(100, 1000)).toBe('high');
    // No daily total: the 5-unit floor still separates the tiers.
    expect(impactTier(25, null)).toBe('high');
    const top = topCandidatePerModule([
      cand({ id: 'rec:a', module: 'creative', impact_per_day: 10 }),
      cand({ id: 'rec:b', module: 'creative', impact_per_day: 30 }),
      cand({ id: 'budget:x', module: 'budget', impact_per_day: 20 }),
    ]);
    expect(top.map((c) => c.id)).toEqual(['rec:b', 'budget:x']);
  });
  it('accepts the maximum, or a justified non-maximum with the maximum listed first', () => {
    const cands = [
      cand({ id: 'rec:max', impact_per_day: 200 }),
      cand({ id: 'rec:b', module: 'budget', impact_per_day: 90 }),
    ];
    expect(
      validateHeroPick({
        candidates: cands,
        chosenId: 'rec:max',
        justification: null,
        secondary: [],
      }),
    ).toEqual({ ok: true });
    expect(
      validateHeroPick({
        candidates: cands,
        chosenId: 'rec:b',
        justification: null,
        secondary: ['rec:max'],
      }).ok,
    ).toBe(false);
    expect(
      validateHeroPick({
        candidates: cands,
        chosenId: 'rec:b',
        justification: 'compounds daily',
        secondary: [],
      }).ok,
    ).toBe(false);
    expect(
      validateHeroPick({
        candidates: cands,
        chosenId: 'rec:b',
        justification: 'compounds daily',
        secondary: ['rec:max'],
      }),
    ).toEqual({ ok: true });
    expect(
      validateHeroPick({
        candidates: cands,
        chosenId: 'rec:zzz',
        justification: null,
        secondary: [],
      }).ok,
    ).toBe(false);
  });
  it('lets only packet figures through the digit gate', () => {
    const allowed = allowedNumberTokens(briefFigures(growth, [cand({})]));
    expect(
      numbersOutsidePacket(
        'Results up 30% while cost per lead fell 14% to $78; stop $120/day.',
        allowed,
      ),
    ).toEqual([]);
    expect(numbersOutsidePacket('Cost per lead is $99 now.', allowed)).toEqual(['99']);
    expect(numbersOutsidePacket('3 ad sets, 7 days', allowed)).toEqual([]);
  });
  it('composes a deterministic brief that validates, with the growth sentence from figures', () => {
    const brief = deterministicBrief({
      growth,
      candidates: [cand({}), cand({ id: 'rec:2', module: 'creative', impact_per_day: 40 })],
      dailyTotal: 500,
      promptVersion: 'v1',
      generatedAt: '2026-09-19T06:15:00Z',
    });
    expect(portfolioBriefSchema.parse(brief).hero).toMatchObject({
      module: 'pause',
      candidate_id: 'rec:1',
      cta: { kind: 'queue_row' },
    });
    expect(brief.hero.headline).toContain('USD 120/day');
    expect(brief.growth_sentence).toBe(
      'leads +30% · cost per result -14% · 12% over target · on track',
    );
    expect(brief.secondary).toEqual(['rec:2']);
    const none = deterministicBrief({
      growth,
      candidates: [],
      dailyTotal: 500,
      promptVersion: 'v1',
      generatedAt: 'x',
    });
    expect(none.hero.module).toBe('none');
  });
});

// ── The calm hero tells the truth ───────────────────────────────────────────
// Two real production bodies (anonymized): Easy Fit's MENSAJES // TODOS — 40.53 per
// conversation against a 30 target on 899 conversations, confidence high — and Tours — 0
// conversations and 12 of 12 ad sets held for a different goal. Both shipped the headline
// "Nothing worth changing today — the portfolio is on its plan.", which contradicts the
// portfolio's own target.

type StatusBody = {
  portfolio: { daily_total: number | null };
  latest_run: unknown;
  latest_items: unknown[];
  hero_brief: { brief: { growth: BriefGrowth; candidates: BriefCandidate[] } };
};
const mensajes = mensajesFixture as unknown as StatusBody;
const tours = toursFixture as unknown as StatusBody;

const briefOf = (body: StatusBody, withStanding = true) =>
  deterministicBrief({
    growth: body.hero_brief.brief.growth,
    candidates: body.hero_brief.brief.candidates,
    dailyTotal: body.portfolio.daily_total,
    standing: withStanding ? readBriefStanding(body.latest_run, body.latest_items) : null,
    promptVersion: 'v1',
    generatedAt: '2026-09-25T19:00:34.810Z',
  });

describe('the calm hero', () => {
  it('reads the standing from the persisted run and its items', () => {
    expect(readBriefStanding(mensajes.latest_run, mensajes.latest_items)).toEqual({
      confidence: 'high',
      adsets_total: 12,
      adsets_held: 0,
      held_reason: null,
    });
    expect(readBriefStanding(tours.latest_run, tours.latest_items)).toEqual({
      confidence: 'low',
      adsets_total: 12,
      adsets_held: 12,
      held_reason: 'kpi_mismatch',
    });
    expect(readBriefStanding(null, [])).toEqual({
      confidence: null,
      adsets_total: 0,
      adsets_held: 0,
      held_reason: null,
    });
  });

  it('says the cost is over target, with the figures, when no change clears the floor (MENSAJES)', () => {
    const brief = portfolioBriefSchema.parse(briefOf(mensajes));
    expect(brief.hero.module).toBe('none');
    expect(brief.hero.headline).not.toContain('on its plan');
    expect(brief.hero.headline).toBe('Cost per conversation is 40.53, 35% over the 30 target');
    expect(brief.hero.why).toContain('No single change clears the impact floor today');
    expect(brief.hero.why).toContain('largest: 0.49/day vs a 60/day floor');
    // The lever, named: creatives, budget, target.
    expect(brief.hero.why).toMatch(/creative/);
    expect(brief.hero.why).toMatch(/budget/);
    expect(brief.hero.why).toMatch(/target/);
  });

  it('keeps saying it on the Frontend fallback, which has no standing (results clear the event floor)', () => {
    const brief = briefOf(mensajes, false);
    expect(brief.hero.headline).toBe('Cost per conversation is 40.53, 35% over the 30 target');
  });

  it('says there were no results and every ad set is held, with the reason and the lever (Tours)', () => {
    const brief = portfolioBriefSchema.parse(briefOf(tours));
    expect(brief.hero.module).toBe('none');
    expect(brief.hero.headline).toBe('No conversations in 14 days — all 12 ad sets are held');
    expect(brief.hero.why).toContain('154.75');
    expect(brief.hero.why).toContain('different result');
    expect(brief.hero.why).toMatch(/Move them to a portfolio that measures what they buy/);
  });

  it('says there were no results even without a standing', () => {
    expect(briefOf(tours, false).hero.headline).toBe('No conversations in 14 days on 154.75 spent');
  });

  it('never claims the plan when cost is materially over target', () => {
    const over = { ...growth, cost_per_result: 81, target: 70 }; // +16%
    const brief = deterministicBrief({
      growth: over,
      candidates: [],
      dailyTotal: 500,
      standing: { confidence: 'medium', adsets_total: 4, adsets_held: 0, held_reason: null },
      promptVersion: 'v1',
      generatedAt: 'x',
    });
    expect(brief.hero.headline).toBe('Cost per lead is 81 USD, 16% over the 70 USD target');
    expect(brief.hero.why).not.toContain('floor today (');
  });

  it('holds the claim back, without claiming the plan, when confidence is low', () => {
    const brief = deterministicBrief({
      growth: { ...growth, cost_per_result: 90, target: 70 },
      candidates: [],
      dailyTotal: 500,
      standing: { confidence: 'low', adsets_total: 4, adsets_held: 0, held_reason: null },
      promptVersion: 'v1',
      generatedAt: 'x',
    });
    expect(brief.hero.headline).not.toContain('on its plan');
    expect(brief.hero.headline).toBe('Cost per lead is 90 USD against a 70 USD target');
    expect(brief.hero.why).toContain('too little data');
  });

  it('says every ad set is held even when results arrive', () => {
    const brief = deterministicBrief({
      growth,
      candidates: [],
      dailyTotal: 500,
      standing: {
        confidence: 'high',
        adsets_total: 3,
        adsets_held: 3,
        held_reason: 'no_own_budget',
      },
      promptVersion: 'v1',
      generatedAt: 'x',
    });
    expect(brief.hero.headline).toBe('All 3 ad sets are held — the optimizer is not moving budget');
    expect(brief.hero.why).toMatch(/daily budget/);
  });

  it('keeps the calm line when the portfolio is within 15% of target', () => {
    const brief = deterministicBrief({
      growth: { ...growth, cost_per_result: 78.05, target: 70 }, // +11.5%
      candidates: [],
      dailyTotal: 500,
      standing: { confidence: 'high', adsets_total: 4, adsets_held: 0, held_reason: null },
      promptVersion: 'v1',
      generatedAt: 'x',
    });
    expect(brief.hero.headline).toBe(
      'Nothing worth changing today — the portfolio is on its plan.',
    );
  });

  it('fits the schema lengths on every path', () => {
    for (const body of [mensajes, tours]) {
      for (const withStanding of [true, false]) {
        for (const currency of [null, 'MXN']) {
          const priced = {
            ...body,
            hero_brief: {
              brief: {
                ...body.hero_brief.brief,
                growth: { ...body.hero_brief.brief.growth, currency },
              },
            },
          };
          const hero = briefOf(priced, withStanding).hero;
          // Whole sentences: the schema caps are never met by cutting one off.
          expect(hero.headline.length).toBeLessThanOrEqual(90);
          expect(hero.why.length).toBeLessThanOrEqual(240);
          expect(hero.why.endsWith('.')).toBe(true);
        }
      }
    }
  });
});

import { describe, expect, it } from 'bun:test';
import {
  aggregateAngle,
  angleClusterId,
  angleLabel,
  angleOpportunities,
  efficiencyClass,
  efficiencyRatio,
  PRISM_HOOK_TYPES,
} from './angleMethod';
import { creativeHookArchetypeSchema } from './taxonomy';

describe('label grammar', () => {
  it('prints offer · hook · format · funnel, and leads with the hook when there is no offer', () => {
    expect(
      angleLabel({
        angleId: 'offer_discount',
        hook: 'value_stack',
        format: 'static',
        funnelRole: 'bof',
        visualStyle: 'unknown',
      }),
    ).toBe('Discount offer · Value / price · static · BOF');
    expect(
      angleLabel({
        angleId: null,
        hook: 'social_proof',
        format: 'video',
        funnelRole: 'tof',
        visualStyle: 'ugc',
      }),
    ).toBe('Social proof · video · TOF');
  });
  it('gives two creatives the same cluster id only when every key part matches', () => {
    const a = angleClusterId({
      angleId: 'offer_discount',
      hook: 'value_stack',
      format: 'static',
      funnelRole: 'bof',
      visualStyle: 'ugc',
    });
    const b = angleClusterId({
      angleId: 'offer_discount',
      hook: 'value_stack',
      format: 'static',
      funnelRole: 'bof',
      visualStyle: 'studio',
    });
    const c = angleClusterId({
      angleId: 'offer_discount',
      hook: 'value_stack',
      format: 'video',
      funnelRole: 'bof',
      visualStyle: 'ugc',
    });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
  it('maps every Prism hook type onto a hook archetype the store already knows', () => {
    for (const archetype of Object.values(PRISM_HOOK_TYPES)) {
      expect(creativeHookArchetypeSchema.safeParse(archetype).success).toBe(true);
    }
  });
});

describe('efficiency ratio', () => {
  it('classifies converters, moderates and engagement traps at 10× and 100×', () => {
    expect(efficiencyClass(efficiencyRatio(0.02, 0.05))).toBe('quality_converter'); // 0.4×
    expect(efficiencyClass(efficiencyRatio(0.03, 0.001))).toBe('moderate'); // 30×
    expect(efficiencyClass(efficiencyRatio(0.05, 0.0002))).toBe('engagement_trap'); // 250×
    expect(efficiencyClass(efficiencyRatio(0.05, 0))).toBe('unknown');
    expect(efficiencyClass(null)).toBe('unknown');
  });
});

describe('aggregateAngle', () => {
  it('sums numerators and denominators — never averages the members’ ratios', () => {
    const stat = aggregateAngle('x', 'X', [
      { spend: 100, impressions: 10_000, clicks: 100, conversions: 10, ctrWoW: -0.3 },
      { spend: 300, impressions: 10_000, clicks: 400, conversions: 10, ctrWoW: 0.1 },
    ]);
    expect(stat.ctr).toBeCloseTo(500 / 20_000, 6);
    expect(stat.cvr).toBeCloseTo(20 / 500, 6);
    expect(stat.cpa).toBe(20);
    expect(stat.ctrWoW).toBeCloseTo((-0.3 * 100 + 0.1 * 300) / 400, 6);
  });
});

describe('angleOpportunities', () => {
  const stat = (id: string, over: Partial<ReturnType<typeof aggregateAngle>>) => ({
    ...aggregateAngle(id, id, [
      { spend: 100, impressions: 10_000, clicks: 100, conversions: 5 },
      { spend: 100, impressions: 10_000, clicks: 100, conversions: 5 },
    ]),
    ...over,
  });
  it('kills traps, refreshes fatigued angles, scales quality converters, flags emerging ones', () => {
    const trap = stat('trap', { class: 'engagement_trap', ratio: 250 });
    const tired = stat('tired', { ctrWoW: -0.25 });
    const winner = stat('winner', { class: 'quality_converter', ratio: 2, cpa: 10 });
    const laggard = stat('laggard', { class: 'quality_converter', ratio: 3, cpa: 80 });
    const solo = { ...stat('solo', { members: 1 }), spend: 60 };
    const kinds = angleOpportunities([trap, tired, winner, laggard, solo]).map((o) => [
      o.kind,
      o.angleId,
    ]);
    expect(kinds).toEqual([
      ['kill_trap', 'trap'],
      ['refresh_fatigued', 'tired'],
      ['scale_winning', 'winner'],
      ['emerging', 'solo'],
    ]);
  });
  it('ignores clusters that are neither two creatives nor 5% of spend', () => {
    const big = stat('big', { class: 'quality_converter', ratio: 2, cpa: 10 });
    const tiny = {
      ...stat('tiny', { members: 1, class: 'engagement_trap', ratio: 500 }),
      spend: 1,
    };
    expect(angleOpportunities([big, tiny]).some((o) => o.angleId === 'tiny')).toBe(false);
  });
  it('is empty with no spend', () => {
    expect(angleOpportunities([])).toEqual([]);
  });
});

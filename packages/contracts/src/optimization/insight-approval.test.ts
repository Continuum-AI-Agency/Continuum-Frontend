import { describe, expect, it } from 'bun:test';
import { accountDetectorSchema, isGuardDetector } from './account-strategy';
import {
  ACTION_FAMILY_COPY,
  actionFamilySchema,
  APPROVABLE_FAMILIES,
  AUTOPILOT_PREDICTIVENESS_FLOOR,
  DETECTOR_ACTION_FAMILY,
  insightStateSchema,
  resolveInsightState,
  shippedCeilings,
} from './insight-approval';

describe('every detector answers to exactly one family', () => {
  it('places all twenty-five', () => {
    for (const detector of accountDetectorSchema.options) {
      expect(actionFamilySchema.options).toContain(DETECTOR_ACTION_FAMILY[detector]);
    }
    expect(Object.keys(DETECTOR_ACTION_FAMILY)).toHaveLength(25);
  });

  it('puts both guards where nothing can be approved', () => {
    for (const detector of accountDetectorSchema.options) {
      if (isGuardDetector(detector)) expect(DETECTOR_ACTION_FAMILY[detector]).toBe('measurement');
    }
  });

  it('keeps structure out of budget — it turns things OFF', () => {
    expect(DETECTOR_ACTION_FAMILY.dead_tail).toBe('structure');
    expect(DETECTOR_ACTION_FAMILY.structure_consolidation).toBe('structure');
    expect(DETECTOR_ACTION_FAMILY.portfolio_reallocation).toBe('budget');
  });

  it('gives measurement no switch at all', () => {
    // A boolean here would be a control in the data for something that has no control,
    // and someone would eventually turn it off.
    expect(APPROVABLE_FAMILIES).not.toContain('measurement' as never);
    expect(APPROVABLE_FAMILIES).toHaveLength(6);
  });

  it('gives every family words a person can read', () => {
    for (const family of actionFamilySchema.options) {
      expect(ACTION_FAMILY_COPY[family].label.length).toBeGreaterThan(0);
      expect(ACTION_FAMILY_COPY[family].body.length).toBeGreaterThan(0);
    }
  });
});

describe('the one rule: an insight can never exceed its family', () => {
  it('lowers an autopilot insight inside a recommend family, and SAYS it lowered it', () => {
    const r = resolveInsightState({
      detector: 'portfolio_reallocation',
      insight: 'autopilot',
      familyCeiling: 'recommend',
    });
    expect(r.effective).toBe('recommend');
    expect(r.lowered).toBe(true);
  });

  it('never reports a silent downgrade', () => {
    // A state that was asked for and did not take must be visible, or someone sets a detector
    // to autopilot, sees nothing happen, and stops trusting the switch.
    const r = resolveInsightState({
      detector: 'dead_tail',
      insight: 'autopilot',
      familyCeiling: 'off',
    });
    expect(r.effective).toBe('off');
    expect(r.lowered).toBe(true);
  });

  it('leaves an insight at or below the ceiling alone', () => {
    const r = resolveInsightState({
      detector: 'portfolio_reallocation',
      insight: 'recommend',
      familyCeiling: 'autopilot',
    });
    expect(r.effective).toBe('recommend');
    expect(r.lowered).toBe(false);
  });

  it('falls back to the family when nobody set the insight', () => {
    expect(
      resolveInsightState({ detector: 'creative_supply', familyCeiling: 'autopilot' }).effective,
    ).toBe('autopilot');
  });

  it('makes the kill switch one move', () => {
    // Every family at recommend means nothing acts, whatever any per-insight setting says.
    for (const detector of accountDetectorSchema.options) {
      const r = resolveInsightState({ detector, insight: 'autopilot', familyCeiling: 'recommend' });
      expect(r.effective).not.toBe('autopilot');
    }
  });

  it('cannot silence measurement, whatever anyone sets', () => {
    for (const setting of insightStateSchema.options) {
      const r = resolveInsightState({
        detector: 'measurement_integrity',
        insight: setting,
        familyCeiling: 'off',
      });
      expect(r.effective).toBe('recommend');
      expect(r.lowered).toBe(false);
    }
  });
});

describe('autopilot is only offered where the profile was measured', () => {
  it('gives a measured, predictive objective unattended budget and nothing else', () => {
    const ceilings = shippedCeilings({ calibrated: true, predictiveness: 0.8, rung: 'money' });
    expect(ceilings.budget).toBe('autopilot');
    for (const family of ['creative_swap', 'audience_change', 'structure'] as const) {
      expect(ceilings[family]).toBe('recommend');
    }
  });

  it('refuses a borrowed prior, however high the number looks', () => {
    // An uncalibrated profile's predictiveness is somebody else's Spearman.
    expect(shippedCeilings({ calibrated: false, predictiveness: 0.88, rung: 'person' }).budget).toBe('recommend');
  });

  it('excludes the noisiest measured objective by the number, not by naming it', () => {
    // lead and conversations sit at 0.45; the floor is above them and below signup's 0.75.
    expect(shippedCeilings({ calibrated: true, predictiveness: 0.45, rung: 'person' }).budget).toBe('recommend');
    expect(shippedCeilings({ calibrated: true, predictiveness: 0.75, rung: 'person' }).budget).toBe('autopilot');
    expect(AUTOPILOT_PREDICTIVENESS_FLOOR).toBeGreaterThan(0.45);
    expect(AUTOPILOT_PREDICTIVENESS_FLOOR).toBeLessThan(0.75);
  });

  it('ships nothing unattended outside budget, on any objective', () => {
    const ceilings = shippedCeilings({ calibrated: true, predictiveness: 0.88, rung: 'person' });
    const unattended = Object.entries(ceilings).filter(([, s]) => s === 'autopilot');
    expect(unattended.map(([f]) => f)).toEqual(['budget']);
  });

  it('refuses a proxy objective however measured and predictive it is', () => {
    // traffic and awareness are both calibrated AND at 0.82. Under measurement and
    // predictiveness alone they would earn unattended budget — and automating money toward a
    // cheaper landing-page view is automating "buy more of the thing that may not matter".
    expect(shippedCeilings({ calibrated: true, predictiveness: 0.82, rung: 'intent' }).budget).toBe(
      'recommend',
    );
    expect(
      shippedCeilings({ calibrated: true, predictiveness: 0.82, rung: 'attention' }).budget,
    ).toBe('recommend');
  });

  it('leaves each exclusion its OWN reason rather than one blanket rule', () => {
    // borrowed prior · too noisy · buying a proxy — three different failures, three tests.
    expect(shippedCeilings({ calibrated: false, predictiveness: 0.9, rung: 'money' }).budget).toBe('recommend');
    expect(shippedCeilings({ calibrated: true, predictiveness: 0.45, rung: 'money' }).budget).toBe('recommend');
    expect(shippedCeilings({ calibrated: true, predictiveness: 0.9, rung: 'intent' }).budget).toBe('recommend');
    expect(shippedCeilings({ calibrated: true, predictiveness: 0.9, rung: 'money' }).budget).toBe('autopilot');
  });
});

import { describe, expect, it } from 'bun:test';
import { RESULT_RUNG, resultRungFor } from './account-strategy';
import {
  analogNote,
  analogObjectiveSchema,
  conversionDescriptorSchema,
  inferAnalog,
  SLOW_EVENT_DAYS,
  SPARSE_EVENTS_PER_WEEK,
} from './custom-conversion';
import { OptimizationObjectiveSchema } from './engine-contracts';
import { getOptimizationMetricDefinition } from './service';

const descriptor = (over: Record<string, unknown> = {}) =>
  conversionDescriptorSchema.parse({
    event_id: 'crm_mql',
    result_label: 'Qualified leads',
    cost_label: 'Cost per qualified lead',
    analog: 'lead',
    typical_lag_days: 4,
    events_per_week: 12,
    ...over,
  });

describe('the twelfth objective exists', () => {
  it('is in the enum, so a portfolio can hold it', () => {
    expect(OptimizationObjectiveSchema.options).toContain('custom');
  });

  it('has a profile and a metric definition like every other objective', () => {
    expect(getOptimizationMetricDefinition('custom').costLabel.length).toBeGreaterThan(0);
  });

  it('can only borrow from a MEASURED objective, never from another custom', () => {
    expect(analogObjectiveSchema.options).toEqual(['purchase', 'signup', 'lead']);
    expect(() => descriptor({ analog: 'custom' })).toThrow();
    expect(() => descriptor({ analog: 'conversations' })).toThrow();
  });
});

describe('the analog is inferred, not asked for', () => {
  it('treats an event carrying value as the money itself', () => {
    expect(inferAnalog({ typicalLagDays: 0, eventsPerWeek: 500, carriesRevenue: true })).toBe(
      'purchase',
    );
  });

  it('gives a slow event the noisy profile', () => {
    // A CRM-fired qualified lead at four days is exactly what `lead` was calibrated on.
    expect(
      inferAnalog({ typicalLagDays: SLOW_EVENT_DAYS, eventsPerWeek: 500, carriesRevenue: false }),
    ).toBe('lead');
  });

  it('gives a sparse event the noisy profile too, however fast it is', () => {
    expect(
      inferAnalog({
        typicalLagDays: 0,
        eventsPerWeek: SPARSE_EVENTS_PER_WEEK - 1,
        carriesRevenue: false,
      }),
    ).toBe('lead');
  });

  it('gives a dense same-day event the one that scales freely', () => {
    expect(inferAnalog({ typicalLagDays: 0, eventsPerWeek: 300, carriesRevenue: false })).toBe(
      'signup',
    );
  });

  it('lets revenue beat both other signals — it is the money, not a step toward it', () => {
    expect(inferAnalog({ typicalLagDays: 9, eventsPerWeek: 1, carriesRevenue: true })).toBe(
      'purchase',
    );
  });
});

describe('a wrong guess has to be visible, or it is not correctable', () => {
  it('says what it inferred and why, and invites disagreement', () => {
    const note = analogNote(descriptor());
    expect(note).toContain('lead');
    expect(note).toContain('4 days');
    expect(note).toContain('Change it');
  });

  it('stops explaining once a person has decided', () => {
    const note = analogNote(descriptor({ analog_source: 'declared', analog: 'purchase' }));
    expect(note).toContain('because you said so');
    expect(note).not.toContain('Change it');
  });
});

describe('a custom conversion sits on its analog’s rung, not on a fixed one', () => {
  it('follows the analog rather than the placeholder', () => {
    // The static entry is 'person'. An event carrying revenue belongs on 'money', and the
    // difference decides whether the economics guard wants a margin or a close rate.
    expect(RESULT_RUNG.custom).toBe('person');
    expect(resultRungFor('custom', 'purchase')).toBe('money');
    expect(resultRungFor('custom', 'lead')).toBe('person');
  });

  it('falls back to the cautious placeholder when no analog is known', () => {
    expect(resultRungFor('custom', null)).toBe('person');
    expect(resultRungFor('custom')).toBe('person');
  });

  it('leaves every other objective exactly where it was', () => {
    for (const objective of OptimizationObjectiveSchema.options) {
      if (objective === 'custom') continue;
      expect(resultRungFor(objective, 'purchase')).toBe(RESULT_RUNG[objective]);
    }
  });
});

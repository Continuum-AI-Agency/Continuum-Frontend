import { describe, expect, it } from 'bun:test';
import {
  interestRefsOf,
  metaTargetingSpecSchema,
  summarizeTargetingSpec,
  targetingSummaryLine,
} from './meta-targeting';

const spec = metaTargetingSpecSchema.parse({
  age_min: 25,
  age_max: 54,
  genders: [2],
  geo_locations: { countries: ['MX'], cities: [{ key: '2418779', name: 'Monterrey' }] },
  flexible_spec: [
    {
      interests: [
        { id: '1', name: 'Gyms' },
        { id: '2', name: 'Fitness' },
      ],
    },
    { behaviors: [{ id: '9', name: 'Engaged shoppers' }] },
  ],
  interests: [{ id: '2', name: 'Fitness' }],
  custom_audiences: [{ id: 'ca1' }],
  targeting_automation: { advantage_audience: 1 },
  some_future_field: true,
});

describe('meta targeting spec', () => {
  it('reads interests from every clause without duplicates and keeps unknown fields', () => {
    expect(interestRefsOf(spec).map((r) => r.id)).toEqual(['2', '1']);
    expect((spec as Record<string, unknown>).some_future_field).toBe(true);
  });
  it('summarises the spec the way the card reads it', () => {
    const s = summarizeTargetingSpec(spec);
    expect(s).toMatchObject({
      age: '25–54',
      gender: 'women',
      geo: ['MX', '+1 region/cities'],
      customAudienceCount: 1,
      advantageAudience: true,
    });
    expect(targetingSummaryLine(spec)).toBe(
      '25–54 · women · MX, +1 region/cities · 2 interests · 1 custom audience · Advantage+',
    );
    expect(targetingSummaryLine({})).toBe('any age · all · anywhere');
  });
});

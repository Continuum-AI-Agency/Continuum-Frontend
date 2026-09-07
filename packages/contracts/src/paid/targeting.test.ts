import { describe, expect, test } from 'bun:test';
import {
  audienceTypeFromTargeting,
  canonicalizeTargeting,
  normalizeTargeting,
} from './targeting';

describe('audienceTypeFromTargeting', () => {
  test('an included custom audience is warm', () => {
    expect(audienceTypeFromTargeting({ custom_audiences: [{ id: '123', name: 'Buyers' }] })).toBe(
      'retargeting',
    );
  });

  test('excluding customers is what prospecting looks like, not the opposite', () => {
    expect(
      audienceTypeFromTargeting({
        excluded_custom_audiences: [{ id: '123' }],
        geo_locations: { countries: ['MX'] },
      }),
    ).toBe('prospecting');
  });

  test('no spec is unknown, which takes the STRICTER frequency cap', () => {
    expect(audienceTypeFromTargeting(null)).toBe('unknown');
    expect(audienceTypeFromTargeting(undefined)).toBe('unknown');
  });
});

describe('normalizeTargeting', () => {
  test('flattens the four per-platform placement arrays into one list', () => {
    const n = normalizeTargeting({
      facebook_positions: ['feed', 'story'],
      instagram_positions: ['story'],
      publisher_platforms: ['facebook', 'instagram'],
      age_min: 25,
      age_max: 54,
      genders: [1],
    });
    expect(n.placements).toEqual(['feed', 'story']);
    expect(n.publisherPlatforms).toEqual(['facebook', 'instagram']);
    expect(n.ageMin).toBe(25);
    expect(n.ageMax).toBe(54);
    expect(n.genders).toEqual([1]);
  });

  test('keeps geo granularity in the key so a country and a region cannot collide', () => {
    const n = normalizeTargeting({
      geo_locations: { countries: ['MX'], regions: [{ key: 'x', id: 'MX' }] },
    });
    expect(n.geoNodeIds).toContain('countries:MX');
    expect(n.geoNodeIds).toContain('regions:MX');
  });

  test('reads audience ids whether Meta sends objects or bare strings', () => {
    expect(normalizeTargeting({ custom_audiences: ['1', { id: '2' }] }).customAudienceIds).toEqual([
      '1',
      '2',
    ]);
  });
});

describe('canonicalizeTargeting', () => {
  test('key order out of Meta cannot change the hash', () => {
    // Without this the dedupe index never matches and an unchanged ad set writes a row
    // every cycle instead of one a day.
    expect(canonicalizeTargeting({ a: 1, b: { c: 2, d: 3 } })).toBe(
      canonicalizeTargeting({ b: { d: 3, c: 2 }, a: 1 }),
    );
  });

  test('array order is preserved, because in a targeting spec it can mean something', () => {
    expect(canonicalizeTargeting({ x: [1, 2] })).not.toBe(canonicalizeTargeting({ x: [2, 1] }));
  });
});

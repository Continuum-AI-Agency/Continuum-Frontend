import { describe, expect, test } from 'bun:test';
import { hasInstagramBrandContext, instagramProfileSchema } from './instagram';
import {
  onboardingIntakeSchema,
  onboardingSocialInputSchema,
  onboardingSourceResponseSchema,
} from './intake';

describe('onboarding intake', () => {
  test('requires context appropriate to the source', () => {
    expect(
      onboardingIntakeSchema.safeParse({
        kind: 'description',
        brand_name: 'Acme',
        description: '   ',
      }).success,
    ).toBe(false);
    expect(onboardingIntakeSchema.safeParse({ kind: 'website', brand_name: 'Acme' }).success).toBe(
      false,
    );
    expect(
      onboardingIntakeSchema.parse({
        kind: 'description',
        brand_name: 'Acme',
        description: 'Solar installation for local homes.',
      }).url,
    ).toBeNull();
    expect(onboardingIntakeSchema.parse({ kind: 'documents', brand_name: 'Acme' }).kind).toBe(
      'documents',
    );
    expect(
      onboardingIntakeSchema.safeParse({
        kind: 'facebook',
        brand_name: 'Acme',
        url: 'https://instagram.com/acme',
      }).success,
    ).toBe(false);
  });
  test('canonicalizes profiles without mixing them into websites', () => {
    expect(onboardingSocialInputSchema.parse('@ACME')).toEqual({
      kind: 'instagram',
      url: 'https://www.instagram.com/acme/',
    });
    expect(onboardingSocialInputSchema.parse('m.facebook.com/Acme?ref=share')).toEqual({
      kind: 'facebook',
      url: 'https://www.facebook.com/Acme',
    });
    for (const input of [
      'https://instagram.com/p/abc',
      'https://facebook.com/groups/abc',
      'https://facebook.com/acme/posts/1',
      'https://facebook.com.evil.example/acme',
      'https://secret@facebook.com/acme',
    ]) {
      expect(onboardingSocialInputSchema.safeParse(input).success).toBe(false);
    }
  });
  test('keeps legacy website and Instagram scrape responses readable', () => {
    expect(
      onboardingSourceResponseSchema.parse({
        kind: 'web',
        via: 'direct',
        scrape: { url: 'https://acme.example', colors: [] },
      }).kind,
    ).toBe('web');
    expect(
      onboardingSourceResponseSchema.parse({
        kind: 'instagram',
        via: 'instagram_og_scrape',
        instagram_profile: {
          handle: 'acme',
          url: 'https://instagram.com/acme',
          source: 'og_scrape',
          fetched_at: '2026-10-10T00:00:00Z',
          og_description: 'Solar installation for local homes.',
        },
      }).kind,
    ).toBe('instagram');
  });
});

test('generic Instagram login metadata and a name alone are not brand context', () => {
  const profile = instagramProfileSchema.parse({
    handle: 'acme',
    url: 'https://instagram.com/acme',
    source: 'og_scrape',
    fetched_at: '2026-10-10T00:00:00Z',
    og_title: 'Acme',
    og_image: 'https://instagram.com/logo.png',
  });
  expect(hasInstagramBrandContext(profile)).toBe(false);
  expect(
    hasInstagramBrandContext({ ...profile, og_description: 'Log into Instagram to see photos.' }),
  ).toBe(false);
  expect(
    hasInstagramBrandContext({ ...profile, biography: 'Solar installation for homeowners.' }),
  ).toBe(true);
});

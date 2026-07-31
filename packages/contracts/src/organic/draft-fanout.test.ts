import { describe, expect, it } from 'bun:test';
import {
  deriveSiblingClientKey,
  draftFanOutRequestSchema,
  draftFanOutResponseSchema,
  parseSiblingClientKey,
  SIBLING_CLIENT_KEY_SEPARATOR,
} from './draft-fanout';

describe('deriveSiblingClientKey', () => {
  it('appends the platform behind the separator', () => {
    expect(deriveSiblingClientKey('placement_1', 'linkedin')).toBe('placement_1::linkedin');
    expect(SIBLING_CLIENT_KEY_SEPARATOR).toBe('::');
  });

  it('is deterministic — the same input yields the same key', () => {
    expect(deriveSiblingClientKey('placement_1', 'facebook')).toBe(
      deriveSiblingClientKey('placement_1', 'facebook'),
    );
  });

  it('yields a distinct key per platform', () => {
    const keys = new Set(
      (['instagram', 'facebook', 'linkedin'] as const).map((platform) =>
        deriveSiblingClientKey('placement_1', platform),
      ),
    );
    expect(keys.size).toBe(3);
  });
});

describe('parseSiblingClientKey', () => {
  it('round-trips a derived key', () => {
    expect(parseSiblingClientKey(deriveSiblingClientKey('placement_1', 'linkedin'))).toEqual({
      sourceClientKey: 'placement_1',
      platform: 'linkedin',
    });
  });

  it('returns null for a bare source key', () => {
    expect(parseSiblingClientKey('placement_1')).toBeNull();
  });

  it('returns null when the suffix is not a publish platform', () => {
    // youtube is the standing example of a platform drafts can name but nothing can publish.
    expect(parseSiblingClientKey('placement_1::youtube')).toBeNull();
  });

  it('splits on the LAST separator so a source key containing "::" round-trips', () => {
    const source = 'plan::2026-08-01::slot_3';
    expect(parseSiblingClientKey(deriveSiblingClientKey(source, 'facebook'))).toEqual({
      sourceClientKey: source,
      platform: 'facebook',
    });
  });
});

describe('draftFanOutRequestSchema', () => {
  it('accepts one to three unique platforms', () => {
    expect(draftFanOutRequestSchema.safeParse({ platforms: ['instagram'] }).success).toBe(true);
    expect(
      draftFanOutRequestSchema.safeParse({ platforms: ['instagram', 'facebook', 'linkedin'] })
        .success,
    ).toBe(true);
  });

  it('rejects an empty selection', () => {
    expect(draftFanOutRequestSchema.safeParse({ platforms: [] }).success).toBe(false);
  });

  it('rejects duplicates', () => {
    expect(
      draftFanOutRequestSchema.safeParse({ platforms: ['instagram', 'instagram'] }).success,
    ).toBe(false);
  });

  it('rejects a platform with no publisher', () => {
    expect(draftFanOutRequestSchema.safeParse({ platforms: ['youtube'] }).success).toBe(false);
  });

  it('accepts a PARTIAL accounts map — the exhaustive z.record trap', () => {
    const parsed = draftFanOutRequestSchema.safeParse({
      platforms: ['instagram', 'linkedin'],
      accounts: { linkedin: 'urn:li:org:1' },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an empty account id', () => {
    expect(
      draftFanOutRequestSchema.safeParse({ platforms: ['instagram'], accounts: { instagram: '' } })
        .success,
    ).toBe(false);
  });
});

describe('draftFanOutResponseSchema', () => {
  it('parses a full fan-out result', () => {
    const parsed = draftFanOutResponseSchema.safeParse({
      sourceId: 'draft_1',
      sourcePlatform: 'instagram',
      groupId: '00000000-0000-4000-8000-000000000001',
      members: [
        {
          id: 'draft_1',
          platform: 'instagram',
          clientKey: 'placement_1',
          platformAccountId: 'ig_1',
          status: 'approved',
          isSource: true,
          created: false,
        },
        {
          id: 'draft_2',
          platform: 'linkedin',
          clientKey: 'placement_1::linkedin',
          platformAccountId: 'li_1',
          status: 'approved',
          isSource: false,
          created: true,
        },
      ],
      removed: [{ id: 'draft_3', platform: 'facebook' }],
      retained: [{ id: 'draft_4', platform: 'facebook', reason: 'published' }],
    });
    expect(parsed.success).toBe(true);
  });
});

import { describe, expect, it } from 'bun:test';
import {
  LIBRARY_PROXY_LADDER,
  LIBRARY_VIDEO_PLAYBACK_ROLES,
  libraryPlaybackSchema,
  SCRUB_SPRITE_TILES,
  scrubSpriteTile,
} from './library-playback';

describe('scrubSpriteTile', () => {
  it('maps the clip onto the 10×10 sheet in reading order', () => {
    expect(scrubSpriteTile(0)).toMatchObject({ index: 0, column: 0, row: 0 });
    expect(scrubSpriteTile(0.5)).toMatchObject({ index: 50, column: 0, row: 5 });
    expect(scrubSpriteTile(0.999)).toMatchObject({ index: 99, column: 9, row: 9 });
  });

  it('clamps the ends and garbage onto the sheet', () => {
    expect(scrubSpriteTile(1).index).toBe(SCRUB_SPRITE_TILES - 1);
    expect(scrubSpriteTile(-3).index).toBe(0);
    expect(scrubSpriteTile(Number.NaN).index).toBe(0);
  });

  it('positions a background sized to the whole sheet exactly on the tile', () => {
    expect(scrubSpriteTile(0).backgroundPosition).toBe('0.0000% 0.0000%');
    expect(scrubSpriteTile(0.999).backgroundPosition).toBe('100.0000% 100.0000%');
    expect(scrubSpriteTile(0.13).backgroundPosition).toBe('33.3333% 11.1111%');
  });
});

describe('ladder', () => {
  it('runs largest first with preview_video as the 720 rung', () => {
    const sides = LIBRARY_PROXY_LADDER.map((rung) => rung.shortSide);
    expect(sides).toEqual([...sides].sort((a, b) => b - a));
    expect(LIBRARY_PROXY_LADDER.find((rung) => rung.role === 'preview_video')?.shortSide).toBe(720);
    expect(LIBRARY_VIDEO_PLAYBACK_ROLES).toContain('scrub_sprite');
  });

  it('parses a signed playback payload and refuses an unknown role', () => {
    const base = {
      assetId: '00000000-0000-4000-8000-000000000001',
      assetVersionId: '00000000-0000-4000-8000-000000000002',
      sprite: null,
      audioProxy: null,
    };
    const rung = {
      role: 'proxy_1080',
      label: '1080p',
      width: 1920,
      height: 1080,
      sizeBytes: 10,
      mimeType: 'video/mp4',
      hdr: false,
      signedUrl: 'https://x.supabase.co/a.mp4',
    };
    expect(libraryPlaybackSchema.safeParse({ ...base, rungs: [rung] }).success).toBe(true);
    expect(
      libraryPlaybackSchema.safeParse({ ...base, rungs: [{ ...rung, role: 'poster' }] }).success,
    ).toBe(false);
  });
});

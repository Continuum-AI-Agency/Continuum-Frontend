import { describe, expect, it } from 'bun:test';
import { jainaPlatformParam, jainaPromptHref } from './deepLink';

describe('jainaPromptHref', () => {
  it('opens the Jaina tab with the prompt encoded and last', () => {
    expect(jainaPromptHref('Where is the budget?')).toBe(
      '/scale?tab=jaina&prompt=Where%20is%20the%20budget%3F',
    );
  });

  it('carries the platform a question was asked from, before the prompt', () => {
    expect(jainaPromptHref('Q & A', 'google_ads')).toBe(
      '/scale?tab=jaina&platform=google_ads&prompt=Q%20%26%20A',
    );
    expect(jainaPromptHref('Q', null)).toBe('/scale?tab=jaina&prompt=Q');
  });
});

describe('jainaPlatformParam', () => {
  it('reads the three platform ids and nothing else', () => {
    expect(jainaPlatformParam('google_ads')).toBe('google_ads');
    expect(jainaPlatformParam('tiktok_ads')).toBe('tiktok_ads');
    expect(jainaPlatformParam('meta')).toBe('meta');
    expect(jainaPlatformParam('all')).toBeNull();
    expect(jainaPlatformParam('google')).toBeNull();
    expect(jainaPlatformParam(null)).toBeNull();
  });

  it('round-trips the platform a href carries', () => {
    const href = jainaPromptHref('Which video is fatiguing?', 'tiktok_ads');
    const params = new URL(href, 'https://app.example').searchParams;
    expect(jainaPlatformParam(params.get('platform'))).toBe('tiktok_ads');
    expect(params.get('prompt')).toBe('Which video is fatiguing?');
  });
});

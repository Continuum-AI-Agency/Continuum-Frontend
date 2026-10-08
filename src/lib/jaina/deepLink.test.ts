import { describe, expect, it } from 'bun:test';
import {
  jainaNewConversationParam,
  jainaOpeningSessionId,
  jainaPlatformParam,
  jainaPromptHref,
} from './deepLink';

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

describe('a new conversation', () => {
  it('carries `new=1` before the prompt when the question opens its own conversation', () => {
    expect(jainaPromptHref('Q', 'google_ads', { newConversation: true })).toBe(
      '/scale?tab=jaina&platform=google_ads&new=1&prompt=Q',
    );
    expect(jainaPromptHref('Q', null, { newConversation: true })).toBe(
      '/scale?tab=jaina&new=1&prompt=Q',
    );
  });

  it('leaves the param off by default, so other entry points keep the latest conversation', () => {
    expect(jainaPromptHref('Q', 'google_ads')).not.toContain('new=');
  });

  it('reads only `1` as a new conversation', () => {
    const href = jainaPromptHref('Is Search limited?', 'google_ads', { newConversation: true });
    const params = new URL(href, 'https://app.example').searchParams;
    expect(jainaNewConversationParam(params.get('new'))).toBe(true);
    expect(jainaNewConversationParam(null)).toBe(false);
    expect(jainaNewConversationParam('0')).toBe(false);
    expect(jainaNewConversationParam('true')).toBe(false);
  });
});

describe('jainaOpeningSessionId — which conversation the Jaina tab opens on', () => {
  it('opens the most recent conversation by default', () => {
    expect(
      jainaOpeningSessionId({
        deepLinkSessionId: null,
        newConversation: false,
        latestSessionId: 's-latest',
      }),
    ).toBe('s-latest');
  });

  it('opens none when the link asks for a new conversation: the fresh session stands', () => {
    expect(
      jainaOpeningSessionId({
        deepLinkSessionId: null,
        newConversation: true,
        latestSessionId: 's-latest',
      }),
    ).toBeNull();
  });

  it('a named session wins over both', () => {
    expect(
      jainaOpeningSessionId({
        deepLinkSessionId: 's-1',
        newConversation: true,
        latestSessionId: 's-latest',
      }),
    ).toBe('s-1');
  });
});

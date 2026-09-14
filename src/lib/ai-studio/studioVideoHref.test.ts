import { describe, expect, test } from 'bun:test';
import { parseStudioVideoView, studioVideoHref } from './studioVideoHref';

describe('studioVideoHref', () => {
  test('canvas assembly is the default editor door', () => {
    expect(
      studioVideoHref({
        projectId: '11111111-1111-4111-8111-111111111111',
        origin: 'canvas',
        view: 'assembly',
      }),
    ).toBe('/studio/video/11111111-1111-4111-8111-111111111111?origin=canvas&view=assembly');
  });

  test('motion view is a first-class query, not a production stage', () => {
    expect(
      studioVideoHref({
        projectId: '11111111-1111-4111-8111-111111111111',
        origin: 'canvas',
        view: 'motion',
      }),
    ).toContain('view=motion');
  });
});

describe('parseStudioVideoView', () => {
  test('accepts only assembly and motion', () => {
    expect(parseStudioVideoView('motion')).toBe('motion');
    expect(parseStudioVideoView('assembly')).toBe('assembly');
    expect(parseStudioVideoView('style')).toBeUndefined();
    expect(parseStudioVideoView(undefined)).toBeUndefined();
  });
});

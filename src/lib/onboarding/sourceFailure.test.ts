import { describe, expect, it } from 'bun:test';
import {
  SOURCE_TIMEOUT_MESSAGE,
  SOURCE_UNREACHABLE_MESSAGE,
  sourceFailureMessage,
} from './sourceFailure';

describe('sourceFailureMessage', () => {
  it('never shows a browser network error', () => {
    for (const text of [
      'Failed to fetch',
      'Load failed',
      'NetworkError when attempting to fetch',
    ]) {
      expect(sourceFailureMessage(new TypeError(text))).toBe(SOURCE_UNREACHABLE_MESSAGE);
    }
  });

  it('says a timeout took too long', () => {
    expect(sourceFailureMessage(new DOMException('signal timed out', 'TimeoutError'))).toBe(
      SOURCE_TIMEOUT_MESSAGE,
    );
  });

  it('replaces Backend reason codes and empty reasons, keeps sentences', () => {
    expect(sourceFailureMessage(new Error('all_scrapers_failed'))).toBe(SOURCE_UNREACHABLE_MESSAGE);
    expect(sourceFailureMessage(new Error(''))).toBe(SOURCE_UNREACHABLE_MESSAGE);
    const sentence = 'Enter a Facebook business Page URL, rather than a post or group.';
    expect(sourceFailureMessage(new Error(sentence))).toBe(sentence);
  });
});

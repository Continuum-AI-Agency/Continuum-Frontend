import { describe, expect, it } from 'bun:test';
import { isRepeatSubmission, REPEAT_SUBMISSION_WINDOW_MS, submissionKey } from './sendGuard';

const key = submissionKey('Weekly recap', [], []);

describe('isRepeatSubmission', () => {
  it('treats the second click of a double click as the same send', () => {
    expect(
      isRepeatSubmission({
        next: { key, at: 1_200 },
        previous: { key, at: 1_000 },
        inFlightKeys: new Set(),
      }),
    ).toBe(true);
  });

  it('never sends a turn twice while the first is still being set up', () => {
    expect(
      isRepeatSubmission({
        next: { key, at: 10_000 },
        previous: { key, at: 1_000 },
        inFlightKeys: new Set([key]),
      }),
    ).toBe(true);
  });

  it('lets the same question be asked again once the click has passed', () => {
    expect(
      isRepeatSubmission({
        next: { key, at: 1_000 + REPEAT_SUBMISSION_WINDOW_MS },
        previous: { key, at: 1_000 },
        inFlightKeys: new Set(),
      }),
    ).toBe(false);
  });

  it('never holds back a different question or the same text with other attachments', () => {
    const previous = { key, at: 1_000 };
    expect(
      isRepeatSubmission({
        next: { key: submissionKey('Monthly recap', [], []), at: 1_100 },
        previous,
        inFlightKeys: new Set(),
      }),
    ).toBe(false);
    expect(
      isRepeatSubmission({
        next: { key: submissionKey('Weekly recap', ['att-1'], []), at: 1_100 },
        previous,
        inFlightKeys: new Set(),
      }),
    ).toBe(false);
  });

  it('reads surrounding whitespace as the same text', () => {
    expect(submissionKey('  Weekly recap ', [], [])).toBe(key);
  });
});

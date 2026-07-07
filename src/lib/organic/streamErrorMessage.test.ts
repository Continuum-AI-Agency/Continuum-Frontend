import { describe, expect, it } from 'bun:test';
import { friendlyStreamError } from './streamErrorMessage';

describe('friendlyStreamError', () => {
  it('maps a serialized ZodError on the schedule time to a readable line', () => {
    const raw = JSON.stringify([
      {
        code: 'invalid_type',
        expected: 'string',
        received: 'undefined',
        path: ['placements', 2, 'schedule', 'scheduledAt'],
        message: 'Required',
      },
    ]);
    expect(friendlyStreamError(raw)).toBe("Couldn't apply the schedule time for post 3.");
  });

  it('handles a raw path fragment without valid JSON via the regex fallback', () => {
    const raw =
      'ZodError: [{ "code": "invalid_type", "path": [ "caption" ], "message": "Required" }]';
    expect(friendlyStreamError(raw)).toBe("Couldn't apply the caption.");
  });

  it('falls back to a generic line for a zod error on an unmapped field', () => {
    const raw = JSON.stringify([
      { code: 'custom', path: ['placements', 0, 'mysteryField'], message: 'nope' },
    ]);
    expect(friendlyStreamError(raw)).toBe("Some generated fields didn't validate — please retry.");
  });

  it('passes a plain human message through unchanged', () => {
    expect(friendlyStreamError('Meta rejected the upload')).toBe('Meta rejected the upload');
  });

  it('does not rewrite a message that merely mentions a path in prose', () => {
    const msg = 'The path to the file was invalid';
    expect(friendlyStreamError(msg)).toBe(msg);
  });

  it('returns a neutral fallback for an empty message', () => {
    expect(friendlyStreamError('')).toBe('Generation failed');
    expect(friendlyStreamError(null)).toBe('Generation failed');
  });
});

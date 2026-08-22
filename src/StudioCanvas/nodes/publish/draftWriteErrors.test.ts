import { describe, expect, it } from 'bun:test';
import { describeDraftWriteError } from './draftWriteErrors';

describe('describeDraftWriteError', () => {
  it('turns a lost concurrency race into an instruction, not a code', () => {
    const message = describeDraftWriteError(new Error('409 Conflict: {"error":"draft_changed"}'));
    expect(message).toContain('Re-select it');
    expect(message).not.toContain('draft_changed');
  });

  it('reads the code off a structured error body', () => {
    expect(describeDraftWriteError({ body: { error: 'day_required' } })).toBe(
      'Choose the day this new draft belongs on.',
    );
  });

  it('falls back to the error message when the code is unknown', () => {
    expect(describeDraftWriteError(new Error('network down'))).toBe('network down');
  });

  it('never returns an empty string', () => {
    expect(describeDraftWriteError(null)).toBe('Could not save this draft. Try again.');
    expect(describeDraftWriteError(new Error(''))).toBe('Could not save this draft. Try again.');
  });
});

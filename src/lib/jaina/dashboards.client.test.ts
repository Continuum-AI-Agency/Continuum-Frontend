import { describe, expect, test } from 'bun:test';
import { describeSupabaseError } from './dashboards.client';

describe('describeSupabaseError', () => {
  test('names a missing table as the pending migration', () => {
    expect(
      describeSupabaseError({ code: 'PGRST205', message: 'Could not find the table' }),
    ).toContain('migration 20260918150000');
  });
  test('joins message, details, hint and code; never prints undefined', () => {
    expect(describeSupabaseError({ message: 'x', details: 'y', hint: null, code: '23514' })).toBe(
      'x · y · code 23514',
    );
    expect(describeSupabaseError({})).toBe('{}');
    expect(describeSupabaseError(new Error('boom'))).toBe('boom');
  });
});

import { describe, expect, test } from 'bun:test';
import { canAccessGoals, GOALS_PRODUCTION_DISABLED_REASON } from './access';

describe('Goals preview access', () => {
  test('keeps production gated for ordinary users', () => {
    expect(canAccessGoals({ isAdmin: false, environment: 'production' })).toBe(false);
    expect(GOALS_PRODUCTION_DISABLED_REASON).toBe('Coming Soon');
  });

  test('allows admins and non-production environments', () => {
    expect(canAccessGoals({ isAdmin: true, environment: 'production' })).toBe(true);
    expect(canAccessGoals({ isAdmin: false, environment: 'preview' })).toBe(true);
    expect(canAccessGoals({ isAdmin: false, environment: 'development' })).toBe(true);
  });
});

import { describe, expect, test } from 'bun:test';
import { decideLowCreditsNudge } from './lowCreditsNudge';
import type { MeteredSidebarBilling } from './sidebarBilling';

const metered = (patch: Partial<MeteredSidebarBilling>): MeteredSidebarBilling => ({
  kind: 'metered',
  href: '/settings?section=billing#credits',
  planLabel: 'Canvas credits',
  remainingCredits: 80,
  includedRemainingCredits: 0,
  includedCredits: 0,
  rolloverCredits: 0,
  purchasedCredits: 80,
  periodEnd: null,
  autoBilling: { on: false },
  low: true,
  exhausted: false,
  ...patch,
});

const decide = (patch: Partial<Parameters<typeof decideLowCreditsNudge>[0]>) =>
  decideLowCreditsNudge({
    view: metered({}),
    owner: true,
    onBillingPage: false,
    alreadyNudged: false,
    ...patch,
  });

describe('decideLowCreditsNudge', () => {
  test('an owner running low is nudged once', () => {
    expect(decide({})).toBe('show');
    expect(decide({ alreadyNudged: true })).toBe('skip');
  });

  test('a recovered balance forgets the nudge, so the next dip nudges again', () => {
    expect(decide({ view: metered({ low: false }), alreadyNudged: true })).toBe('forget');
    expect(decide({ view: metered({ low: false }) })).toBe('skip');
  });

  test('never for a member, on the Billing page, at zero, or with auto-billing on', () => {
    expect(decide({ owner: false })).toBe('skip');
    expect(decide({ onBillingPage: true })).toBe('skip');
    expect(decide({ view: metered({ remainingCredits: 0, exhausted: true }) })).toBe('skip');
    expect(decide({ view: metered({ autoBilling: { on: true, capUsd: 100 } }) })).toBe('skip');
  });

  test('unmetered and planless brands are never nudged', () => {
    expect(decide({ view: { kind: 'managed', href: '/settings?section=billing' } })).toBe('skip');
    expect(decide({ view: null })).toBe('skip');
  });
});

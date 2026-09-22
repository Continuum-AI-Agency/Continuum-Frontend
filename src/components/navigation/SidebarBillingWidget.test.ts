import { describe, expect, test } from 'bun:test';
import type { MeteredSidebarBilling } from '@/lib/billing/sidebarBilling';
import { sidebarOpensTopUp } from './SidebarBillingWidget';

const metered = (patch: Partial<MeteredSidebarBilling>): MeteredSidebarBilling => ({
  kind: 'metered',
  href: '/settings?section=billing#credits',
  planLabel: 'Organic Plus',
  remainingCredits: 80,
  includedRemainingCredits: 0,
  includedCredits: 1000,
  rolloverCredits: 0,
  purchasedCredits: 80,
  periodEnd: null,
  autoBilling: { on: false },
  low: true,
  exhausted: false,
  ...patch,
});

describe('sidebarOpensTopUp', () => {
  test('a low meter opens Top up for the owner', () => {
    expect(sidebarOpensTopUp(metered({}), true)).toBe(true);
    expect(sidebarOpensTopUp(metered({ remainingCredits: 0, exhausted: true }), true)).toBe(true);
  });

  test('a healthy meter, a member, or a failed payment keeps the Billing link', () => {
    expect(sidebarOpensTopUp(metered({ low: false, remainingCredits: 900 }), true)).toBe(false);
    expect(sidebarOpensTopUp(metered({}), false)).toBe(false);
    expect(sidebarOpensTopUp(metered({ paymentFailed: true }), true)).toBe(false);
    expect(sidebarOpensTopUp({ kind: 'managed', href: '/settings?section=billing' }, true)).toBe(
      false,
    );
  });
});

import { describe, expect, it } from 'bun:test';
import { isStaffIdentity, isStaffUser } from './staff';

const confirmed = '2026-06-24T16:01:34Z';

describe('staff', () => {
  it('admins are staff on any email, confirmed or not', () => {
    const admin = { email: 'someone@gmail.com', app_metadata: { is_admin: true } };
    expect(isStaffIdentity(admin)).toBe(true);
    expect(isStaffUser(admin)).toBe(true);
  });

  it('a staff domain shows the affordance but needs confirmation at the boundary', () => {
    const unconfirmed = { email: 'Alexia@ContinuumAI.agency' };
    expect(isStaffIdentity(unconfirmed)).toBe(true);
    expect(isStaffUser(unconfirmed)).toBe(false);
    expect(isStaffUser({ ...unconfirmed, email_confirmed_at: confirmed })).toBe(true);
    expect(isStaffUser({ email: 'ops@trycontinuum.ai', email_confirmed_at: confirmed })).toBe(true);
  });

  it('rejects look-alike and client domains', () => {
    for (const email of [
      'x@evil.continuumai.agency',
      'x@continuumai.agency.evil.com',
      'continuumai.agency',
      'client@acme.com',
    ]) {
      expect(isStaffUser({ email, email_confirmed_at: confirmed })).toBe(false);
    }
    expect(isStaffUser(null)).toBe(false);
  });
});

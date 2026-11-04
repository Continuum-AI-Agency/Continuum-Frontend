import { describe, expect, it } from 'bun:test';
import { isStaffUser } from './staff';

const google = { providers: ['email', 'google'] };

describe('isStaffUser', () => {
  it('admins are staff on any email', () => {
    expect(isStaffUser({ email: 'someone@gmail.com', app_metadata: { is_admin: true } })).toBe(
      true,
    );
  });

  it('a staff-domain email counts only after a Google sign-in', () => {
    expect(isStaffUser({ email: 'Alexia@ContinuumAI.agency', app_metadata: google })).toBe(true);
    expect(isStaffUser({ email: 'ops@trycontinuum.ai', app_metadata: google })).toBe(true);
    // A password signup on the staff domain is auto-confirmed in production — not proof.
    expect(
      isStaffUser({ email: 'ops@continuumai.agency', app_metadata: { providers: ['email'] } }),
    ).toBe(false);
    expect(isStaffUser({ email: 'ops@continuumai.agency' })).toBe(false);
  });

  it('rejects look-alike and client domains', () => {
    for (const email of [
      'x@evil.continuumai.agency',
      'x@continuumai.agency.evil.com',
      'continuumai.agency',
      'client@acme.com',
    ]) {
      expect(isStaffUser({ email, app_metadata: google })).toBe(false);
    }
    expect(isStaffUser(null)).toBe(false);
  });
});

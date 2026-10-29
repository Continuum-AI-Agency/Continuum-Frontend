import { isAdminUser } from '@/lib/brands/brand-switcher-utils';

// Same domains as `billing.is_staff_authored_brand`.
const STAFF_EMAIL_DOMAINS = new Set(['continuumai.agency', 'trycontinuum.ai']);

type StaffUserLike =
  | { app_metadata?: unknown | null; email?: string | null; email_confirmed_at?: string | null }
  | null
  | undefined;

function hasStaffEmail(user: StaffUserLike): boolean {
  const email = user?.email?.toLowerCase() ?? '';
  const at = email.lastIndexOf('@');
  return at > 0 && STAFF_EMAIL_DOMAINS.has(email.slice(at + 1));
}

/** Continuum staff as session claims tell it — enough to SHOW a staff-only affordance. */
export function isStaffIdentity(user: StaffUserLike): boolean {
  return isAdminUser(user) || hasStaffEmail(user);
}

/**
 * Continuum staff for a server boundary: an admin, or a CONFIRMED staff email. Pass the Auth
 * server's user (`auth.getUser()`), never token claims — claims carry no `email_confirmed_at`.
 */
export function isStaffUser(user: StaffUserLike): boolean {
  return isAdminUser(user) || (hasStaffEmail(user) && Boolean(user?.email_confirmed_at));
}

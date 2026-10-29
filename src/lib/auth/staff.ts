import { isAdminUser } from '@/lib/brands/brand-switcher-utils';

// Same domains as `billing.is_staff_authored_brand`.
const STAFF_EMAIL_DOMAINS = new Set(['continuumai.agency', 'trycontinuum.ai']);

type StaffUserLike =
  | { app_metadata?: { providers?: unknown } | null; email?: string | null }
  | null
  | undefined;

function hasStaffEmail(user: StaffUserLike): boolean {
  const email = user?.email?.toLowerCase() ?? '';
  const at = email.lastIndexOf('@');
  return at > 0 && STAFF_EMAIL_DOMAINS.has(email.slice(at + 1));
}

// Production auto-confirms email signups, so a "confirmed" staff address proves nothing: anyone can
// register one with a password. A Google sign-in on the staff Workspace domain proves the mailbox.
function signedInWithGoogle(user: StaffUserLike): boolean {
  const providers = user?.app_metadata?.providers;
  return Array.isArray(providers) && providers.includes('google');
}

/**
 * Continuum staff: an admin, or a staff-domain email that signed in with Google. `app_metadata`
 * is server-written, so this holds on verified claims; billing boundaries still pass the Auth
 * server's user (`auth.getUser()`) so a revoked admin is not trusted until their token expires.
 */
export function isStaffUser(user: StaffUserLike): boolean {
  return isAdminUser(user) || (hasStaffEmail(user) && signedInWithGoogle(user));
}

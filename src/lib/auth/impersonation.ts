// An impersonation link (supabase/functions/impersonate-user → /auth/impersonate) signs an admin in
// AS the customer, in the admin's own browser. That session must never end the customer's sessions
// on their other devices, so the browser carries this marker while it holds one: the link's landing
// sets it, Sign out clears it, and Sign out of all devices refuses while it is set
// (PP-DT-C-signout-ends-every-device, Ramiro's decision 1).

export const IMPERSONATION_COOKIE = 'is_impersonating';

export const IMPERSONATION_COOKIE_VALUE = 'true';

/** The session cookie's own lifetime: @supabase/ssr writes the auth cookie with
 *  DEFAULT_COOKIE_OPTIONS.maxAge whatever cookies.ts says, and only a sign-out ends either. */
const SESSION_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

/** Both landings of the link (the ?code= callback on the server, the #access_token hash in the
 *  browser) write the marker with these, so it lives exactly as long as the session it marks. */
export const IMPERSONATION_COOKIE_OPTIONS = {
  path: '/',
  sameSite: 'lax',
  maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
} as const;

/** The hash landing signs in from the browser, so it writes the marker there too. */
export function markImpersonatedSession(target: { cookie: string } = document): void {
  const { path, maxAge, sameSite } = IMPERSONATION_COOKIE_OPTIONS;
  target.cookie = `${IMPERSONATION_COOKIE}=${IMPERSONATION_COOKIE_VALUE}; Path=${path}; Max-Age=${maxAge}; SameSite=${sameSite}`;
}

/** Returned by the server action and shown in place of the control, so both say the same thing. */
export const SIGN_OUT_EVERYWHERE_REFUSED_WHILE_IMPERSONATING =
  "This session came from an impersonation link, so it can't sign the account out of other devices. Sign out ends only this browser.";

type CookieReader = { get(name: string): { value: string } | undefined };

/** Any value counts: a marker with an unexpected value still fails closed. */
export function isImpersonationMarked(cookieStore: CookieReader): boolean {
  return Boolean(cookieStore.get(IMPERSONATION_COOKIE)?.value);
}

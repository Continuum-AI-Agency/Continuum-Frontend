// An impersonation link (supabase/functions/impersonate-user → /auth/impersonate) signs an admin in
// AS the customer, in the admin's own browser. That session must never end the customer's sessions
// on their other devices, so the browser carries this marker while it holds one: the link's landing
// sets it, Sign out clears it, and Sign out of all devices refuses while it is set
// (PP-DT-C-signout-ends-every-device, Ramiro's decision 1).

export const IMPERSONATION_COOKIE = 'is_impersonating';

/** Returned by the server action and shown in place of the control, so both say the same thing. */
export const SIGN_OUT_EVERYWHERE_REFUSED_WHILE_IMPERSONATING =
  "This session came from an impersonation link, so it can't sign the account out of other devices. Sign out ends only this browser.";

type CookieReader = { get(name: string): { value: string } | undefined };

/** Any value counts: a marker with an unexpected value still fails closed. */
export function isImpersonationMarked(cookieStore: CookieReader): boolean {
  return Boolean(cookieStore.get(IMPERSONATION_COOKIE)?.value);
}

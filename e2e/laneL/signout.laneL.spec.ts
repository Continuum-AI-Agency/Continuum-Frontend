import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type BrowserContext, expect, type Locator, test } from '@playwright/test';
import { combineChunks, stringFromBase64URL } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { type GuardLog, installWriteGuard } from '../laneE/support';
import {
  mintSessionBundleForEmail,
  type PlaywrightStorageState,
  pinSessionBrand,
  restoreBrandPreference,
  sessionClaimsOf,
} from '../support/auth';
import { loadProdSupabaseEnv, PROD_SUPABASE_URL } from '../support/prodEnv';

// laneL:signout — Ramiro's decision 1 (PP-DT-C-signout-ends-every-device) in the real app.
// Two sessions of the bench owner are minted: A is this browser, B stands for another device.
//   1. Settings → Profile shows "Sign out of all devices" behind a confirmation, which is
//      CANCELLED: confirming it on a shared real identity would end every other session. The
//      control is also the interlock — a build that has it is one whose Sign out is local — so
//      nothing below runs against a build that would sign out globally.
//   2. With the impersonation marker set by hand (no real impersonation link), the page shows
//      the sentence instead of the control.
//   3. Sign out in the sidebar, still marked: the browser leaves for /login with no auth cookie
//      and no marker; A's refresh token is refused, B's still trades.
//   4. B is revoked here with its own token (local), and its refresh is refused.
// Sign out of all devices itself is proven by unit tests only (src/lib/auth/actions.sign-out).

const VIVO_OWNER = 'mercadotecniavivo@gmail.com';
const EASYFIT_2026 = '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64';
const OUT = process.env.LANE_L_OUT ?? resolve(__dirname, '../../test-results/laneL');

type Minted = {
  label: 'A' | 'B';
  userId: string;
  sessionId: string;
  state: PlaywrightStorageState;
  accessToken: string;
  refreshToken: string;
  revoked: boolean;
};

const minted: Minted[] = [];
const results: Record<string, unknown> = {};
let preference: { userId: string; before: string | null } | null = null;

const short = (id: string) => id.slice(0, 8);

function out(name: string): string {
  mkdirSync(OUT, { recursive: true });
  return resolve(OUT, name);
}

function serviceClient() {
  const { serviceRoleKey } = loadProdSupabaseEnv();
  return createClient(PROD_SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function anonClient() {
  const { publishableKey } = loadProdSupabaseEnv();
  return createClient(PROD_SUPABASE_URL, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** A refused refresh is the proof a session is gone; a 5xx or a network error proves nothing. */
async function probeRefresh(refreshToken: string) {
  const { data, error } = await anonClient().auth.refreshSession({ refresh_token: refreshToken });
  const status = (error as { status?: number } | null)?.status ?? 0;
  return {
    refused: !data.session && Boolean(error) && status >= 400 && status < 500,
    error: error ? `${status} ${error.message}` : null,
    session: data.session,
  };
}

async function mint(label: Minted['label']): Promise<Minted> {
  const bundle = await mintSessionBundleForEmail(VIVO_OWNER);
  const { sessionId } = sessionClaimsOf(bundle.accessToken);
  const pair = await sessionPair(bundle.state);
  const session: Minted = {
    label,
    userId: bundle.userId,
    sessionId,
    state: bundle.state,
    accessToken: pair.access_token,
    refreshToken: pair.refresh_token,
    revoked: false,
  };
  minted.push(session);
  return session;
}

async function sessionPair(
  state: PlaywrightStorageState,
): Promise<{ access_token: string; refresh_token: string }> {
  const cookie = await combineChunks(
    'sb-auth',
    (name) => state.cookies.find((c) => c.name === name)?.value,
  );
  if (!cookie) throw new Error('no sb-auth cookie in this state');
  const raw = cookie.startsWith('base64-') ? stringFromBase64URL(cookie.slice(7)) : cookie;
  return JSON.parse(raw) as { access_token: string; refresh_token: string };
}

/** A dev build paints the server HTML long before React hydrates it, and a click before that is
 *  lost. React tags a DOM node with its props when it hydrates it. */
async function whenHydrated(locator: Locator): Promise<void> {
  await expect
    .poll(
      () =>
        locator.evaluate((element) =>
          Object.keys(element).some((key) => key.startsWith('__reactProps')),
        ),
      { timeout: 120_000 },
    )
    .toBe(true);
}

async function browserState(context: BrowserContext): Promise<PlaywrightStorageState> {
  return (await context.storageState()) as PlaywrightStorageState;
}

async function readPreference(userId: string): Promise<string | null> {
  const { data } = await serviceClient()
    .schema('brand_profiles')
    .from('user_brand_preferences')
    .select('active_brand_id')
    .eq('user_id', userId)
    .maybeSingle();
  return (data as { active_brand_id?: string } | null)?.active_brand_id ?? null;
}

async function pinsLeft(userId: string, sessionId: string): Promise<number> {
  const { count } = await serviceClient()
    .schema('brand_profiles')
    .from('user_session_brands')
    .select('session_id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('session_id', sessionId);
  return count ?? -1;
}

test.afterAll(async () => {
  // Every minted session ends revoked through a token of its own, proved by a refused refresh.
  const sessions: string[] = [];
  for (const session of minted) {
    if (!session.revoked) {
      const { error } = await serviceClient().auth.admin.signOut(session.accessToken, 'local');
      const probe = await probeRefresh(session.refreshToken);
      session.revoked = probe.refused;
      sessions.push(
        `${session.label} ${short(session.sessionId)}: cleanup signOut(local) ${error ? error.message : 'ok'}, refresh ${probe.refused ? 'refused' : 'STILL ACCEPTED'}`,
      );
    }
    sessions.push(
      `${session.label} ${short(session.sessionId)}: revoked=${session.revoked}, brand pins left=${await pinsLeft(session.userId, session.sessionId)}`,
    );
  }
  results.sessions = sessions;
  if (preference) {
    const now = await readPreference(preference.userId);
    results.preference =
      now === preference.before
        ? `unchanged (${now})`
        : `moved ${preference.before} -> ${now}; restored to ${await restoreBrandPreference(preference.userId, preference.before)}`;
  }
  writeFileSync(out('signout.laneL.json'), JSON.stringify(results, null, 2));
});

test('laneL:signout — Sign out ends only this browser; a marked session gets no all-devices control', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(600_000);
  const a = await mint('A');
  const b = await mint('B');
  const { iat, exp } = JSON.parse(
    Buffer.from(a.accessToken.split('.')[1] ?? '', 'base64url').toString('utf8'),
  ) as { iat: number; exp: number };
  results.minted = { A: short(a.sessionId), B: short(b.sessionId), jwtLifetimeSeconds: exp - iat };
  preference = { userId: a.userId, before: await readPreference(a.userId) };
  await pinSessionBrand(a.accessToken, EASYFIT_2026);

  const context = await browser.newContext({
    storageState: a.state,
    viewport: { width: 1440, height: 900 },
  });
  const guard: GuardLog = { blocked: [], allowedNonGet: [] };
  await installWriteGuard(context, guard);
  const page = await context.newPage();

  try {
    // 1. The control, behind a confirmation that is cancelled. Also the interlock (see top).
    await page.goto('/settings?section=profile', { waitUntil: 'domcontentloaded' });
    const everywhere = page.getByRole('button', { name: 'Sign out of all devices' });
    await expect(everywhere).toBeVisible({ timeout: 120_000 });
    await whenHydrated(everywhere);
    await everywhere.click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toContainText('Sign out of all devices?');
    await page.screenshot({ path: out('01-confirm-all-devices.png') });
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirm).toHaveCount(0);
    results.control = 'shown; the confirmation opened and was cancelled';

    // 2. Marked as impersonated by hand: the sentence, and no control.
    await context.addCookies([
      { name: 'is_impersonating', value: 'true', url: baseURL ?? 'http://localhost:3116' },
    ]);
    await page.reload({ waitUntil: 'domcontentloaded' });
    // The deployed Settings keeps a hidden copy of the section mounted beside the visible one;
    // getByRole skips hidden nodes, getByText does not, so the sentence is asked for visibly.
    const sentence = page.getByText(/came from an impersonation link/).filter({ visible: true });
    await expect(sentence).toBeVisible({ timeout: 120_000 });
    await expect(page.getByRole('button', { name: 'Sign out of all devices' })).toHaveCount(0);
    await page.screenshot({ path: out('02-impersonating-withheld.png') });
    results.impersonating = { sentence: await sentence.textContent(), control: 'absent' };

    // 3. Sign out from the sidebar, still marked. A's current pair is read from the browser
    //    first: the page may have refreshed it since it was minted.
    const current = await sessionPair(await browserState(context));
    expect(sessionClaimsOf(current.access_token).sessionId).toBe(a.sessionId);
    a.accessToken = current.access_token;
    a.refreshToken = current.refresh_token;
    // The collapsed rail hides the label with CSS, so the button has no accessible name there;
    // it is found by the label it carries in the DOM.
    const signOut = page.locator('button', { hasText: /^Sign out$/ });
    await expect(signOut).toBeVisible({ timeout: 120_000 });
    await whenHydrated(signOut);
    await signOut.click();
    await page.waitForURL(/\/login/, { timeout: 120_000 });
    await page.screenshot({ path: out('03-after-sign-out.png') });
    const left = (await context.cookies())
      .map((cookie) => cookie.name)
      .filter((name) => name.startsWith('sb-auth') || name === 'is_impersonating');
    results.signOut = { landedOn: new URL(page.url()).pathname, authOrMarkerCookiesLeft: left };
    expect(left).toEqual([]);

    // 4. This browser's session is gone; the other device's is not.
    const probeA = await probeRefresh(a.refreshToken);
    a.revoked = probeA.refused;
    const probeB = await probeRefresh(b.refreshToken);
    results.afterSignOut = {
      A: probeA.refused ? `refresh refused (${probeA.error})` : 'refresh ACCEPTED',
      B: probeB.session ? 'refresh accepted' : `refresh REFUSED (${probeB.error})`,
    };
    expect(probeA.refused, 'A, signed out in the browser, is gone').toBe(true);
    expect(probeB.session, 'B, another device, still signs in').not.toBeNull();
    if (probeB.session) {
      b.accessToken = probeB.session.access_token;
      b.refreshToken = probeB.session.refresh_token;
      expect(sessionClaimsOf(b.accessToken).sessionId).toBe(b.sessionId);
    }

    // 5. B revoked here, with its own token, as a device's own Sign out would.
    const { error } = await serviceClient().auth.admin.signOut(b.accessToken, 'local');
    const probeB2 = await probeRefresh(b.refreshToken);
    b.revoked = probeB2.refused;
    results.revokeB = `signOut(local) ${error ? error.message : 'ok'}; refresh ${probeB2.refused ? `refused (${probeB2.error})` : 'STILL ACCEPTED'}`;
    expect(probeB2.refused).toBe(true);
  } finally {
    results.guard = guard;
    await context.close();
  }
});

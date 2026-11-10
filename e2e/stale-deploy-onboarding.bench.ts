import { randomUUID } from 'node:crypto';
import { type BrowserContext, chromium, type Page, type Route } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createDefaultOnboardingState } from '../src/lib/onboarding/state';
import {
  mintSessionBundleForEmail,
  restoreBrandPreference,
  revokeBenchSession,
} from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';
import { benchBrowserChannel, loadProdSupabaseEnv } from './support/prodEnv';

// stale-deploy:e2e:bench — does a tab left open across a deploy get off onboarding step 3?
//
// Prod, 2026-11-10: a tab loaded before the FE promote posted the old build's Server Action ids
// to the new build, which answered "Failed to find Server Action" (404) to every Continue on
// step 3. This bench recreates that with two REAL Vercel builds: it loads onboarding from
// <client origin> and forwards the step save to <other origin>, a different build, with the
// deployment pin removed, so the 404 is that build's own answer.
//
//   fix run     (client = the build under test): the page reloads, shows no "Save failed",
//               resumes at step 3 with nothing saved, and the next Continue saves step 4.
//   control run (client = a build without the fix): Continue loops back to step 3 with
//               "Save failed" and no reload, twice. If it does not, the bench is not
//               reproducing the bug and the run fails.
//
// The one hop it forces: in prod, Vercel routed the stale tab to the new build because Skew
// Protection ignored a pinned deployment past its max age. Here the forwarding does it.
// Not covered: the global error page's Reload (src/app/global-error.test.tsx covers it).
//
// Fixture: one throwaway step-3 brand for the bench login, deleted at the end. Loading
// onboarding rewrites that login's onboarding rows, its auth `onboarding` metadata and its
// brand preference; all three are snapshotted first and restored, and the restore is checked.
//
// Run: bun run stale-deploy:e2e:bench -- <fixed origin> <control origin>
//   e.g. the PR preview and the beta (or production) deployment URL.

const [fixedOrigin, controlOrigin] = process.argv.slice(2).map((origin) => new URL(origin).origin);
if (!fixedOrigin || !controlOrigin || fixedOrigin === controlOrigin) {
  throw new Error('usage: stale-deploy-onboarding.bench.ts <fixed origin> <control origin>');
}

const BENCH_EMAIL = 'bench@trycontinuum.ai';
const STEP_3 = 'Tag accounts to this brand';
const STEP_4 = 'Invite your team';
const SAVE_FAILED = 'Save failed';
const CONTINUE = 'Continue →';

const { url, serviceRoleKey } = loadProdSupabaseEnv();
const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
const brands = () => admin.schema('brand_profiles');
const recorder = createBenchRecorder('stale-deploy:e2e:bench', [
  `fixed=${fixedOrigin}`,
  `control=${controlOrigin}`,
  'forced hop: Vercel routing a stale tab to another build (prod: Skew Protection max age)',
]);

type OnboardingRow = { brand_id: string; state: unknown; is_active: boolean; updated_at: string };

async function snapshot(userId: string) {
  const rows = await brands()
    .from('user_onboarding_states')
    .select('brand_id, state, is_active, updated_at')
    .eq('user_id', userId);
  if (rows.error) throw new Error(rows.error.message);
  const user = await admin.auth.admin.getUserById(userId);
  if (user.error) throw new Error(user.error.message);
  const preference = await brands()
    .from('user_brand_preferences')
    .select('active_brand_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (preference.error) throw new Error(preference.error.message);
  const permissions = await brands()
    .from('permissions')
    .select('brand_profile_id', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (permissions.error) throw new Error(permissions.error.message);
  return {
    permissions: permissions.count,
    rows: (rows.data ?? []) as OnboardingRow[],
    metadata: user.data.user.user_metadata ?? {},
    preference: (preference.data?.active_brand_id as string | undefined) ?? null,
  };
}

/** Registers the id in `seeded` first, so cleanup also removes a seed that failed halfway. */
async function seedStep3Brand(userId: string, seeded: string[]): Promise<string> {
  const id = randomUUID();
  seeded.push(id);
  const state = createDefaultOnboardingState();
  state.brand.name = `stale-deploy bench ${id.slice(0, 8)}`;
  state.step = 3;
  const brand = await brands()
    .from('brand_profiles')
    .insert({ id, brand_name: state.brand.name, created_by: userId });
  if (brand.error) throw new Error(brand.error.message);
  // A trigger on brand_profiles usually grants the owner already.
  const permission = await brands()
    .from('permissions')
    .upsert(
      { brand_profile_id: id, user_id: userId, role: 'owner' },
      { onConflict: 'brand_profile_id,user_id', ignoreDuplicates: true },
    );
  if (permission.error) throw new Error(permission.error.message);
  const row = await brands().from('user_onboarding_states').insert({
    user_id: userId,
    brand_id: id,
    state,
    is_active: false,
    updated_at: new Date().toISOString(),
  });
  if (row.error) throw new Error(row.error.message);
  return id;
}

async function savedStep(userId: string, brandId: string): Promise<number> {
  const { data, error } = await brands()
    .from('user_onboarding_states')
    .select('state')
    .eq('user_id', userId)
    .eq('brand_id', brandId)
    .single();
  if (error) throw new Error(error.message);
  return (data.state as { step: number }).step;
}

/** Sends a Server Action POST to the other build, as Vercel did for the stale tab. */
function forwardTo(origin: string, forwarded: number[]) {
  return async (route: Route) => {
    const request = route.request();
    const headers = Object.fromEntries(
      Object.entries(await request.allHeaders()).filter(
        ([name]) =>
          !name.startsWith(':') && !['host', 'content-length', 'x-deployment-id'].includes(name),
      ),
    );
    // The pin travels as a header and as Vercel's __vdpl cookie; either would route it home.
    if (headers.cookie) {
      headers.cookie = headers.cookie
        .split('; ')
        .filter((cookie) => !cookie.startsWith('__vdpl='))
        .join('; ');
    }
    headers.origin = origin;
    const target = new URL(request.url());
    target.searchParams.delete('dpl');
    const response = await route.fetch({
      url: `${origin}${target.pathname}${target.search}`,
      headers,
      postData: request.postDataBuffer() ?? undefined,
      maxRedirects: 0,
    });
    if (response.headers()['x-nextjs-action-not-found'] === '1') forwarded.push(response.status());
    else forwarded.push(-response.status());
    await route.fulfill({ response });
  };
}

async function openStep3(context: BrowserContext, origin: string, brandId: string): Promise<Page> {
  const page = await context.newPage();
  // sessionStorage survives a reload, so a toast that flashes just before one is still seen.
  await page.addInitScript((text) => {
    new MutationObserver(() => {
      if (document.body?.textContent?.includes(text)) sessionStorage.setItem('bench:toast', '1');
    }).observe(document, { childList: true, subtree: true, characterData: true });
  }, SAVE_FAILED);
  await page.goto(`${origin}/onboarding?brand=${brandId}`, { timeout: 90_000 });
  await page.getByRole('heading', { name: STEP_3 }).waitFor({ timeout: 90_000 });
  await page.evaluate(() => {
    (window as unknown as { benchMarker?: string }).benchMarker = 'loaded';
  });
  return page;
}

const sameDocument = (page: Page) =>
  page.evaluate(() => (window as unknown as { benchMarker?: string }).benchMarker === 'loaded');
const toastSeen = (page: Page) =>
  page.evaluate(() => sessionStorage.getItem('bench:toast') === '1');

function contextFor(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  origin: string,
  state: Awaited<ReturnType<typeof mintSessionBundleForEmail>>['state'],
) {
  const domain = new URL(origin).hostname;
  return browser.newContext({
    storageState: { ...state, cookies: state.cookies.map((cookie) => ({ ...cookie, domain })) },
  });
}

async function main() {
  const session = await mintSessionBundleForEmail(BENCH_EMAIL);
  const { userId } = session;
  const before = await snapshot(userId);
  const seeded: string[] = [];
  const browser = await chromium.launch({ headless: true, ...benchBrowserChannel() });
  try {
    await recorder.step('control: a build without the fix loops on step 3', async () => {
      const brandId = await seedStep3Brand(userId, seeded);
      const context = await contextFor(browser, controlOrigin, session.state);
      await context.route('**/ingest/**', (route) => route.abort());
      const page = await openStep3(context, controlOrigin, brandId);
      const forwarded: number[] = [];
      await page.route(
        (target) => target.pathname === '/onboarding',
        (route) =>
          route.request().method() === 'POST' && route.request().headers()['next-action']
            ? forwardTo(fixedOrigin, forwarded)(route)
            : route.fallback(),
      );
      // Each attempt is its own stale save: a fresh 404 from the other build, back on step 3,
      // the same document. The toast can outlive an attempt, so it is only required on screen.
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const answered = forwarded.length;
        await page.getByRole('button', { name: CONTINUE }).click();
        await page.mouse.move(0, 0);
        const deadline = Date.now() + 60_000;
        while (forwarded.length === answered) {
          if (Date.now() > deadline) throw new Error(`attempt ${attempt}: no save was sent`);
          await page.waitForTimeout(250);
        }
        await page.getByText(SAVE_FAILED).first().waitFor({ timeout: 30_000 });
        await page.getByRole('heading', { name: STEP_3 }).waitFor({ timeout: 30_000 });
        if (!(await sameDocument(page))) throw new Error(`attempt ${attempt}: the page reloaded`);
      }
      // Anything the page retries on its own lands here too.
      await page.waitForTimeout(5_000);
      if (!forwarded.length || forwarded.some((status) => status !== 404)) {
        throw new Error(`the other build did not answer action-not-found: ${forwarded.join(',')}`);
      }
      const step = await savedStep(userId, brandId);
      if (step !== 3) throw new Error(`a stale save persisted step ${step}`);
      recorder.record('control: other build answered', 'PASS', `404 x${forwarded.length}`);
      await context.close();
    });

    await recorder.step('fix: the build under test reloads, then saves', async () => {
      const brandId = await seedStep3Brand(userId, seeded);
      const context = await contextFor(browser, fixedOrigin, session.state);
      await context.route('**/ingest/**', (route) => route.abort());
      const page = await openStep3(context, fixedOrigin, brandId);
      const forwarded: number[] = [];
      let stale = true;
      await page.route(
        (target) => target.pathname === '/onboarding',
        (route) =>
          stale && route.request().method() === 'POST' && route.request().headers()['next-action']
            ? forwardTo(controlOrigin, forwarded)(route)
            : route.fallback(),
      );
      const reloaded = page.waitForEvent('load', { timeout: 60_000 });
      await page.getByRole('button', { name: CONTINUE }).click();
      await reloaded;
      stale = false;
      await page.getByRole('heading', { name: STEP_3 }).waitFor({ timeout: 90_000 });
      if (await sameDocument(page)) throw new Error('the page did not reload');
      if (await toastSeen(page)) throw new Error('"Save failed" was shown before the reload');
      if (!forwarded.length || forwarded.some((status) => status !== 404)) {
        throw new Error(`the other build did not answer action-not-found: ${forwarded.join(',')}`);
      }
      const staleStep = await savedStep(userId, brandId);
      if (staleStep !== 3) throw new Error(`a stale save persisted step ${staleStep}`);

      await page.getByRole('button', { name: CONTINUE }).click();
      await page.getByRole('heading', { name: STEP_4, level: 1 }).waitFor({ timeout: 60_000 });
      const deadline = Date.now() + 30_000;
      while ((await savedStep(userId, brandId)) !== 4) {
        if (Date.now() > deadline) throw new Error('step 4 was never saved after the reload');
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      recorder.record('fix: other build answered', 'PASS', `404 x${forwarded.length}`);
      await context.close();
    });
  } finally {
    await browser.close();
    await recorder.step('cleanup: fixture deleted, bench login restored', async () => {
      for (const brandId of seeded) {
        await brands().from('user_onboarding_states').delete().eq('brand_id', brandId);
        await brands().from('permissions').delete().eq('brand_profile_id', brandId);
        await brands().from('brand_profiles').delete().eq('id', brandId);
      }
      if (before.rows.length) {
        const restored = await brands()
          .from('user_onboarding_states')
          .upsert(
            before.rows.map((row) => ({ ...row, user_id: userId })),
            { onConflict: 'user_id,brand_id' },
          );
        if (restored.error) throw new Error(restored.error.message);
      }
      const metadata = await admin.auth.admin.updateUserById(userId, {
        user_metadata: before.metadata,
      });
      if (metadata.error) throw new Error(metadata.error.message);
      await restoreBrandPreference(userId, before.preference);
      const revoked = await revokeBenchSession(session.state, session.accessToken);

      const after = await snapshot(userId);
      const leftover = await brands().from('brand_profiles').select('id').in('id', seeded);
      const key = (rows: OnboardingRow[]) =>
        JSON.stringify([...rows].sort((a, b) => a.brand_id.localeCompare(b.brand_id)));
      const problems = [
        (leftover.data ?? []).length ? 'seeded brand left behind' : '',
        key(after.rows) !== key(before.rows) ? 'onboarding rows differ' : '',
        JSON.stringify(after.metadata.onboarding) !== JSON.stringify(before.metadata.onboarding)
          ? 'onboarding metadata differs'
          : '',
        after.preference !== before.preference ? 'brand preference differs' : '',
        after.permissions !== before.permissions
          ? `brand permissions ${before.permissions} -> ${after.permissions}`
          : '',
        revoked.revoked ? '' : `session not revoked: ${revoked.detail}`,
      ].filter(Boolean);
      if (problems.length) throw new Error(problems.join('; '));
    });
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : JSON.stringify(error));
  })
  .finally(() => {
    recorder.print();
    process.exit(recorder.failed() ? 1 : 0);
  });

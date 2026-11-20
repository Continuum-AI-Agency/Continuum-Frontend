/**
 * Onboarding must not rename a brand its creator opens for the first time.
 *
 * A brand made outside onboarding (staff `admin_manage brand_create`, the admin panel, SQL)
 * has a row but no onboarding state for its creator. Loading it used to mint a blank state
 * ("<handle>'s Brand", email reports on) and write that over the row: the Trading Hearts
 * sandbox became "duane's Brand" on 2026-11-19.
 *
 * Real path: the production `ensureOnboardingState` against prod Supabase, signed in as the
 * non-staff bench user through a real magic-link session, RLS on. Only the Next cookie wrapper
 * (`createSupabaseServerClient`) is replaced, by a client holding that session.
 *
 * Asserts the brand row keeps its name and email opt-in, and the new state adopted them.
 * Not exercised: the first-login path (a user with NO onboarding states adopting a reusable
 * brand); it needs a user with zero states, and the bench user's states are not wiped for it.
 * That branch runs the same adopt step and is covered by brandRecordGuard.test.ts.
 *
 * Writes, then removes: one throwaway brand (its permission and onboarding state go with it).
 * The bench user's onboarding rows, brand preference and user_metadata.onboarding are snapshot
 * first and restored after.
 *
 *   bun run onboarding:adopt:bench
 * Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY (or publishable key),
 *      SUPABASE_SERVICE_ROLE_KEY; ONBOARDING_BENCH_EMAIL (default bench@trycontinuum.ai).
 */
import { mock } from 'bun:test';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ONBOARDING_BENCH_EMAIL ?? 'bench@trycontinuum.ai';
if (!url || !anonKey || !serviceKey) {
  throw new Error('Missing env: NEXT_PUBLIC_SUPABASE_URL, anon key, SUPABASE_SERVICE_ROLE_KEY');
}

const noSession = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(url, serviceKey, noSession);
const results: { name: string; ok: boolean; detail?: string }[] = [];
const check = (name: string, ok: boolean, detail?: unknown) =>
  results.push({ name, ok, detail: detail === undefined ? undefined : JSON.stringify(detail) });

const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
const tokenHash = link.data?.properties?.hashed_token;
if (link.error || !tokenHash) throw new Error(`generateLink failed: ${link.error?.message}`);
const userClient = createClient(url, anonKey, noSession);
const verified = await userClient.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
const userId = verified.data.user?.id;
if (verified.error || !userId) throw new Error(`verifyOtp failed: ${verified.error?.message}`);

// Next's bundler resolves `server-only` to an empty module on the server; so does this.
mock.module('server-only', () => ({}));
mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => userClient,
}));
const { ensureOnboardingState } = await import('@/lib/onboarding/storage');

const states = admin.schema('brand_profiles').from('user_onboarding_states');
const prefs = admin.schema('brand_profiles').from('user_brand_preferences');
const before = {
  states: (await states.select('*').eq('user_id', userId)).data ?? [],
  pref: (await prefs.select('*').eq('user_id', userId).maybeSingle()).data,
  metadata: (await admin.auth.admin.getUserById(userId)).data.user?.user_metadata ?? {},
};

const brandName = `onboarding-adopt bench ${new Date().toISOString()}`;
const created = await admin
  .schema('brand_profiles')
  .from('brand_profiles')
  .insert({ brand_name: brandName, created_by: userId, email_report_opt_in: false })
  .select('id')
  .single();
if (created.error) throw new Error(`brand insert failed: ${created.error.message}`);
const brandId = created.data.id as string;

try {
  const { state } = await ensureOnboardingState(brandId);
  const row = (
    await admin
      .schema('brand_profiles')
      .from('brand_profiles')
      .select('brand_name, email_report_opt_in')
      .eq('id', brandId)
      .single()
  ).data;
  check('the brand row keeps its name', row?.brand_name === brandName, row);
  check('the brand row keeps email reports off', row?.email_report_opt_in === false, row);
  check(
    'the new onboarding state adopted the row',
    state.brand.name === brandName && state.emailReportOptIn === false,
    {
      name: state.brand.name,
      emailReportOptIn: state.emailReportOptIn,
    },
  );
  const saved = (
    await states.select('state').eq('user_id', userId).eq('brand_id', brandId).maybeSingle()
  ).data?.state as { brand?: { name?: string } } | undefined;
  check(
    'the persisted state carries the real name',
    saved?.brand?.name === brandName,
    saved?.brand?.name,
  );

  await ensureOnboardingState(brandId);
  const again = (
    await admin
      .schema('brand_profiles')
      .from('brand_profiles')
      .select('brand_name')
      .eq('id', brandId)
      .single()
  ).data;
  check('a second load leaves the row alone', again?.brand_name === brandName, again);
} finally {
  await states.delete().eq('brand_id', brandId);
  await admin.schema('brand_profiles').from('permissions').delete().eq('brand_profile_id', brandId);
  await admin.schema('brand_profiles').from('brand_profiles').delete().eq('id', brandId);
  for (const row of before.states) await states.upsert(row, { onConflict: 'user_id,brand_id' });
  if (before.pref) await prefs.upsert(before.pref, { onConflict: 'user_id' });
  await admin.auth.admin.updateUserById(userId, { user_metadata: before.metadata });
  const gone = (
    await admin.schema('brand_profiles').from('brand_profiles').select('id').eq('id', brandId)
  ).data;
  check('the throwaway brand is cleaned up', (gone ?? []).length === 0);
  const after = (await states.select('brand_id, is_active').eq('user_id', userId)).data ?? [];
  const key = (rows: { brand_id: string; is_active: boolean }[]) =>
    JSON.stringify(rows.map((r) => [r.brand_id, r.is_active]).sort());
  check(
    'the bench user’s onboarding rows are restored',
    key(after) === key(before.states),
    after.length,
  );
}

for (const r of results)
  console.log(`${r.ok ? '✓ PASS' : '✗ FAIL'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
const failed = results.filter((r) => !r.ok).length;
console.log(
  `${failed ? 'FAIL' : 'PASS'} — onboarding-adopt-brand: ${results.length - failed} pass, ${failed} fail`,
);
process.exit(failed ? 1 : 0);

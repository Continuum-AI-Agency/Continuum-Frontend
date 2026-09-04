// Bench: how a Google Ads / YouTube asset actually RENDERS, against real rows.
//
// The bug this locks down: every `ads_customer` row in production persists
// `name: null` (Google refuses `descriptive_name` on an unapproved developer
// token), and the three readers of that null disagreed — one rendered the
// provider string, so several ad accounts became identical "google" rows on the
// personal Connections page; one rendered "Account"; one rendered a bare digit
// run. This drives the REAL label path over REAL rows read from the hosted
// Supabase and asserts the rendered string, not an intermediate.
//
//   bun run Continuum-Frontend/src/lib/integrations/google-assets-render.bench.ts
//
// Supabase credentials are read straight out of Continuum-Backend/.env rather
// than the ambient environment: Bun auto-loads .env.local, which points at the
// local stack and would green this bench against a DB holding none of these rows.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { assetFallbackLabel, formatGoogleCustomerId, resolveAssetLabel } from './assetLabel';

type Grade = 'PASS' | 'WARN' | 'SKIP' | 'FAIL';
const GLYPH: Record<Grade, string> = { PASS: '✓', WARN: '!', SKIP: '–', FAIL: '✗' };
const results: { step: string; grade: Grade; detail?: string }[] = [];
const notes: string[] = [];
const startedAt = new Date().toISOString();
const startedMs = Date.now();

function record(step: string, grade: Grade, detail?: string) {
  results.push({ step, grade, detail });
  console.log(`${GLYPH[grade]} ${grade.padEnd(4)} ${step}${detail ? ` — ${detail}` : ''}`);
}
function check(step: string, ok: boolean, detail?: string) {
  record(step, ok ? 'PASS' : 'FAIL', detail);
}
function note(message: string) {
  notes.push(message);
  console.log(`· ${message}`);
}

function backendEnv(key: string): string | undefined {
  const path = resolve(import.meta.dir, '../../../../Continuum-Backend/.env');
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && match[1] === key) return match[2].trim().replace(/^["']|["']$/g, '');
  }
  return undefined;
}

function finish(): never {
  const counts = { pass: 0, warn: 0, skip: 0, fail: 0 };
  for (const r of results) {
    if (r.grade === 'PASS') counts.pass += 1;
    else if (r.grade === 'WARN') counts.warn += 1;
    else if (r.grade === 'SKIP') counts.skip += 1;
    else counts.fail += 1;
  }
  const exitCode = counts.fail > 0 ? 1 : 0;
  console.log(
    `\n${exitCode === 0 ? 'PASS' : 'FAIL'} — ${counts.pass} pass, ${counts.warn} warn, ${counts.skip} skip, ${counts.fail} fail`,
  );
  console.log(
    JSON.stringify({
      bench: 'integrations:google-assets-render:e2e:bench',
      startedAt,
      durationMs: Date.now() - startedMs,
      results,
      notes,
      counts,
      exitCode,
    }),
  );
  process.exit(exitCode);
}

const url = backendEnv('SUPABASE_URL');
const serviceKey = backendEnv('SUPABASE_SERVICE_ROLE_KEY');
// Needed to mint a real user session: the personal-summary RPC is EXECUTE-granted
// to `authenticated` only, so service role cannot grade the path the page takes.
const anonKey = backendEnv('SUPABASE_ANON_KEY');
if (!url || !serviceKey) {
  record('supabase credentials', 'FAIL', 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY absent');
  finish();
}
if (/127\.0\.0\.1|localhost|\[::1\]/.test(url)) {
  record('supabase target', 'FAIL', `refusing to bench against the local stack (${url})`);
  finish();
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
const db = supabase.schema('brand_profiles');

// 1. Real Google Ads customers, exactly as the app reads them.
const { data: adsRows, error: adsError } = await db
  .from('integration_accounts_assets')
  .select('id, integration_id, type, name, external_account_id')
  .eq('type', 'ads_customer');

if (adsError) {
  record('read ads_customer assets', 'FAIL', adsError.message);
  finish();
}

const ads = adsRows ?? [];
record('read ads_customer assets', ads.length > 0 ? 'PASS' : 'SKIP', `${ads.length} real rows`);

if (ads.length > 0) {
  const unnamed = ads.filter((row) => !row.name?.trim());
  note(
    `${unnamed.length}/${ads.length} real Google Ads customers carry no name — the condition this bench exists for.`,
  );

  const labels = ads.map((row) =>
    resolveAssetLabel({ name: row.name, type: row.type, external_id: row.external_account_id }),
  );

  // The three regressions, asserted on the rendered string.
  check(
    'no ads row renders as a provider string',
    labels.every((label) => label !== 'google' && label !== 'meta'),
    'personal Connections used to print "google" once per ad account',
  );
  check(
    'no ads row renders as the generic placeholder',
    labels.every((label) => label !== 'Account' && label !== 'Unnamed account'),
  );
  check(
    'no ads row renders as an unformatted customer id',
    labels.every((label) => !/^\d{10}$/.test(label)),
    'the assignment dialog used to print 9891045148',
  );
  check(
    'every unnamed ads row renders its formatted customer id',
    unnamed.every((row) => {
      const label = resolveAssetLabel({
        name: row.name,
        type: row.type,
        external_id: row.external_account_id,
      });
      return label === formatGoogleCustomerId(row.external_account_id ?? '');
    }),
    'e.g. 989-104-5148',
  );
  check(
    'every label is non-empty and distinguishing',
    new Set(labels).size === new Set(ads.map((r) => r.external_account_id)).size &&
      labels.every((l) => l.trim().length > 0),
    `${new Set(labels).size} distinct labels for ${new Set(ads.map((r) => r.external_account_id)).size} distinct customers`,
  );
}

// 2. YouTube channels — named upstream, must survive untouched.
const { data: ytRows } = await db
  .from('integration_accounts_assets')
  .select('type, name, external_account_id')
  .eq('type', 'youtube_channel');

const yt = ytRows ?? [];
record('read youtube_channel assets', yt.length > 0 ? 'PASS' : 'SKIP', `${yt.length} real rows`);
if (yt.length > 0) {
  check(
    'named YouTube channels keep their real title',
    yt
      .filter((row) => row.name?.trim())
      .every(
        (row) =>
          resolveAssetLabel({
            name: row.name,
            type: row.type,
            external_id: row.external_account_id,
          }) === row.name?.trim(),
      ),
  );
}

// 3. The personal-surface RPC, called AS A REAL USER.
//
// This is the hop that hid the platform_key bug for months: EXECUTE on
// get_user_integration_summary is granted to `authenticated` only, so the
// service-role client this bench used to run under could not call it and
// recorded a SKIP. The RPC's `case` had no `ads_customer` arm, every Google Ads
// row came back with platform_key NULL, and both readers dropped it at
// `if (!platformKey) continue`. Minting a real session is the only way to grade
// what the page actually receives.
const ownerId = ads[0]?.integration_id
  ? (
      await db.from('user_integrations').select('user_id').eq('id', ads[0].integration_id).single()
    ).data?.user_id
  : undefined;

// The shared map is the thing both RPCs delegate to, so grade it over EVERY type
// present in production — not just the one that regressed. A new asset type that
// nobody adds an arm for fails here instead of silently vanishing from the page.
const { data: allTypeRows } = await db.from('integration_accounts_assets').select('type');
const distinctTypes = [
  ...new Set((allTypeRows ?? []).map((row) => row.type).filter(Boolean)),
] as string[];
const mapped = await Promise.all(
  distinctTypes.map(async (assetType) => ({
    assetType,
    key: (await db.rpc('integration_platform_key', { p_type: assetType })).data as string | null,
  })),
);
const unmapped = mapped.filter((row) => !row.key);
check(
  'every production asset type resolves to a platform key',
  distinctTypes.length > 0 && unmapped.length === 0,
  unmapped.length
    ? `unmapped: ${unmapped.map((row) => row.assetType).join(', ')}`
    : `${mapped.length} types`,
);
check(
  'ads_customer resolves to googleAds',
  mapped.find((row) => row.assetType === 'ads_customer')?.key === 'googleAds',
  'the arm whose absence dropped every Google Ads account from both Integrations pages',
);

const ownerEmail = ownerId
  ? (await supabase.auth.admin.getUserById(ownerId)).data.user?.email
  : undefined;

if (!ownerId || !ownerEmail) {
  record('personal summary RPC', 'FAIL', 'no google integration owner to authenticate as');
} else if (!anonKey) {
  record('personal summary RPC', 'FAIL', 'SUPABASE_ANON_KEY absent — cannot mint a user session');
} else {
  // The only recipe that satisfies JWKS verification (no hand-signed tokens):
  // admin generateLink -> anon verifyOtp -> session access token. Mirrors
  // Continuum-Backend/scripts/_bench/mint.ts, inlined because the Frontend repo
  // is cloned standalone and cannot import from the Backend.
  const link = await supabase.auth.admin.generateLink({ type: 'magiclink', email: ownerEmail });
  const hashedToken = link.data?.properties?.hashed_token;
  if (link.error || !hashedToken) {
    record('mint owner session', 'FAIL', link.error?.message ?? 'no hashed_token');
    finish();
  }
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const verified = await anon.auth.verifyOtp({ token_hash: hashedToken as string, type: 'email' });
  const accessToken = verified.data.session?.access_token;
  if (verified.error || !accessToken) {
    record('mint owner session', 'FAIL', verified.error?.message ?? 'no session');
    finish();
  }
  record('mint owner session', 'PASS', `authenticated as the owner of ${ads.length} ads assets`);

  const asOwner = createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  }).schema('brand_profiles');

  const { data: rpcRows, error: rpcError } = await asOwner.rpc('get_user_integration_summary', {
    p_user_id: ownerId,
  });
  if (rpcError) {
    record('personal summary RPC', 'FAIL', rpcError.message);
  } else {
    const rows = (rpcRows ?? []) as Record<string, unknown>[];
    record('personal summary RPC', 'PASS', `${rows.length} rows as the real user`);
    check(
      'personal summary RPC exposes asset_type',
      rows.length === 0 || rows.every((r) => 'asset_type' in r),
      'the label path reads asset_type; a rename silently un-formats every row',
    );
    // The regression itself: a NULL platform_key is dropped by
    // userIntegrations.ts:95 before it ever reaches a component.
    const dropped = rows.filter((r) => !r.platform_key);
    check(
      'no row the RPC returns is dropped for a null platform_key',
      dropped.length === 0,
      dropped.length
        ? `dropped: ${[...new Set(dropped.map((r) => String(r.asset_type)))].join(', ')}`
        : undefined,
    );

    const adsRows = rows.filter((r) => r.asset_type === 'ads_customer');
    if (adsRows.length === 0) {
      record('personal Connections googleAds row', 'SKIP', 'this owner has no ads_customer asset');
    } else {
      check(
        'every ads_customer row carries platform_key googleAds',
        adsRows.every((r) => r.platform_key === 'googleAds'),
        `${adsRows.length} rows`,
      );
      const label =
        (adsRows[0].asset_name as string | null)?.trim() ||
        assetFallbackLabel(
          adsRows[0].asset_type as string | null,
          adsRows[0].external_account_id as string | null,
        );
      check(
        'personal Connections renders a real Google Ads row properly',
        label !== 'google' && label !== 'Account' && !/^\d{10}$/.test(label),
        `renders as "${label}"`,
      );
    }
  }
}

// 4. The fallback branch userIntegrations takes whenever that RPC errors reads
// asset.type / asset.external_account_id straight off these rows. It is the path
// that used to render `integration.provider`, so assert it over real rows.
if (ownerId) {
  const { data: ownerIntegrations } = await db
    .from('user_integrations')
    .select('id, provider')
    .eq('user_id', ownerId);
  const ids = (ownerIntegrations ?? []).map((i) => i.id);
  const { data: ownerAssets } = ids.length
    ? await db
        .from('integration_accounts_assets')
        .select('type, name, external_account_id, integration_id')
        .in('integration_id', ids)
    : { data: [] };

  const providerById = new Map((ownerIntegrations ?? []).map((i) => [i.id, i.provider]));
  const fallbackLabels = (ownerAssets ?? []).map((asset) => ({
    provider: providerById.get(asset.integration_id),
    label: asset.name?.trim() || assetFallbackLabel(asset.type, asset.external_account_id),
  }));

  record(
    'personal summary fallback branch',
    fallbackLabels.length > 0 ? 'PASS' : 'SKIP',
    `${fallbackLabels.length} real assets for this owner`,
  );
  if (fallbackLabels.length > 0) {
    check(
      'fallback branch never renders the provider string',
      fallbackLabels.every((row) => row.label !== row.provider),
      'this is the exact line that printed "google" for every unnamed ad account',
    );
    check(
      'fallback branch never renders a bare customer id',
      fallbackLabels.every((row) => !/^\d{10}$/.test(row.label)),
    );
  }
}

note(
  'Un-exercised hop: the real Google Ads name fetch. Google has since granted Standard developer-token access, but no resync has run, so every ads_customer row still carries name: null from the DEVELOPER_TOKEN_NOT_APPROVED era. This bench proves the UNNAMED path renders correctly; run google:ads:enrichment:bench (which writes) to populate names, then re-run this to cover the named one.',
);

finish();

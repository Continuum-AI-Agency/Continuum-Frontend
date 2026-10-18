// Local-stack plumbing shared by the planner benches: the fixture owner and brand, an admin
// client, the onboarding repair the /organic page needs, and real media made in a real
// browser (canvas PNGs, Mediabunny H.264 MP4s) uploaded to real local storage.

import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';
import { appCacheKeys } from '../../src/lib/cache/keys';
import { createDefaultOnboardingState } from '../../src/lib/onboarding/state';

export const LOCAL_OWNER_EMAIL = 'local@continuum.test';
export const LOCAL_OWNER_PASSWORD = 'localdev123';
export const OWNER_ID = '00000000-0000-0000-0000-0000000000a1';
// RFC-4122-valid: the legacy fixture brand (…0000b1) fails the Backend's z.uuid().
export const BRAND_ID = '00000000-0000-4000-8000-0000000000b2';
export const MEDIA_BUCKET = 'brand-profile-assets';

export const HAS_LOCAL_STACK = Boolean(
  /127\.0\.0\.1|localhost/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '') &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

export function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Run `bun run supabase:env:local`.',
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export const schemaOf = (supabase: SupabaseClient, schema: string) =>
  (supabase as unknown as { schema: (s: string) => SupabaseClient }).schema(schema);

// The bench brand's brand_profiles.timezone. The planner draws the brand's days, so the benches
// count days there too: the machine's zone put "today" a day behind the page every evening in
// PDT (00:00-07:00 UTC).
export const BRAND_TIME_ZONE = 'UTC';

export function dayIdOffsetFromToday(offsetDays: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BRAND_TIME_ZONE }).format(
    Date.now() + offsetDays * 86_400_000,
  );
}

export async function setActiveBrand(supabase: SupabaseClient, brandId: string): Promise<void> {
  await supabase
    .schema('brand_profiles')
    .from('user_brand_preferences')
    .upsert({ user_id: OWNER_ID, active_brand_id: brandId }, { onConflict: 'user_id' })
    .throwOnError();
}

export async function readActiveBrand(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase
    .schema('brand_profiles')
    .from('user_brand_preferences')
    .select('active_brand_id')
    .eq('user_id', OWNER_ID)
    .maybeSingle();
  return (data?.active_brand_id as string | undefined) ?? null;
}

// The /organic page Zod-normalizes EVERY onboarding row the user has, so one malformed row
// (the local stack leaves `state = {}`) takes the whole page down whichever brand is active.
// The planner reads the brand's connected integrations through the app cache for an hour,
// and the dev server shares that cache with every bench. A bench that seeds integration rows
// leaves its list behind there after its rows are gone, and the next bench draws a platform
// row and an account picker for accounts that no longer exist. Drop the owner's entry; the
// brand id is synthetic, so no real brand's entry is touched.
export async function forgetCachedIntegrations(): Promise<void> {
  const url = process.env.APP_CACHE_REDIS_URL;
  const token = process.env.APP_CACHE_REDIS_TOKEN;
  if (!url || !token || !/^https?:\/\//i.test(url)) return;
  await new Redis({ url, token }).del(appCacheKeys.brandIntegrations(BRAND_ID, OWNER_ID));
}

export async function repairOnboarding(supabase: SupabaseClient): Promise<void> {
  const defaultState = createDefaultOnboardingState({
    id: OWNER_ID,
    email: LOCAL_OWNER_EMAIL,
    role: 'owner',
  } as Parameters<typeof createDefaultOnboardingState>[0]);
  const onboarding = () => supabase.schema('brand_profiles').from('user_onboarding_states');

  const { data: rows } = await onboarding().select('brand_id, state').eq('user_id', OWNER_ID);
  for (const row of rows ?? []) {
    const state = row.state as Record<string, unknown> | null;
    if (state && typeof state.step === 'number') continue;
    await onboarding()
      .update({ state: defaultState })
      .eq('user_id', OWNER_ID)
      .eq('brand_id', row.brand_id)
      .throwOnError();
  }
  await onboarding().update({ is_active: false }).eq('user_id', OWNER_ID).throwOnError();
  await onboarding()
    .upsert(
      { user_id: OWNER_ID, brand_id: BRAND_ID, state: defaultState, is_active: true },
      { onConflict: 'user_id,brand_id' },
    )
    .throwOnError();
}

export type BenchMediaSpec = { kind: 'image' | 'video'; width: number; height: number };
export type BenchMedia = BenchMediaSpec & { path: string; signedUrl: string; mimeType: string };

type PosterBench = {
  makeMp4OfSize: (w: number, h: number, sec: number) => Promise<{ base64: string }>;
  makePngOfSize: (w: number, h: number) => Promise<{ base64: string }>;
};

// Playwright's runner is Node and cannot import the app's TS; Bun bundles the encoder for
// the page.
function buildPosterBundle(): string {
  const outfile = join(tmpdir(), `planner-bench-${Date.now()}.js`);
  execFileSync(
    'bun',
    ['build', 'e2e/support/posterBenchEntry.ts', '--target=browser', '--outfile', outfile],
    { cwd: process.cwd(), stdio: 'pipe' },
  );
  const code = readFileSync(outfile, 'utf8');
  rmSync(outfile, { force: true });
  return code;
}

/** Encodes each spec in `page`, uploads it under `dir`, and signs it for six hours. */
export async function makeBenchMedia<Name extends string>(
  page: Page,
  supabase: SupabaseClient,
  specs: Record<Name, BenchMediaSpec>,
  dir: string,
): Promise<Map<Name, BenchMedia>> {
  const { error: bucketError } = await supabase.storage.createBucket(MEDIA_BUCKET, {
    public: false,
  });
  if (bucketError && !/already exists/i.test(bucketError.message)) {
    throw new Error(`bucket ${MEDIA_BUCKET}: ${bucketError.message}`);
  }
  await page.goto('/organic', { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ content: buildPosterBundle(), type: 'module' });
  await page.waitForFunction(
    () => Boolean((window as unknown as { __posterBench?: unknown }).__posterBench),
    undefined,
    { timeout: 60_000 },
  );
  const made = new Map<Name, BenchMedia>();
  for (const [name, spec] of Object.entries(specs) as [Name, BenchMediaSpec][]) {
    const { base64 } = await page.evaluate(({ kind, width, height }) => {
      const bench = (window as unknown as { __posterBench: PosterBench }).__posterBench;
      return kind === 'video'
        ? bench.makeMp4OfSize(width, height, 2)
        : bench.makePngOfSize(width, height);
    }, spec);
    const bytes = Buffer.from(base64, 'base64');
    if (bytes.byteLength < 1_000) throw new Error(`${name}: the in-page encoder produced no bytes`);
    const mimeType = spec.kind === 'video' ? 'video/mp4' : 'image/png';
    const path = `${dir}/${name}.${spec.kind === 'video' ? 'mp4' : 'png'}`;
    const { error } = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(path, bytes, { contentType: mimeType, upsert: true });
    if (error) throw new Error(`upload ${path}: ${error.message}`);
    const signed = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, 6 * 3600);
    if (signed.error || !signed.data?.signedUrl) {
      throw new Error(`sign ${path}: ${signed.error?.message}`);
    }
    made.set(name, { ...spec, path, signedUrl: signed.data.signedUrl, mimeType });
  }
  return made;
}

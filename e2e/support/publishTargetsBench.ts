// Plumbing for organic:publish-targets:e2e:bench: the local-stack env, the bench's own Backend
// (provider sockets faked by a preload), and a multi-account fixture brand it seeds and removes.
//
// Run as a script (`bun e2e/support/publishTargetsBench.ts --print-env`) it refuses to start when
// another Playwright run is live, a bench port is taken or the stack is not loopback, and otherwise
// prints the `export` lines the package script evals: local Supabase, the bench Backend, EVERY
// Redis/Upstash/app-cache key blanked, by name or by value (both .env files are the production env,
// and a blank key is one neither Bun nor Next will fill from them), and the Frontend preload that
// proves it live. Only key NAMES are ever printed or reported, never a value.

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseEnv } from 'node:util';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createDefaultOnboardingState } from '../../src/lib/onboarding/state';
import { LOCAL_OWNER_EMAIL, MEDIA_BUCKET, OWNER_ID } from './plannerBench';
import { cacheEnvKeys, liveCacheEnvKeys } from './publishTargetsBenchEnv';

export const BENCH = 'organic:publish-targets:e2e:bench';
export const FE_PORT = 3031;
export const BE_PORT = 4031;
export const TAP_PORT = 4032;
export const FE_ORIGIN = `http://localhost:${FE_PORT}`;
export const BE_URL = `http://127.0.0.1:${BE_PORT}`;
export const TAP_URL = `http://127.0.0.1:${TAP_PORT}`;
export const FE_ENV_DIR = path.join(os.tmpdir(), 'continuum-publish-targets-bench-fe-env');

// Both the package script and Playwright run from Continuum-Frontend.
const FRONTEND_DIR = process.cwd();
const ROOT = path.resolve(FRONTEND_DIR, '..');
const BACKEND_DIR = path.join(ROOT, 'Continuum-Backend');
export const ARTIFACTS = path.join(ROOT, 'artifacts/organic-publish-targets');
const LOOPBACK = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)|@127\.0\.0\.1:/;

// --- Local stack + env ---------------------------------------------------------------------------

/** `supabase status -o env` of the stack this clone's workdir names; refuses anything not loopback. */
export function localStackStatus(): Record<string, string> {
  const raw = execFileSync('supabase', ['status', '-o', 'env', '--workdir', '.'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const values: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
    if (match?.[1] && match[2] !== undefined) values[match[1]] = match[2];
  }
  if (!values.API_URL || !values.SERVICE_ROLE_KEY || !values.ANON_KEY || !values.DB_URL) {
    throw new Error(`[${BENCH}] the local stack is not up: \`bun run supabase:start\`.`);
  }
  for (const key of ['API_URL', 'DB_URL'] as const) {
    if (!LOOPBACK.test(values[key] ?? '')) {
      throw new Error(`[${BENCH}] refusing: ${key} is not loopback (${values[key]}).`);
    }
  }
  return values;
}

const envFile = (file: string): Record<string, string> =>
  fs.existsSync(file) ? (parseEnv(fs.readFileSync(file, 'utf8')) as Record<string, string>) : {};

/** Every cache key either .env (or this shell) holds, by name or value. Each is blanked, never dropped. */
export function redisKeysToBlank(): string[] {
  const keys = new Set<string>();
  for (const source of [
    envFile(path.join(FRONTEND_DIR, '.env')),
    envFile(path.join(FRONTEND_DIR, '.env.local')),
    envFile(path.join(BACKEND_DIR, '.env')),
    process.env,
  ]) {
    for (const key of cacheEnvKeys(source)) keys.add(key);
  }
  return [...keys].sort();
}

function listening(port: number): string[] {
  try {
    return execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * `pgrep -f "playwright test"`, minus shells: a wrapper or a wait loop whose own command text
 * says "playwright test" (`until ! pgrep -f "playwright test"; …`) is not a run.
 */
export function livePlaywrightRuns(): string[] {
  try {
    return execFileSync('pgrep', ['-f', 'playwright test'], { encoding: 'utf8' })
      .split('\n')
      .filter((pid) => pid && Number(pid) !== process.pid)
      .filter((pid) => {
        try {
          const comm = execFileSync('ps', ['-o', 'comm=', '-p', pid], { encoding: 'utf8' }).trim();
          return comm !== '' && !/(^|\/)-?(ba|z|da|fi)?sh$/.test(comm);
        } catch {
          return false; // exited meanwhile
        }
      });
  } catch {
    return [];
  }
}

/** The Frontend's env for this bench: local Supabase, the bench Backend, Redis blanked, the probe. */
export function frontendBenchEnv(status = localStackStatus()): Record<string, string> {
  const blanks = Object.fromEntries(redisKeysToBlank().map((key) => [key, '']));
  return {
    ...blanks,
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL ?? '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY ?? '',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY: status.ANON_KEY ?? '',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY: status.ANON_KEY ?? '',
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY ?? '',
    NEXT_PUBLIC_API_URL: BE_URL,
    API_URL: BE_URL,
    API_BASE_URL: BE_URL,
    PTB_FE_ENV_DIR: FE_ENV_DIR,
    BUN_OPTIONS: `--preload=${path.join(FRONTEND_DIR, 'e2e/support/publishTargetsBenchFrontendPreload.ts')}`,
  };
}

// --- The bench's own Backend -------------------------------------------------------------------

async function healthy(url: string): Promise<boolean> {
  try {
    return (await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(2_000) })).ok;
  } catch {
    return false;
  }
}

function signalGroup(pid: number, signal: NodeJS.Signals): void {
  // Spawned detached, so its pid is its own process group: this reaches what it spawned, nothing else.
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // gone
    }
  }
}

export type BenchBackend = { pid: number; env: Record<string, string>; stop: () => Promise<void> };

/**
 * This clone's Fastify Backend on :4031 against the LOCAL stack: every worker off, every Supabase key
 * local, every Redis/Upstash/app-cache key REMOVED, by name or value, with the token beside a cache
 * URL (the BE never loads .env itself: `--no-env-file`,
 * and nothing in App/ calls dotenv), and the provider-socket preload in front of App/Index.ts.
 */
export async function startBenchBackend(status = localStackStatus()): Promise<BenchBackend> {
  for (const port of [BE_PORT, TAP_PORT]) {
    const owners = listening(port);
    if (owners.length > 0) {
      throw new Error(
        `[${BENCH}] :${port} is taken (pid ${owners.join(',')}); this bench did not start it.`,
      );
    }
  }
  const backendFile = envFile(path.join(BACKEND_DIR, '.env'));
  const cacheKeys = new Set([...cacheEnvKeys(process.env), ...cacheEnvKeys(backendFile)]);
  const keep = (env: Record<string, string | undefined>) =>
    Object.fromEntries(
      Object.entries(env).filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === 'string' &&
          !entry[0].startsWith('SUPABASE_') &&
          !entry[0].startsWith('NEXT_PUBLIC_') &&
          !cacheKeys.has(entry[0]) &&
          entry[0] !== 'BUN_OPTIONS' &&
          !entry[0].startsWith('PTB_'),
      ),
    );
  const env: Record<string, string> = {
    ...keep(process.env),
    ...keep(backendFile),
    SUPABASE_URL: status.API_URL ?? '',
    SUPABASE_PROJECT_URL: status.API_URL ?? '',
    SUPABASE_ANON_KEY: status.ANON_KEY ?? '',
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY ?? '',
    SUPABASE_DB_URL: status.DB_URL ?? '',
    PORT: String(BE_PORT),
    HOST: '127.0.0.1',
    ALLOWED_ORIGINS: [FE_ORIGIN, `http://127.0.0.1:${FE_PORT}`].join(','),
    MCP_JOB_WORKER_ENABLED: 'false',
    BACKGROUND_WORKERS_ENABLED: 'false',
    ORGANIC_JOB_WORKER_ENABLED: 'false',
    JAINA_REPORT_ARTIFACT_WORKER_ENABLED: 'false',
    BRAND_REPORT_JOB_WORKER_ENABLED: 'false',
    STRATEGIC_RECONCILER_ENABLED: 'false',
    PREVIEW_RECONCILER_DISABLED: 'true',
    PTB_TAP_PORT: String(TAP_PORT),
    PTB_BACKEND_DIR: BACKEND_DIR,
  };
  const preload = path.join(FRONTEND_DIR, 'e2e/support/publishTargetsBenchBackendPreload.ts');
  const child = spawn('bun', ['--no-env-file', '--preload', preload, 'App/Index.ts'], {
    cwd: BACKEND_DIR,
    detached: true,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tail: string[] = [];
  const logFile = path.join(ARTIFACTS, 'backend.log');
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  fs.writeFileSync(logFile, '');
  const capture = (chunk: Buffer) => {
    tail.push(chunk.toString());
    if (tail.length > 60) tail.shift();
    fs.appendFileSync(logFile, chunk);
  };
  child.stdout?.on('data', capture);
  child.stderr?.on('data', capture);
  let exited = false;
  child.once('exit', () => {
    exited = true;
  });
  const pid = child.pid;
  if (!pid) throw new Error(`[${BENCH}] the Backend did not spawn`);

  const stop = async () => {
    if (exited) return;
    signalGroup(pid, 'SIGTERM');
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        signalGroup(pid, 'SIGKILL');
        resolve(null);
      }, 8_000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve(null);
      });
    });
  };

  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (await healthy(BE_URL)) return { pid, env, stop };
    if (exited) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  await stop();
  throw new Error(`[${BENCH}] the Backend never became healthy.\n${tail.join('')}`);
}

// --- Fixture ---------------------------------------------------------------------------------------

export const BRAND_ID = '00000000-0000-4000-8a7a-000000000001';
export const BRAND_NAME = 'Publish Targets Bench';
export const OTHER_BRAND_ID = '00000000-0000-4000-8a7a-000000000002';
export const BENCH_TAG = 'organic-publish-targets-bench';
const STORAGE_DIR = `${BRAND_ID}/publish-targets-bench`;
const id = (n: number) => `00000000-0000-4000-8a7a-${String(n).padStart(12, '0')}`;
const avatar = (name: string) => `${TAP_URL}/avatar/${name}.png`;

const INTEGRATIONS = {
  meta: { id: id(101), provider: 'meta', user: 'ptb-meta', reauth: false, brand: BRAND_ID },
  metaReauth: {
    id: id(102),
    provider: 'meta',
    user: 'ptb-meta-reauth',
    reauth: true,
    brand: BRAND_ID,
  },
  tiktok: { id: id(103), provider: 'tiktok', user: 'ptb-tiktok', reauth: false, brand: BRAND_ID },
  linkedin: {
    id: id(104),
    provider: 'linkedin',
    user: 'ptb-linkedin',
    reauth: false,
    brand: BRAND_ID,
  },
  metaOther: {
    id: id(105),
    provider: 'meta',
    user: 'ptb-meta-other',
    reauth: false,
    brand: OTHER_BRAND_ID,
  },
} as const;

export type BenchAccount = {
  id: string;
  platform: 'instagram' | 'facebook' | 'tiktok' | 'linkedin';
  type: string;
  integration: keyof typeof INTEGRATIONS;
  externalId: string;
  name: string;
  /** What the UI must show for it (the handle, or a Page's name). */
  label: string;
  avatarUrl: string | null;
  rawPayload: Record<string, unknown>;
};

const account = (a: BenchAccount) => a;
export const ACCOUNTS = {
  igA: account({
    id: id(201),
    platform: 'instagram',
    type: 'meta_instagram_account',
    integration: 'meta',
    externalId: '17841400000000001',
    name: 'Acme A',
    label: '@acme_a',
    avatarUrl: avatar('ig-a'),
    rawPayload: { username: 'acme_a', profile_picture_url: avatar('ig-a') },
  }),
  igB: account({
    id: id(202),
    platform: 'instagram',
    type: 'meta_instagram_account',
    integration: 'meta',
    externalId: '17841400000000002',
    name: 'Acme B',
    label: '@acme_b',
    avatarUrl: avatar('ig-b'),
    rawPayload: { username: 'acme_b', profile_picture_url: avatar('ig-b') },
  }),
  igReauth: account({
    id: id(203),
    platform: 'instagram',
    type: 'meta_instagram_account',
    integration: 'metaReauth',
    externalId: '17841400000000003',
    name: 'Acme Old',
    label: '@acme_old',
    avatarUrl: null,
    rawPayload: { username: 'acme_old' },
  }),
  fb1: account({
    id: id(204),
    platform: 'facebook',
    type: 'meta_page',
    integration: 'meta',
    externalId: '100000000000001',
    name: 'Acme Page One',
    label: 'Acme Page One',
    avatarUrl: avatar('fb-1'),
    rawPayload: { picture: { data: { url: avatar('fb-1') } } },
  }),
  fb2: account({
    id: id(205),
    platform: 'facebook',
    type: 'meta_page',
    integration: 'meta',
    externalId: '100000000000002',
    name: 'Acme Page Two',
    label: 'Acme Page Two',
    avatarUrl: avatar('fb-2'),
    rawPayload: { picture: { data: { url: avatar('fb-2') } } },
  }),
  tiktok: account({
    id: id(206),
    platform: 'tiktok',
    type: 'tiktok_user',
    integration: 'tiktok',
    externalId: 'ptb-tiktok-open-id',
    name: 'Acme TT',
    label: '@acme_tt',
    avatarUrl: avatar('tt'),
    rawPayload: { username: 'acme_tt', display_name: 'Acme TT', avatar_url: avatar('tt') },
  }),
  linkedin: account({
    id: id(207),
    platform: 'linkedin',
    type: 'linkedin_organization',
    integration: 'linkedin',
    externalId: '90000001',
    name: 'Acme LinkedIn',
    label: 'Acme LinkedIn',
    avatarUrl: null,
    rawPayload: {},
  }),
  /** Another brand's Instagram account: the foreign stamp of check 8. */
  foreignIg: account({
    id: id(208),
    platform: 'instagram',
    type: 'meta_instagram_account',
    integration: 'metaOther',
    externalId: '17841400000000009',
    name: 'Other Brand IG',
    label: '@other_brand_ig',
    avatarUrl: null,
    rawPayload: { username: 'other_brand_ig' },
  }),
} as const;

const schemaOf = (supabase: SupabaseClient, schema: string) =>
  (supabase as unknown as { schema: (s: string) => SupabaseClient }).schema(schema);

export type BrandRestore = { preference: string | null; activeOnboarding: string[] };

/** Point the local owner at the bench brand; returns what to put back. */
export async function activateBenchBrand(supabase: SupabaseClient): Promise<BrandRestore> {
  const bp = schemaOf(supabase, 'brand_profiles');
  const { data: pref } = await bp
    .from('user_brand_preferences')
    .select('active_brand_id')
    .eq('user_id', OWNER_ID)
    .maybeSingle();
  const { data: active } = await bp
    .from('user_onboarding_states')
    .select('brand_id')
    .eq('user_id', OWNER_ID)
    .eq('is_active', true);
  const preference = (pref?.active_brand_id as string | undefined) ?? null;
  const restore: BrandRestore = {
    preference: preference === BRAND_ID ? null : preference,
    activeOnboarding: (active ?? [])
      .map((row) => row.brand_id as string)
      .filter((brand) => brand !== BRAND_ID),
  };
  const defaultState = createDefaultOnboardingState({
    id: OWNER_ID,
    email: LOCAL_OWNER_EMAIL,
    role: 'owner',
  } as Parameters<typeof createDefaultOnboardingState>[0]);
  // The /organic page Zod-normalizes every onboarding row the owner has: repair `{}` states.
  const { data: rows } = await bp
    .from('user_onboarding_states')
    .select('brand_id, state')
    .eq('user_id', OWNER_ID);
  for (const row of rows ?? []) {
    const state = row.state as Record<string, unknown> | null;
    if (state && typeof state.step === 'number') continue;
    await bp
      .from('user_onboarding_states')
      .update({ state: defaultState })
      .eq('user_id', OWNER_ID)
      .eq('brand_id', row.brand_id)
      .throwOnError();
  }
  await bp
    .from('user_onboarding_states')
    .update({ is_active: false })
    .eq('user_id', OWNER_ID)
    .throwOnError();
  await bp
    .from('user_onboarding_states')
    .upsert(
      { user_id: OWNER_ID, brand_id: BRAND_ID, state: defaultState, is_active: true },
      { onConflict: 'user_id,brand_id' },
    )
    .throwOnError();
  await bp
    .from('user_brand_preferences')
    .upsert({ user_id: OWNER_ID, active_brand_id: BRAND_ID }, { onConflict: 'user_id' })
    .throwOnError();
  return restore;
}

/** Put the owner's brand preference and active onboarding row back as the run found them. */
export async function restoreBrand(supabase: SupabaseClient, restore: BrandRestore): Promise<void> {
  const bp = schemaOf(supabase, 'brand_profiles');
  if (restore.preference) {
    await bp
      .from('user_brand_preferences')
      .upsert({ user_id: OWNER_ID, active_brand_id: restore.preference }, { onConflict: 'user_id' })
      .throwOnError();
  } else {
    await bp
      .from('user_brand_preferences')
      .delete()
      .eq('user_id', OWNER_ID)
      .eq('active_brand_id', BRAND_ID);
  }
  if (restore.activeOnboarding.length > 0) {
    // One active onboarding row per owner (`idx_user_onboarding_states_active`): the bench brand's
    // row must step down before the owner's comes back, or the re-activation is a duplicate key.
    await bp
      .from('user_onboarding_states')
      .update({ is_active: false })
      .eq('user_id', OWNER_ID)
      .eq('brand_id', BRAND_ID)
      .throwOnError();
    await bp
      .from('user_onboarding_states')
      .update({ is_active: true })
      .eq('user_id', OWNER_ID)
      .in('brand_id', restore.activeOnboarding)
      .throwOnError();
  }
}

/** The two brands, the five connections, their eight accounts, links, grants and the owner's seat. */
export async function seedAccounts(supabase: SupabaseClient): Promise<void> {
  const bp = schemaOf(supabase, 'brand_profiles');
  await bp
    .from('brand_profiles')
    .insert([
      { id: BRAND_ID, brand_name: BRAND_NAME, created_by: OWNER_ID, timezone: 'UTC', tier: 1 },
      {
        id: OTHER_BRAND_ID,
        brand_name: `${BRAND_NAME} (other brand)`,
        created_by: OWNER_ID,
        timezone: 'UTC',
        tier: 1,
      },
    ])
    .throwOnError();
  // `on_brand_created` already makes the creator an owner; the upsert only pins the role + email.
  await bp
    .from('permissions')
    .upsert(
      { brand_profile_id: BRAND_ID, user_id: OWNER_ID, role: 'owner', email: LOCAL_OWNER_EMAIL },
      { onConflict: 'brand_profile_id,user_id' },
    )
    .throwOnError();

  const day = 86_400_000;
  for (const integration of Object.values(INTEGRATIONS)) {
    const { data: token, error } = await bp.rpc('encrypt_token', {
      token: `fake-${integration.user}-token`,
    });
    if (error) throw new Error(`encrypt_token: ${error.message}`);
    await bp
      .from('user_integrations')
      .insert({
        id: integration.id,
        user_id: OWNER_ID,
        provider: integration.provider,
        platform_user_id: integration.user,
        status: integration.reauth ? 'needs_reauth' : 'active',
        access_token_encrypted: token,
        refresh_token_encrypted: token,
        expires_at: new Date(Date.now() + (integration.reauth ? -day : 60 * day)).toISOString(),
        metadata: { benchTag: BENCH_TAG },
      })
      .throwOnError();
    await bp
      .from('brand_integration_grants')
      .insert({
        brand_profile_id: integration.brand,
        integration_id: integration.id,
        granted_by: OWNER_ID,
      })
      .throwOnError();
  }
  const accounts = Object.values(ACCOUNTS);
  await bp
    .from('integration_accounts_assets')
    .insert(
      accounts.map((a) => ({
        id: a.id,
        integration_id: INTEGRATIONS[a.integration].id,
        external_account_id: a.externalId,
        type: a.type,
        name: a.name,
        status: 'active',
        raw_payload: a.rawPayload,
      })),
    )
    .throwOnError();
  await bp
    .from('brand_profile_integration_accounts')
    .insert(
      accounts.map((a) => ({
        brand_profile_id: INTEGRATIONS[a.integration].brand,
        integration_account_id: a.id,
        integration_id: INTEGRATIONS[a.integration].id,
        external_id: a.externalId,
        type: a.type,
        name: a.name,
      })),
    )
    .throwOnError();
}

export async function uploadStill(supabase: SupabaseClient, bytes: Buffer): Promise<string> {
  const objectPath = `${STORAGE_DIR}/still.png`;
  const { error: bucketError } = await supabase.storage.createBucket(MEDIA_BUCKET, {
    public: false,
  });
  if (bucketError && !/already exists/i.test(bucketError.message)) {
    throw new Error(`bucket: ${bucketError.message}`);
  }
  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(objectPath, bytes, { contentType: 'image/png', upsert: true });
  if (error) throw new Error(`upload: ${error.message}`);
  return objectPath;
}

/** A one-image post on `platform`, stamped with `accountId`, on `dayId`. */
export function draftRow(input: {
  id: string;
  title: string;
  platform: BenchAccount['platform'];
  accountId: string | null;
  caption: string;
  dayId: string;
  stillPath: string;
  /** A generated draft's brief (placementId + schedule): what adapt-caption re-argues. */
  withBrief?: boolean;
}) {
  const brief = input.withBrief
    ? {
        placementId: `ptb-${input.id}`,
        schedule: { dayId: input.dayId, scheduledAt: `${input.dayId}T15:00:00.000Z` },
      }
    : {};
  return {
    id: input.id,
    brand_id: BRAND_ID,
    user_id: OWNER_ID,
    platform: input.platform,
    platform_account_id: input.accountId,
    status: 'draft',
    scheduled_date: null,
    client_key: `ptb-${input.id}`,
    media_stage: 'realized',
    slot_data: {
      title: input.title,
      platform: input.platform,
      dayId: input.dayId,
      timeZone: 'UTC',
      benchTag: BENCH_TAG,
    },
    content_json: {
      ...brief,
      content: { format: 'POST', titleTopic: input.title },
      copy: { caption: input.caption },
      publishingAssets: [
        {
          role: 'primary',
          kind: 'image',
          slideIndex: 0,
          bucket: MEDIA_BUCKET,
          storagePath: input.stillPath,
          storageUrl: '',
          mimeType: 'image/png',
          width: 1080,
          height: 1080,
        },
      ],
      creative: { mediaSuggestion: { mediaStatus: 'ready' } },
    },
  };
}

/**
 * Everything this bench ever wrote, by its own ids: publish rows by brand (they carry no FK to it),
 * the five connections (cascading their accounts, links and grants), both brands (cascading drafts,
 * the seat, onboarding, preference and session pins), the still, and any inline staging copy.
 * Safe to run first (a crashed run's leftovers) and last.
 */
export async function purgeFixture(supabase: SupabaseClient): Promise<Record<string, number>> {
  const organic = schemaOf(supabase, 'organic');
  const bp = schemaOf(supabase, 'brand_profiles');
  const brands = [BRAND_ID, OTHER_BRAND_ID];
  const left: Record<string, number> = {};
  await organic.from('organic_publish_attempts').delete().in('brand_id', brands);
  await organic.from('organic_published_posts').delete().in('brand_id', brands);
  await bp
    .from('user_integrations')
    .delete()
    .in(
      'id',
      Object.values(INTEGRATIONS).map((i) => i.id),
    );
  // Permissions first: a permission deleted by the brand's cascade trips
  // `pause_automations_for_ineligible_member` ("brand profile not found") and the brand survives.
  await bp.from('permissions').delete().in('brand_profile_id', brands);
  await bp.from('brand_profiles').delete().in('id', brands);
  for (const [bucket, prefix] of [
    [MEDIA_BUCKET, STORAGE_DIR],
    ['media-library', `publish-inline/${BRAND_ID}`],
  ] as const) {
    const { data } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
    const names = (data ?? []).map((file) => `${prefix}/${file.name}`);
    if (names.length > 0) await supabase.storage.from(bucket).remove(names);
  }
  const count = async (schema: string, table: string, column: string, values: string[]) => {
    const { count: n } = await schemaOf(supabase, schema)
      .from(table)
      .select('*', { count: 'exact', head: true })
      .in(column, values);
    left[`${schema}.${table}`] = n ?? -1;
  };
  await count('organic', 'organic_calendar_drafts', 'brand_id', brands);
  await count('organic', 'organic_publish_attempts', 'brand_id', brands);
  await count('brand_profiles', 'brand_profiles', 'id', brands);
  await count(
    'brand_profiles',
    'user_integrations',
    'id',
    Object.values(INTEGRATIONS).map((i) => i.id),
  );
  await count(
    'brand_profiles',
    'integration_accounts_assets',
    'id',
    Object.values(ACCOUNTS).map((a) => a.id),
  );
  return left;
}

// --- Evidence ----------------------------------------------------------------------------------------

/** The bearer the browser holds, read from the minted @supabase/ssr cookies (one identity, two clients). */
export function accessTokenOf(cookies: ReadonlyArray<{ name: string; value: string }>): string {
  const chunks = cookies
    .filter((cookie) => /^sb-auth(\.\d+)?$/.test(cookie.name))
    .sort((a, b) => Number(a.name.split('.')[1] ?? -1) - Number(b.name.split('.')[1] ?? -1))
    .map((cookie) => cookie.value)
    .join('');
  const raw = chunks.startsWith('base64-')
    ? Buffer.from(chunks.slice(7), 'base64url').toString('utf8')
    : chunks;
  const token = (JSON.parse(raw) as { access_token?: string }).access_token;
  if (!token) throw new Error(`[${BENCH}] the minted cookies carry no access token`);
  return token;
}

export type TapCall = { method: string; url: string; body: unknown };

export async function tap<T>(pathname: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${TAP_URL}${pathname}`, init);
  return (await response.json()) as T;
}

/** The pids listening on the bench Frontend port, and their parents up to (not including) us. */
export function frontendServerPids(): number[] {
  const pids = new Set<number>();
  for (const pid of listening(FE_PORT).map(Number)) {
    let current = pid;
    for (let hop = 0; hop < 6 && current > 1 && current !== process.pid; hop += 1) {
      pids.add(current);
      try {
        current = Number(
          execFileSync('ps', ['-o', 'ppid=', '-p', String(current)], { encoding: 'utf8' }).trim(),
        );
      } catch {
        break;
      }
    }
  }
  return [...pids];
}

/** `ps -wwE` of a pid: the env it was LAUNCHED with, when the OS shows it (a second signal only). */
export function launchEnvRedisKeys(pid: number): { visible: boolean; keys: string[] } {
  try {
    const line = execFileSync('ps', ['-wwE', '-o', 'command=', '-p', String(pid)], {
      encoding: 'utf8',
    });
    const pairs = line.split(/\s+/).filter((token) => /^[A-Z_][A-Z0-9_]*=/.test(token));
    const launchEnv = Object.fromEntries(
      pairs.map(
        (pair) => [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)] as const,
      ),
    );
    return {
      visible: 'PATH' in launchEnv,
      keys: liveCacheEnvKeys(launchEnv),
    };
  } catch {
    return { visible: false, keys: [] };
  }
}

// --- Script mode --------------------------------------------------------------------------------------

if (process.argv.includes('--print-env')) {
  // Printed for the package script's `eval`: a refusal must stop the script there, before Playwright.
  // Single-quoted, so nothing in a message (a backticked command) is ever run by that eval.
  const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;
  const refuse = (reason: string): never => {
    console.log(`echo ${quote(`[${BENCH}] refusing: ${reason}`)} >&2; exit 1`);
    process.exit(0);
  };
  const runs = livePlaywrightRuns();
  if (runs.length > 0) {
    refuse(`another Playwright run is live (pid ${runs.join(',')}); wait for it.`);
  }
  for (const port of [FE_PORT, BE_PORT, TAP_PORT]) {
    const owners = listening(port);
    if (owners.length > 0) refuse(`:${port} is taken (pid ${owners.join(',')}).`);
  }
  let status: Record<string, string> = {};
  try {
    status = localStackStatus();
  } catch (error) {
    refuse((error as Error).message);
  }
  fs.rmSync(FE_ENV_DIR, { recursive: true, force: true });
  fs.mkdirSync(FE_ENV_DIR, { recursive: true });
  for (const [key, value] of Object.entries(frontendBenchEnv(status))) {
    console.log(`export ${key}=${quote(value)}`);
  }
}

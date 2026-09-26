import { type ChildProcess, spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintSessionBundleForEmail } from './support/auth';
import { type LocalBackend, startLocalBackend } from './support/localBackend';
import { loadProdSupabaseEnv, readBackendEnv } from './support/prodEnv';

// design-system:upload:e2e:bench
//
// The two ways a design-system upload was refused on 2026-09-25 with "new row violates
// row-level security policy", both read straight out of the Storage logs:
//
//   1. An INVITEE who signed in without the emailed link (password / Google) held a
//      pending invite and no permissions row. The browser wrote brand-docs as an
//      authenticated user the owner-or-member policy did not know. Four uploads, one user;
//      four more signed-up invitees sat in the same state. Fixed by redeeming the invite in
//      getActiveBrandContext, which the onboarding page and the dashboard layout load first.
//   2. A SIGNED-OUT browser: GoTrue revoked the session's refresh-token family, the browser
//      dropped its session, and the upload went out as `anon`. The fix cannot bring the
//      session back; it makes the card say so instead of blaming permissions.
//
// WHAT IT PROVES, with a fresh invitee seeded in exactly state 1:
//   · opening /onboarding redeems the invite (a permissions row appears);
//   · the Design system card's real upload writes brand-docs as that user (Storage 200);
//   · with the auth cookies gone, the same card refuses BEFORE touching Storage and says
//     "signed out", never "row-level security".
//
// REAL: hosted GoTrue + Postgres + Storage + the brand_invite edge function, a bench-owned
// Backend on hosted, the Next app, real Chrome driving the card's file input.
//
// STUBBED, STATED: the Backend ingest call that follows the upload answers 503 in the
// browser. It is a service-role write that no RLS policy guards, and a real parse would
// activate a junk design system on the bench brand. The card's orphan cleanup then deletes
// the object through the same brand-docs policy, which the bench also grades.
//
// Run: bun run design-system:upload:e2e:bench

const BENCH = 'design-system:upload:e2e:bench';
const { url: SUPABASE_URL, serviceRoleKey } = loadProdSupabaseEnv();

const FRONTEND_DIR = process.cwd();
const APP_PORT = Number(process.env.DS_UPLOAD_APP_PORT ?? 3136);
const APP = `http://127.0.0.1:${APP_PORT}`;
const BACKEND_PORT = Number(process.env.BENCH_BACKEND_PORT ?? 4426);
process.env.PLAYWRIGHT_BASE_URL = APP;

// The bench login's Vivo47-mirror brand: the only brand this bench writes to.
const BENCH_BRAND = 'b411bba9-d09c-4892-9b86-5ff340ce64e5';
const BENCH_OWNER_EMAIL = readBackendEnv('CONTINUUM_BENCH_OWNER_EMAIL') ?? 'bench@trycontinuum.ai';

const RUN_ID = `${Date.now()}`;
const INVITEE_EMAIL = `ds-upload-${RUN_ID}@continuum-e2e.test`;
const FILE_NAME = `ds-upload-bench-${RUN_ID}.pdf`;
// The smallest well-formed PDF: the card packages it as a `document` source.
const PDF_BYTES = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);

/* -- the Recorder envelope (same shape as session-content.bench.spec.ts) ------------- */
type Grade = { step: string; grade: 'PASS' | 'FAIL'; detail?: string };
const graded: Grade[] = [];
const notes: string[] = [];
const startedAt = new Date().toISOString();
const startedMs = Date.now();

function grade(step: string, ok: boolean, detail?: string): void {
  graded.push({ step, grade: ok ? 'PASS' : 'FAIL', ...(detail ? { detail } : {}) });
  console.log(`[${BENCH}] ${ok ? 'PASS' : 'FAIL'} ${step}${detail ? ` — ${detail}` : ''}`);
}

const SHOT_DIR = process.env.DS_UPLOAD_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'ds-upload-bench');
let currentPage: Page | null = null;

async function step(name: string, run: () => Promise<string | undefined>): Promise<boolean> {
  try {
    grade(name, true, await run());
    return true;
  } catch (error) {
    if (currentPage) {
      fs.mkdirSync(SHOT_DIR, { recursive: true });
      const file = path.join(SHOT_DIR, `${RUN_ID}-${name.replace(/\W+/g, '-').slice(0, 50)}.png`);
      await currentPage.screenshot({ path: file, fullPage: true }).catch(() => undefined);
      notes.push(`screenshot: ${file}`);
    }
    const message = error instanceof Error ? error.message : String(error);
    grade(
      name,
      false,
      message
        .replace(/\u001b\[[0-9;]*m/g, '')
        .split('\n')
        .slice(0, 12)
        .join(' ')
        .slice(0, 600),
    );
    return false;
  }
}

function printEnvelope(): void {
  const fail = graded.filter((result) => result.grade === 'FAIL').length;
  for (const note of notes) console.log(`· ${note}`);
  console.log(
    JSON.stringify({
      bench: BENCH,
      startedAt,
      durationMs: Date.now() - startedMs,
      results: graded,
      notes,
      counts: { pass: graded.length - fail, warn: 0, skip: 0, fail },
      exitCode: fail > 0 ? 1 : 0,
    }),
  );
}

/* -- hosted service-role seeds and residue ------------------------------------------- */

const db: SupabaseClient = createClient(SUPABASE_URL, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const brandProfiles = () => db.schema('brand_profiles');

const residue = { userId: null as string | null, inviteId: null as string | null };

async function seedInvitee(): Promise<string> {
  const { data: owner } = await brandProfiles()
    .from('brand_profiles')
    .select('created_by')
    .eq('id', BENCH_BRAND)
    .single()
    .throwOnError();
  const { data: created, error } = await db.auth.admin.createUser({
    email: INVITEE_EMAIL,
    email_confirm: true,
  });
  if (error || !created.user) throw new Error(`createUser failed: ${error?.message}`);
  residue.userId = created.user.id;
  const { data: invite } = await brandProfiles()
    .from('invites')
    .insert({
      brand_profile_id: BENCH_BRAND,
      email: INVITEE_EMAIL,
      role: 'admin',
      token_hash: `\\x${randomBytes(32).toString('hex')}`,
      expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      created_by: (owner as { created_by: string }).created_by,
    })
    .select('id')
    .single()
    .throwOnError();
  residue.inviteId = (invite as { id: string }).id;
  return created.user.id;
}

async function membershipRole(userId: string): Promise<string | null> {
  const { data } = await brandProfiles()
    .from('permissions')
    .select('role')
    .eq('brand_profile_id', BENCH_BRAND)
    .eq('user_id', userId)
    .maybeSingle();
  return (data as { role?: string } | null)?.role ?? null;
}

async function designSystemFolders(): Promise<Set<string>> {
  const { data } = await db.storage
    .from('brand-docs')
    .list(`${BENCH_BRAND}/design-systems`, { limit: 1000 });
  return new Set((data ?? []).map((item) => item.name));
}

/* -- the hosted app (same lifecycle as session-content.bench.spec.ts) ---------------- */

async function answers(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000), redirect: 'manual' });
    return response.status < 500;
  } catch {
    return false;
  }
}

async function killGroup(child: ChildProcess): Promise<void> {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const signal = (name: NodeJS.Signals) => {
    try {
      process.kill(-(child.pid as number), name);
    } catch {
      // Already gone.
    }
  };
  signal('SIGTERM');
  const quit = await Promise.race([
    exited.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 5_000)),
  ]);
  if (!quit) signal('SIGKILL');
}

async function startHostedApp(backendUrl: string): Promise<{ stop: () => Promise<void> }> {
  if (await answers(APP)) {
    throw new Error(
      `${APP} already answers; this bench needs its own hosted-targeted Next server.`,
    );
  }
  const child: ChildProcess = spawn('bun', ['run', 'dev'], {
    cwd: FRONTEND_DIR,
    detached: true,
    env: {
      ...process.env,
      PORT: String(APP_PORT),
      NEXT_DIST_DIR: '.next/ds-upload-e2e',
      NEXT_PUBLIC_API_URL: backendUrl,
      API_URL: backendUrl,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tail: string[] = [];
  const capture = (chunk: Buffer) => {
    tail.push(chunk.toString());
    if (tail.length > 30) tail.shift();
  };
  child.stdout?.on('data', capture);
  child.stderr?.on('data', capture);
  const stop = () => killGroup(child);
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    if (await answers(`${APP}/login`)) return { stop };
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  await stop();
  throw new Error(`hosted Next app never came up on ${APP}\n${tail.join('')}`);
}

/* -- the run ------------------------------------------------------------------------- */

const NAV = { timeout: 180_000, waitUntil: 'domcontentloaded' as const };

let backend: LocalBackend | null = null;
let app: { stop: () => Promise<void> } | null = null;
let reachedTheEnd = false;
const foldersBefore = new Set<string>();

test.beforeAll(async () => {
  test.setTimeout(900_000);
  // A Backend on hosted from a laptop must not act on prod's queues or scheduled posts.
  Object.assign(process.env, {
    MCP_JOB_WORKER_ENABLED: 'false',
    BRAND_REPORT_JOB_WORKER_ENABLED: 'false',
    ORGANIC_JOB_WORKER_ENABLED: 'false',
    ORGANIC_SCHEDULED_PUBLISH_INTERVAL_MS: '2147483647',
    ORGANIC_REALIZE_DRIVER_INTERVAL_MS: '2147483647',
    COMPETITOR_AD_SPY_SYNC_KICKOFF_MS: '2147483647',
    COMPETITOR_AD_SPY_SYNC_INTERVAL_MS: '2147483647',
  });
  for (const name of await designSystemFolders()) foldersBefore.add(name);
  backend = await startLocalBackend({
    port: BACKEND_PORT,
    browserOrigin: APP,
    label: BENCH,
    supabase: 'hosted',
    readyTimeoutMs: 600_000,
  });
  app = await startHostedApp(backend.url);
});

test.afterAll(async () => {
  const leftover = [...(await designSystemFolders())].filter((name) => !foldersBefore.has(name));
  for (const folder of leftover) {
    const { data } = await db.storage
      .from('brand-docs')
      .list(`${BENCH_BRAND}/design-systems/${folder}`);
    const paths = (data ?? []).map(
      (item) => `${BENCH_BRAND}/design-systems/${folder}/${item.name}`,
    );
    if (paths.length > 0) await db.storage.from('brand-docs').remove(paths);
  }
  if (leftover.length > 0) notes.push(`residue: removed ${leftover.length} run-owned folder(s)`);
  if (residue.userId) {
    await brandProfiles()
      .from('permissions')
      .delete()
      .eq('brand_profile_id', BENCH_BRAND)
      .eq('user_id', residue.userId);
    await brandProfiles().from('user_onboarding_states').delete().eq('user_id', residue.userId);
    await brandProfiles().from('user_brand_preferences').delete().eq('user_id', residue.userId);
  }
  if (residue.inviteId) await brandProfiles().from('invites').delete().eq('id', residue.inviteId);
  if (residue.userId) await db.auth.admin.deleteUser(residue.userId).catch(() => undefined);
  await app?.stop();
  await backend?.stop();
  if (!reachedTheEnd) grade('the run reached its last step', false, 'aborted — see the test error');
  printEnvelope();
});

test('design-system upload: an unredeemed invitee and a signed-out browser', async ({
  page,
  context,
}) => {
  test.setTimeout(900_000);
  page.setDefaultTimeout(60_000);
  currentPage = page;
  page.on('console', (message) => {
    if (message.type() === 'error' && notes.length < 40)
      notes.push(`console: ${message.text().slice(0, 200)}`);
  });
  // The ingest is a service-role write outside every RLS policy; see the header.
  await page.route('**/brand-knowledge/design-system/ingest', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'bench: ingest is not under test' }),
    }),
  );

  let inviteeId = '';
  const seeded = await step(
    'setup: an invitee with a pending invite and no membership',
    async () => {
      inviteeId = await seedInvitee();
      expect(await membershipRole(inviteeId)).toBeNull();
      return `${INVITEE_EMAIL} invited as admin to the bench brand, no permissions row`;
    },
  );
  expect(seeded).toBe(true);

  const session = await mintSessionBundleForEmail(INVITEE_EMAIL);
  await context.clearCookies();
  await context.addCookies(session.state.cookies);

  await step('control: before redemption the invitee upload is refused by RLS', async () => {
    const invitee = createClient(
      SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ?? '',
      {
        global: { headers: { Authorization: `Bearer ${session.accessToken}` } },
        auth: { persistSession: false },
      },
    );
    const { error } = await invitee.storage
      .from('brand-docs')
      .upload(`${BENCH_BRAND}/design-systems/${randomUUID()}/${FILE_NAME}`, PDF_BYTES, {
        contentType: 'application/pdf',
        upsert: false,
      });
    expect(error?.message).toMatch(/row-level security/i);
    return `refused: ${error?.message}`;
  });

  const redeemed = await step('opening /onboarding redeems the invite', async () => {
    await page.goto(`${APP}/onboarding`, NAV);
    await expect.poll(() => membershipRole(inviteeId), { timeout: 60_000 }).toBe('admin');
    return 'permissions row admin, written by brand_invite on the page load';
  });

  const card = page.locator('section', {
    has: page.getByRole('heading', { name: 'Design system' }),
  });
  // The user's gesture, not a raw setInputFiles: a file set before hydration lands on an
  // input with no React handler and nothing happens. The chooser only opens once hydrated.
  const chooseFile = () =>
    expect(async () => {
      const chooser = page.waitForEvent('filechooser', { timeout: 5_000 });
      await card.getByRole('button', { name: /(Upload a|Replace from) file/ }).click();
      await (await chooser).setFiles({
        name: FILE_NAME,
        mimeType: 'application/pdf',
        buffer: PDF_BYTES,
      });
    }).toPass({ timeout: 90_000 });

  if (redeemed) {
    await step('the Design system card uploads as the invitee', async () => {
      await page.goto(`${APP}/settings?section=brand-intelligence`, NAV);
      await expect(card).toBeVisible({ timeout: 180_000 });
      const writes: Array<{ method: string; status: number; body: string }> = [];
      page.on('response', (response) => {
        const url = response.url();
        if (!url.includes('/storage/v1/object/brand-docs')) return;
        const method = response.request().method();
        if (method !== 'POST' && method !== 'DELETE') return;
        void response
          .text()
          .catch(() => '')
          .then((body) =>
            writes.push({ method, status: response.status(), body: body.slice(0, 200) }),
          );
      });
      await chooseFile();
      try {
        // supabase-js remove() is DELETE /object/brand-docs with the paths in the body.
        await expect
          .poll(() => writes.map((write) => write.method).join(','), { timeout: 60_000 })
          .toBe('POST,DELETE');
      } catch {
        throw new Error(
          `Storage writes ${JSON.stringify(writes)}; card says: ${(await card.innerText()).slice(0, 300)}`,
        );
      }
      expect(
        writes.map((write) => write.status),
        JSON.stringify(writes),
      ).toEqual([200, 200]);
      await expect(card).not.toContainText(/row-level security/i);
      return 'Storage POST 200 as the invitee, orphan DELETE 200, no RLS text';
    });
  }

  await step('a signed-out browser is told so and never reaches Storage', async () => {
    if (!redeemed) throw new Error('needs the settings page from the previous step');
    let storageWrites = 0;
    page.on('request', (request) => {
      if (request.url().includes('/storage/v1/object/brand-docs/') && request.method() === 'POST')
        storageWrites += 1;
    });
    // What auth-js leaves behind after GoTrue revokes the refresh-token family.
    await context.clearCookies();
    await chooseFile();
    await expect(card).toContainText('You were signed out', { timeout: 30_000 });
    await expect(card).not.toContainText(/row-level security/i);
    expect(storageWrites).toBe(0);
    return '"You were signed out" shown, 0 Storage writes';
  });

  notes.push('stubbed: the Backend ingest after the upload (service-role, not RLS-guarded)');
  notes.push(
    'unexercised: the GoTrue refresh-token race itself; the bench reproduces its end state (no session)',
  );
  reachedTheEnd = true;
  expect(graded.filter((result) => result.grade === 'FAIL').map((result) => result.step)).toEqual(
    [],
  );
});

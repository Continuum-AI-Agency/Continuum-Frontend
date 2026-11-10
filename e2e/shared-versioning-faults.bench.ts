/** Isolated real Auth/API/PostgREST/Chrome faults. The proxy forwards actual results unchanged. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  statfsSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { templateVersionResultSchema } from '@continuum/contracts';
import { createChunks, stringToBase64URL } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { type BrowserContext, chromium, type Page } from 'playwright';
import { z } from 'zod';
import { Recorder } from '../../Continuum-Backend/scripts/_bench/recorder';

const rec = new Recorder('forge:shared-versioning-faults:bench');
const config = process.env.WORKING_COPY_QUAL_CONFIG;
assert(config, 'Set WORKING_COPY_QUAL_CONFIG to the private loopback fixture.');
const f = z
  .object({
    supabaseUrl: z.string().url(),
    apiUrl: z.string().url(),
    anonKey: z.string(),
    serviceRoleKey: z.string(),
    email: z.string(),
    password: z.string(),
    brandId: z.string().uuid(),
    templateId: z.string().uuid(),
    sourceAssetId: z.string().uuid(),
    sourceVersionId: z.string().uuid(),
    authSession: z.object({ access_token: z.string(), refresh_token: z.string() }),
    branches: z.array(z.object({ revisionId: z.string().uuid() })).min(1),
    layer: z.object({ compId: z.number(), layerId: z.number(), name: z.string() }),
  })
  .parse(JSON.parse(readFileSync(config, 'utf8')));
const appUrl = process.env.FAULT_APP_URL ?? 'http://127.0.0.1:5354';
for (const value of [f.supabaseUrl, f.apiUrl, appUrl])
  assert.equal(new URL(value).hostname, '127.0.0.1');
const stage = path.resolve(
  process.env.WORKING_COPY_QUAL_STAGE ?? path.dirname(path.dirname(config)),
);
const runId = randomUUID();
const run = path.join(stage, `faults-${runId}`);
const profile = path.join(run, 'private', 'chrome-profile');
mkdirSync(profile, { recursive: true, mode: 0o700 });
const free = () => Number(statfsSync(stage).bavail) * Number(statfsSync(stage).bsize);
assert(free() >= 50 * 1024 ** 3, '50 GiB admission floor.');
const member = createClient(f.supabaseUrl, f.anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const admin = createClient(f.supabaseUrl, f.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
let authorization = '';
let context: BrowserContext | undefined;
let page: Page | undefined;
let holdNext = false;
let releaseAck: (() => void) | undefined;
let held: { body: Record<string, unknown>; status: number; response: unknown } | undefined;
type DraftWire = { requestId: unknown; workingCopyId: unknown; bodySha256: string; status: number; receivedAt: string };
const wire: DraftWire[] = [];
let browserOffline = false;
const observations: Record<string, unknown> = { runId, profile, crashes: [] };
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const sourceText = readFileSync(import.meta.path, 'utf8');
observations.sourceSha256 = sha(sourceText);
writeFileSync(path.join(run, 'bench-source.ts'), sourceText, { flag: 'wx' });
const stagedBytes = (directory: string): number =>
  readdirSync(directory, { withFileTypes: true }).reduce((sum, entry) => {
    if (entry.isSymbolicLink()) return sum;
    try {
      return (
        sum +
        (entry.isDirectory()
          ? stagedBytes(path.join(directory, entry.name))
          : statSync(path.join(directory, entry.name)).size)
      );
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return sum;
      throw cause;
    }
  }, 0);
let stopped = false;
const monitor = setInterval(() => {
  if (
    free() >= 20 * 1024 ** 3 &&
    stagedBytes(stage) +
      stagedBytes(path.resolve(import.meta.dir, '../.next/working-copy-6bc9e4a1')) <
      2 * 1024 ** 3
  )
    return;
  stopped = true;
  void context?.close();
  const owned = JSON.parse(
    readFileSync(path.join(stage, 'fault-next-owned-process.json'), 'utf8'),
  ) as { pid: number; uid: number; startTicks: string; parentPid: number };
  try {
    const current = processInfo(owned.pid);
    if (
      current.uid === owned.uid &&
      current.startTicks === owned.startTicks &&
      current.parent === owned.parentPid
    )
      process.kill(owned.pid, 'SIGTERM');
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause;
  }
}, 5000);
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until<T>(
  read: () => Promise<T>,
  accept: (value: T) => boolean,
  label: string,
  ms = 45_000,
): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    assert(!stopped && free() >= 20 * 1024 ** 3, 'Storage/time stop floor.');
    const value = await read();
    if (accept(value)) return value;
    assert(Date.now() < deadline, `Timed out: ${label}`);
    await delay(200);
  }
}
async function api(
  action: string,
  body?: unknown,
  method = body === undefined ? 'GET' : 'POST',
  assetId = f.templateId,
) {
  const response = await fetch(`${f.apiUrl}/api/ai-studio/templates/${assetId}/${action}`, {
    method,
    headers: {
      authorization,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(60_000),
  });
  const value: unknown = await response.json();
  return { status: response.status, body: value };
}
const proxy = Bun.serve({
  hostname: '127.0.0.1',
  port: 5356,
  idleTimeout: 120,
  async fetch(request) {
    const url = new URL(request.url);
    const target = new URL(url.pathname + url.search, f.apiUrl);
    const bytes = ['GET', 'HEAD'].includes(request.method)
      ? undefined
      : await request.arrayBuffer();
    const response = await fetch(target, {
      method: request.method,
      headers: request.headers,
      body: bytes,
      signal: AbortSignal.timeout(60_000),
    });
    const data = await response.arrayBuffer();
    if (request.method === 'PUT' && url.pathname.endsWith('/authoring-draft')) {
      const body = JSON.parse(Buffer.from(bytes ?? new ArrayBuffer(0)).toString()) as Record<
        string,
        unknown
      >;
      wire.push({
        requestId: body.requestId,
        workingCopyId: body.workingCopyId,
        bodySha256: sha(JSON.stringify(body)),
        status: response.status,
        receivedAt: new Date().toISOString(),
      });
      if (holdNext) {
        holdNext = false;
        held = {
          body,
          status: response.status,
          response: JSON.parse(Buffer.from(data).toString()),
        };
        await new Promise<void>((resolve) => {
          releaseAck = resolve;
        });
      }
    }
    return new Response(data, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  },
});
async function launch() {
  const active = await chromium.launchPersistentContext(profile, {
    headless: true,
    viewport: { width: 1600, height: 1080 },
    ...(process.env.WORKING_COPY_QUAL_CHROME
      ? { executablePath: process.env.WORKING_COPY_QUAL_CHROME }
      : {}),
  });
  browserOffline = false;
  await active.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort('blockedbyclient');
    if (request.method() !== 'PUT' || !url.pathname.endsWith('/authoring-draft') || browserOffline)
      return route.continue();
    const forwarded = await route.fetch({ url: `http://127.0.0.1:5356${url.pathname}${url.search}`, timeout: 120_000 });
    await route.fulfill({ response: forwarded }).catch((cause: unknown) => {
      if (!active.pages().length) return;
      throw cause;
    });
  });
  return active;
}
function processInfo(pid: number) {
  const directory = `/proc/${pid}`;
  return {
    uid: statSync(directory).uid,
    args: readFileSync(`${directory}/cmdline`)
      .toString()
      .split(/[\0\s]+/)
      .filter(Boolean),
    executable: readlinkSync(`${directory}/exe`),
    parent: Number(readFileSync(`${directory}/status`, 'utf8').match(/^PPid:\s+(\d+)/m)?.[1]),
    startTicks: readFileSync(`${directory}/stat`, 'utf8').split(') ')[1]?.split(' ')[19],
  };
}
async function crashOwnedChrome(label: string) {
  const found: { pid: number; startTicks?: string }[] = [];
  for (const item of readdirSync('/proc').filter((name) => /^\d+$/.test(name))) {
    const pid = Number(item);
    try {
      if (statSync(`/proc/${pid}`).uid !== process.getuid?.()) continue;
      const info = processInfo(pid);
      if (
        info.uid !== process.getuid?.() ||
        !/\/(chrome|chrome-headless-shell)$/.test(info.executable) ||
        !info.args.includes(`--user-data-dir=${profile}`) ||
        info.args.some((arg) => arg.startsWith('--type='))
      )
        continue;
      let ancestor = info.parent;
      const seen = new Set<number>();
      while (ancestor > 1 && ancestor !== process.pid && !seen.has(ancestor)) {
        seen.add(ancestor);
        ancestor = processInfo(ancestor).parent;
      }
      assert.equal(ancestor, process.pid, 'Chrome must descend from this exact bench process.');
      found.push({ pid, startTicks: info.startTicks });
    } catch (cause) {
      if (
        !['ENOENT', 'ESRCH', 'EACCES', 'EPERM'].includes(
          (cause as NodeJS.ErrnoException).code ?? '',
        )
      )
        throw cause;
    }
  }
  assert.equal(found.length, 1, 'Identify exactly one owned Chrome main PID.');
  const owned = found[0]!;
  assert.equal(
    processInfo(owned.pid).startTicks,
    owned.startTicks,
    'PID identity remained unchanged.',
  );
  process.kill(owned.pid, 'SIGKILL');
  (observations.crashes as object[]).push({
    label,
    ...owned,
    profile,
    uid: process.getuid?.(),
    signal: 'SIGKILL',
    at: new Date().toISOString(),
  });
  await until(
    async () => {
      try {
        return processInfo(owned.pid).args.length === 0;
      } catch {
        return true;
      }
    },
    Boolean,
    'owned Chrome main exited',
  );
  context = undefined;
  page = undefined;
}
async function openBranch(branch: { variantId: string; revisionId: string }) {
  assert(page);
  const picker = page.getByLabel('Inspect template variant', { exact: true });
  await picker.waitFor({ timeout: 120_000 });
  const layers = page.getByRole('tab', { name: 'Edit layers', exact: true });
  const marker = page.locator(
    `[data-working-copy-id][data-base-revision-id="${branch.revisionId}"]:visible`,
  );
  const list = page.getByRole('list', { name: 'Layers', exact: true });
  let previous = '';
  const workingCopyId = await until(async () => {
    const selected = await picker.inputValue();
    const selectedTab = await layers.getAttribute('aria-selected');
    const visible = await marker.isVisible();
    const state = JSON.stringify({ selected, selectedTab, visible, layersVisible: await list.isVisible() });
    if (state !== previous) {
      ((observations.branchSelectionTransitions ??= []) as object[]).push({ state: JSON.parse(state), at: new Date().toISOString() });
      previous = state;
    }
    if (selected !== branch.variantId) { await picker.selectOption(branch.variantId); return null; }
    if (selectedTab !== 'true') { await layers.click(); return null; }
    return visible && await list.isVisible() ? marker.getAttribute('data-working-copy-id') : null;
  }, (value) => !!value, 'exact variant, editor tab, base, working copy and layer inventory settled together', 120_000);
  assert(workingCopyId);
  await list
    .getByRole('button', { name: new RegExp(f.layer.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })
    .first()
    .click();
  const field = page.getByLabel('Position X', { exact: true }).first();
  await until(() => field.isEnabled(), Boolean, 'Position X admitted');
  return { workingCopyId, field };
}
async function localPending(workingCopyId: string, x: number) {
  assert(page);
  await page.waitForFunction(
    ({ id, x }) =>
      new Promise<boolean>((resolve, reject) => {
        const opening = indexedDB.open('continuum-forge-private-drafts');
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const db = opening.result;
          const q = db.transaction('drafts', 'readonly').objectStore('drafts').getAll();
          q.onsuccess = () =>
            resolve(
              q.result.some(
                (row: {
                  scope?: { workingCopyId?: string };
                  commands?: { edit?: { x?: number } }[];
                }) =>
                  row.scope?.workingCopyId === id &&
                  row.commands?.some((command) => command.edit?.x === x),
              ),
            );
          q.onerror = () => reject(q.error);
          if (q.transaction) q.transaction.oncomplete = () => db.close();
        };
      }),
    { id: workingCopyId, x },
    { timeout: 30_000 },
  );
}
type JournalSnapshot = {
  key: string;
  draftIntent?: { requestId?: string; workingCopyId?: string; commands?: unknown[] };
  acknowledged?: string[];
};
async function localJournals(workingCopyId: string): Promise<JournalSnapshot[]> {
  assert(page);
  return page.evaluate((id) => new Promise<JournalSnapshot[]>((resolve, reject) => {
    const opening = indexedDB.open('continuum-forge-private-drafts');
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const tx = db.transaction('drafts', 'readonly');
      const request = tx.objectStore('drafts').openCursor();
      const rows: JournalSnapshot[] = [];
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const key = String(cursor.key);
        if (key.startsWith('operation-history:') && key.endsWith(`:working-copy:${id}`))
          rows.push({ ...cursor.value, key });
        cursor.continue();
      };
      tx.oncomplete = () => { db.close(); resolve(rows); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }), workingCopyId);
}
async function draft(workingCopyId: string) {
  const result = await admin
    .schema('media')
    .from('template_authoring_drafts')
    .select('revision,commands')
    .eq('working_copy_id', workingCopyId)
    .maybeSingle();
  assert.ifError(result.error);
  return result.data as { revision: number; commands: { edit?: { x?: number } }[] } | null;
}
async function captureCount(workingCopyId: string) {
  const result = await admin
    .schema('media')
    .from('template_authoring_draft_attempts')
    .select('request_id')
    .eq('authoring_working_copy_id', workingCopyId);
  assert.ifError(result.error);
  return result.data?.length ?? 0;
}
try {
  const signed = await member.auth.setSession(f.authSession);
  assert.ifError(signed.error);
  const session = signed.data.session;
  assert(session);
  authorization = `Bearer ${session.access_token}`;
  assert.equal((await member.auth.getUser(session.access_token)).data.user?.id, session.user.id);
  const claims = JSON.parse(
    Buffer.from(session.access_token.split('.')[1]!, 'base64url').toString(),
  ) as { session_id: string };
  const pinned = await member.schema('brand_profiles').from('user_session_brands').upsert(
    {
      user_id: session.user.id,
      session_id: claims.session_id,
      active_brand_id: f.brandId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,session_id' },
  );
  assert.ifError(pinned.error);
  rec.record('Genuine GoTrue identity and authenticated active brand', 'PASS');
  await until(
    () =>
      fetch(`${appUrl}/login`)
        .then((r) => r.status)
        .catch(() => 0),
    (s) => s > 0 && s < 500,
    'already owned Next app',
    180_000,
  );
  const created = await api('branches', {
    brandId: f.brandId,
    parentRevisionId: f.branches[0]!.revisionId,
    name: `Fault crash ${runId.slice(0, 8)}`,
    idempotencyKey: `fault:${runId}:branch`,
  });
  assert.equal(created.status, 200);
  const branch = templateVersionResultSchema.parse(created.body).revision;
  context = await launch();
  await context.addCookies(
    createChunks('sb-auth', `base64-${stringToBase64URL(JSON.stringify(session))}`).map(
      (cookie) => ({
        ...cookie,
        domain: '127.0.0.1',
        path: '/',
        secure: false,
        httpOnly: false,
        sameSite: 'Lax' as const,
        expires: Math.floor(Date.now() / 1000) + 3600,
      }),
    ),
  );
  page = await context.newPage();
  await page.goto(`${appUrl}/forge?template=${f.sourceAssetId}`, {
    waitUntil: 'domcontentloaded',
    timeout: 180_000,
  });
  await openBranch({ variantId: branch.variantId, revisionId: branch.id });
  // Establish a previously authenticated durable profile before the fault boundary. No
  // authentication is injected after either SIGKILL or after any working edit is captured.
  await context.close();
  context = await launch();
  page = await context.newPage();
  await page.goto(`${appUrl}/forge?template=${f.sourceAssetId}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  rec.record(
    'Previously authenticated profile survives baseline reopen before fault injection',
    'PASS',
  );
  const first = await openBranch({ variantId: branch.variantId, revisionId: branch.id });
  const baseline = Number((await first.field.inputValue()).replaceAll(',', ''));
  assert(Number.isFinite(baseline));
  const offlineX = Math.round((baseline + 11.75) * 100) / 100;
  browserOffline = true;
  await context.setOffline(true);
  await first.field.fill(String(offlineX));
  await first.field.press('Tab');
  await localPending(first.workingCopyId, offlineX);
  assert.equal(await captureCount(first.workingCopyId), 0);
  await crashOwnedChrome('offline intent persisted before send');
  context = await launch();
  page = await context.newPage();
  await page.goto(`${appUrl}/forge?template=${f.sourceAssetId}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  const reopened = await openBranch({ variantId: branch.variantId, revisionId: branch.id });
  assert.equal(reopened.workingCopyId, first.workingCopyId);
  await until(
    () => draft(first.workingCopyId),
    (d) => !!d && d.commands.some((c) => c.edit?.x === offlineX),
    'SIGKILL offline exact intent replay',
  );
  assert.equal(await captureCount(first.workingCopyId), 1);
  rec.record(
    'SIGKILL after offline IndexedDB capture restores exact intent once in the same owned working copy',
    'PASS',
  );
  const acceptedX = Math.round((offlineX + 7.25) * 100) / 100;
  holdNext = true;
  await reopened.field.fill(String(acceptedX));
  await reopened.field.press('Tab');
  await localPending(first.workingCopyId, acceptedX);
  await until(
    async () => held,
    (value) => !!value,
    'actual authenticated PUT accepted before held acknowledgement',
  );
  assert(held);
  assert.equal(held.status, 200);
  const frozen = held;
  const accepted = await draft(first.workingCopyId);
  assert(accepted);
  assert(accepted.commands.some((c) => c.edit?.x === acceptedX));
  const beforeAckCrash = await localJournals(first.workingCopyId);
  assert(beforeAckCrash.some((row) => row.draftIntent?.requestId === frozen.body.requestId));
  observations.beforeAckCrashJournals = beforeAckCrash;
  const replayBoundary = wire.length;
  await crashOwnedChrome('real Backend accepted PUT, acknowledgement held by transparent proxy');
  releaseAck?.();
  context = await launch();
  page = await context.newPage();
  await page.goto(`${appUrl}/forge?template=${f.sourceAssetId}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  const acknowledged = await openBranch({ variantId: branch.variantId, revisionId: branch.id });
  assert.equal(acknowledged.workingCopyId, first.workingCopyId);
  await until(
    () => acknowledged.field.inputValue(),
    (value) => Number(value.replaceAll(',', '')) === acceptedX,
    'accepted exact intent survives acknowledgement crash',
  );
  const reconciled = await until(
    () => localJournals(first.workingCopyId),
    (rows) => rows.length > 0 && rows.every((row) => !row.draftIntent),
    'browser clears the exact accepted uncertain intent after automatic recovery',
  );
  observations.afterAckCrashJournals = reconciled;
  const automaticReplays = wire.slice(replayBoundary).filter((item) =>
    item.requestId === frozen.body.requestId && item.bodySha256 === sha(JSON.stringify(frozen.body)) && item.status === 200);
  observations.automaticRecovery = automaticReplays.length
    ? { mode: 'browser_exact_request_replay', count: automaticReplays.length }
    : { mode: 'browser_hydration_reconciliation', clearedExactIntent: true };
  assert.deepEqual(await draft(first.workingCopyId), accepted);
  assert.equal(await captureCount(first.workingCopyId), 2);
  rec.record('SIGKILL after accepted PUT automatically reconciles and clears the persisted uncertain intent without duplicate capture', 'PASS');
  const replay = await api('authoring-draft', frozen.body, 'PUT', f.sourceAssetId);
  assert.equal(replay.status, 200);
  assert.deepEqual(
    (replay.body as { draft: unknown }).draft,
    (frozen.response as { draft: unknown }).draft,
  );
  assert.deepEqual(await draft(first.workingCopyId), accepted);
  assert.equal(await captureCount(first.workingCopyId), 2);
  observations.workingCopyId = first.workingCopyId;
  observations.heldRequestId = frozen.body.requestId;
  observations.acceptedRevision = accepted.revision;
  rec.record(
    'Separate exact API replay returns the sealed response without duplicate capture or draft revision',
    'PASS',
  );

} catch (cause) {
  rec.record(
    'Authenticated crash fault qualification',
    'FAIL',
    cause instanceof Error ? cause.message : String(cause),
  );
  if (page) {
    const lastWorkingCopyId = held?.body.workingCopyId;
    if (typeof lastWorkingCopyId === 'string')
      observations.failureJournals = await localJournals(lastWorkingCopyId).catch(() => null);
  }
  if (page)
    await page
      .locator('body')
      .innerText()
      .then((value) =>
        writeFileSync(path.join(run, 'private', 'failure-dom.txt'), value.slice(0, 30000), {
          mode: 0o600,
        }),
      )
      .catch(() => undefined);
} finally {
  clearInterval(monitor);
  releaseAck?.();
  await context?.close().catch(() => undefined);
  proxy.stop(true);
  writeFileSync(
    path.join(run, 'fault-observed.json'),
    `${JSON.stringify({ ...observations, wire }, null, 2)}\n`,
  );
  rec.note(
    'Actual local Auth/API/Storage/PostgREST/Chrome only. Native materialization, production renders and hosted deployment remain unrun.',
  );
  console.log(JSON.stringify({ artifactPrefix: run }));
  rec.finish({ json: true });
}

/** Real local Next app, GoTrue, API, Postgres and IndexedDB; no fixture responses or auth bypass. */
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statfsSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { templateVersionDiffResponseSchema, templateVersionHistoryResponseSchema, templateVersionResultSchema, type TemplateOperation } from '@continuum/contracts';
import { createChunks, stringToBase64URL } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { chromium, type BrowserContext, type Locator, type Page } from 'playwright';
import { z } from 'zod';
import { Recorder } from '../../Continuum-Backend/scripts/_bench/recorder';

const rec = new Recorder('forge:shared-versioning-working-copies:bench');
const configPath = process.env.WORKING_COPY_QUAL_CONFIG;
assert(configPath, 'Set WORKING_COPY_QUAL_CONFIG to the private isolated-stack fixture receipt.');
const fixture = z.object({
  supabaseUrl: z.string().url(), anonKey: z.string(), serviceRoleKey: z.string(),
  email: z.string().email(), password: z.string(), brandId: z.string().uuid(),
  templateId: z.string().uuid(), sourceAssetId: z.string().uuid(), sourceVersionId: z.string().uuid(),
  sourceChecksum: z.string(), apiUrl: z.string().url(),
  authSession: z.object({ access_token: z.string(), refresh_token: z.string() }).optional(),
  layer: z.object({ compId: z.number(), layerId: z.number(), name: z.string() }),
  branches: z.array(z.object({ variantId: z.string().uuid(), revisionId: z.string().uuid(), name: z.string() })).min(2),
}).parse(JSON.parse(readFileSync(configPath, 'utf8')));
for (const address of [fixture.supabaseUrl, fixture.apiUrl])
  assert.equal(new URL(address).hostname, '127.0.0.1', 'This bench accepts only its isolated loopback services.');
const stage = path.resolve(process.env.WORKING_COPY_QUAL_STAGE ?? path.dirname(path.dirname(configPath)));
const privateDir = path.join(stage, 'private');
const appPort = Number(process.env.WORKING_COPY_QUAL_APP_PORT ?? 5354);
const appUrl = `http://127.0.0.1:${appPort}`;
const profile = path.join(privateDir, 'working-copy-browser');
const frontend = path.resolve(import.meta.dir, '..');
const cache = path.join(frontend, '.next/working-copy-6bc9e4a1');
mkdirSync(privateDir, { recursive: true, mode: 0o700 });
mkdirSync(cache, { recursive: true });
const benchTsconfig = path.join(frontend, '.next/working-copy-bench-tsconfig.json');
if (!existsSync(benchTsconfig)) writeFileSync(benchTsconfig, `${JSON.stringify({
  extends: '../tsconfig.json', compilerOptions: { tsBuildInfoFile: path.join(cache, 'bench.tsbuildinfo') },
}, null, 2)}\n`);
assert(Number(statfsSync(stage).bavail) * Number(statfsSync(stage).bsize) >= 50 * 1024 ** 3,
  '50 GiB admission floor for the real Next app.');
const admin = createClient(fixture.supabaseUrl, fixture.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const member = createClient(fixture.supabaseUrl, fixture.anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
let next: ChildProcess | undefined;
let context: BrowserContext | undefined;
let page: Page | undefined;
let authorization = '';
let stopped = false;
const unexpectedHosts = new Set<string>();
const observed = { workingCopies: [] as string[], restarted: false, offlineEditRecovered: false,
  valueTransitions: [] as Array<{ action: string; before: number; after: number }>,
  failedTransition: null as { action: string; before: number; expected: number; actual: number } | null,
  historyTraversals: [] as Array<{ pages: number; events: number }>,
  retainedOperations: [] as TemplateOperation[] };
const describe = (cause: unknown) => cause instanceof Error ? cause.message : String(cause);
const numeric = async (field: Locator) => Number((await field.inputValue()).replaceAll(',', ''));
const hundredth = (value: number) => Math.round(value * 100) / 100;
const stagedBytes = (directory: string): number => {
  try {
    return readdirSync(directory, { withFileTypes: true }).reduce((sum, entry) => sum +
      (entry.isSymbolicLink() ? 0 : entry.isDirectory() ? stagedBytes(path.join(directory, entry.name)) : (() => {
        try { return statSync(path.join(directory, entry.name)).size; }
        catch (cause) { if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return 0; throw cause; }
      })()), 0);
  } catch (cause) { if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return 0; throw cause; }
};

async function until<T>(read: () => Promise<T>, accept: (value: T) => boolean, label: string, ms = 60_000): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    assert(!stopped, 'Owned application stopped at its storage/time boundary.');
    const value = await read();
    if (accept(value)) return value;
    assert(Date.now() < deadline, `Timed out: ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
async function api(action: string, body?: unknown) {
  const response = await fetch(`${fixture.apiUrl}/api/ai-studio/templates/${fixture.templateId}/${action}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(60_000),
  });
  return { status: response.status, body: await response.json() as unknown };
}
async function familyHistory(limit = '500') {
  const events: TemplateOperation[] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  let pages = 0;
  do {
    assert(++pages <= 100, 'Family history exceeded the bounded 50,000-event traversal.');
    const query = new URLSearchParams({ brandId: fixture.brandId, limit, ...(cursor ? { cursor } : {}) });
    const history = await api(`history?${query}`);
    assert.equal(history.status, 200);
    const result = templateVersionHistoryResponseSchema.parse(history.body);
    events.push(...result.items);
    cursor = result.nextCursor ?? undefined;
    if (cursor) {
      assert(!cursors.has(cursor), 'History returned a repeated opaque cursor.');
      cursors.add(cursor);
    }
  } while (cursor);
  assert.equal(new Set(events.map((event) => event.id)).size, events.length, 'History pages must not duplicate events.');
  observed.historyTraversals.push({ pages, events: events.length });
  return events;
}
async function observeTransition(field: Locator, action: string, expected: number, perform: () => Promise<void>) {
  const before = await numeric(field);
  await perform();
  let after: number;
  try {
    after = await until(() => numeric(field), (value) => value === expected, `observed ${action} Position X transition`);
  } catch (cause) {
    observed.failedTransition = { action, before, expected, actual: await numeric(field) };
    throw cause;
  }
  assert.notEqual(before, after, `${action} must change the actual editor value.`);
  observed.valueTransitions.push({ action, before, after });
}
async function sourcePins() {
  const [asset, source] = await Promise.all([
    admin.schema('media').from('assets').select('head_version_id,origin_ref').eq('id', fixture.sourceAssetId).single(),
    admin.schema('media').from('template_sources').select('version_id').eq('asset_id', fixture.sourceAssetId).single(),
  ]);
  assert.ifError(asset.error); assert.ifError(source.error);
  return { asset: asset.data, source: source.data };
}
async function launchBrowser() {
  const active = await chromium.launchPersistentContext(profile, { headless: true,
    viewport: { width: 1600, height: 1080 }, locale: 'en-US', ...(process.env.WORKING_COPY_QUAL_CHROME
      ? { executablePath: process.env.WORKING_COPY_QUAL_CHROME } : {}) });
  // Reject off-stack requests; no route supplies a synthetic API response.
  await active.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (['127.0.0.1', 'localhost'].includes(url.hostname)) return route.continue();
    unexpectedHosts.add(url.hostname);
    return route.abort('blockedbyclient');
  });
  return active;
}
async function openBranch(index: number) {
  assert(page);
  const picker = page.getByLabel('Inspect template variant', { exact: true });
  await picker.waitFor({ timeout: 120_000 });
  await picker.selectOption(fixture.branches[index]!.variantId);
  await until(() => picker.inputValue(), (value) => value === fixture.branches[index]!.variantId,
    'controlled variant selection settled');
  const layers = page.getByRole('tab', { name: 'Edit layers', exact: true });
  await layers.click();
  await until(() => layers.getAttribute('aria-selected'), (value) => value === 'true', 'new revision editor tab selected');
  const marker = page.locator(`[data-working-copy-id][data-base-revision-id="${fixture.branches[index]!.revisionId}"]:visible`);
  await marker.waitFor({ timeout: 120_000 });
  const workingCopyId = await marker.getAttribute('data-working-copy-id');
  assert(workingCopyId);
  assert.equal(await marker.getAttribute('data-base-revision-id'), fixture.branches[index]!.revisionId);
  const list = page.getByRole('list', { name: 'Layers', exact: true });
  await list.waitFor({ timeout: 120_000 });
  await list.getByRole('button', { name: new RegExp(fixture.layer.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first().click();
  const field = page.getByLabel('Position X', { exact: true }).first();
  await field.waitFor();
  await until(() => field.isEnabled(), (enabled) => enabled, 'selected property admitted after private draft loading');
  return { workingCopyId, field };
}
async function serverDraftHas(workingCopyId: string, value: number) {
  return until(async () => {
    const draft = await admin.schema('media').from('template_authoring_drafts')
      .select('commands,revision').eq('working_copy_id', workingCopyId).maybeSingle();
    assert.ifError(draft.error);
    return draft.data;
  }, (draft) => !!draft && JSON.stringify(draft.commands).includes(String(value)), 'actual scoped draft persisted');
}
async function localDraftHas(workingCopyId: string, value: number) {
  assert(page);
  await page.waitForFunction(({ workingCopyId, value }) => new Promise<boolean>((resolve, reject) => {
    const opening = indexedDB.open('continuum-forge-private-drafts');
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const transaction = db.transaction('drafts', 'readonly');
      const request = transaction.objectStore('drafts').getAll();
      request.onsuccess = () => resolve(request.result.some((row: { scope?: { workingCopyId?: string }; commands?: unknown }) =>
        row.scope?.workingCopyId === workingCopyId && JSON.stringify(row.commands).includes(String(value))));
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => db.close();
    };
  }), { workingCopyId, value }, { timeout: 30_000 });
}

const monitor = setInterval(() => {
  const fs = statfsSync(stage);
  if (Number(fs.bavail) * Number(fs.bsize) < 20 * 1024 ** 3 || stagedBytes(stage) + stagedBytes(cache) > 2 * 1024 ** 3) {
    stopped = true;
    next?.kill('SIGTERM');
    void context?.close();
  }
}, 5000);
try {
  const signed = fixture.authSession
    ? await member.auth.setSession(fixture.authSession)
    : await member.auth.signInWithPassword({ email: fixture.email, password: fixture.password });
  assert.ifError(signed.error); assert(signed.data.session);
  const session = signed.data.session;
  authorization = `Bearer ${session.access_token}`;
  const claims = JSON.parse(Buffer.from(session.access_token.split('.')[1]!, 'base64url').toString()) as { session_id: string };
  const pin = await member.schema('brand_profiles').from('user_session_brands').upsert({
    user_id: session.user.id, session_id: claims.session_id, active_brand_id: fixture.brandId,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,session_id' });
  assert.ifError(pin.error);
  const identity = await member.auth.getUser(session.access_token);
  assert.ifError(identity.error); assert.equal(identity.data.user?.id, session.user.id);
  rec.record('Real GoTrue authentication and authenticated brand selection', 'PASS');
  const original = await sourcePins();
  const runId = randomUUID();
  const parentRevisionId = fixture.branches[0]!.revisionId;
  const branches: typeof fixture.branches = [];
  for (const name of ['A', 'B']) {
    const result = await api('branches', { brandId: fixture.brandId, parentRevisionId,
      name: `Browser ${name} ${runId.slice(0, 8)}`, idempotencyKey: `browser-branch:${runId}:${name}` });
    assert.equal(result.status, 200);
    const { revision } = templateVersionResultSchema.parse(result.body);
    assert.equal(revision.sourceAssetId, fixture.sourceAssetId);
    assert.equal(revision.sourceVersionId, fixture.sourceVersionId);
    branches.push({ variantId: revision.variantId, revisionId: revision.id, name: `Browser ${name} ${runId.slice(0, 8)}` });
  }
  fixture.branches = branches;
  rec.record('Authenticated branch creation preserves shared immutable source pins', 'PASS');
  const accessible = await api(`authoring-working-copies?brandId=${fixture.brandId}`);
  assert.equal(accessible.status, 200, 'The same-brand working-copy route must exist and admit its authenticated owner.');
  const denied = await api('authoring-working-copies?brandId=ffffffff-ffff-4fff-8fff-ffffffffffff');
  assert([403, 404].includes(denied.status), `Wrong-brand request must refuse, got ${denied.status}`);
  rec.record('Actual Backend refuses access to another brand', 'PASS');

  const log = await import('node:fs').then((fs) => fs.openSync(path.join(privateDir, 'working-copy-next.log'), 'a', 0o600));
  const nextExecutable = createRequire(import.meta.url).resolve('next/dist/bin/next');
  next = spawn('node', [nextExecutable, 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(appPort)], {
    cwd: frontend, stdio: ['ignore', log, log], env: { ...process.env, NODE_ENV: 'development',
      NEXT_TELEMETRY_DISABLED: '1', NEXT_DIST_DIR: '.next/working-copy-6bc9e4a1',
      NEXT_TSCONFIG_PATH: '.next/working-copy-bench-tsconfig.json',
      NEXT_PUBLIC_SUPABASE_URL: fixture.supabaseUrl, SUPABASE_URL: fixture.supabaseUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: fixture.anonKey, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY: fixture.anonKey,
      SUPABASE_SERVICE_ROLE_KEY: fixture.serviceRoleKey, API_URL: fixture.apiUrl,
      NEXT_PUBLIC_API_URL: fixture.apiUrl, NEXT_PUBLIC_API_BASE_URL: fixture.apiUrl,
      NEXT_PUBLIC_POSTHOG_KEY: '', NEXT_PUBLIC_POSTHOG_HOST: '', NEXT_PUBLIC_GA_ID: '',
    },
  });
  await until(async () => {
    assert(next?.exitCode === null, 'The owned Next process exited before becoming ready; inspect its private log.');
    return fetch(`${appUrl}/login`, { signal: AbortSignal.timeout(5000) })
      .then((response) => response.status).catch(() => 0);
  }, (status) => status > 0 && status < 500, 'Next app readiness', 180_000);
  context = await launchBrowser();
  await context.addCookies(createChunks('sb-auth', `base64-${stringToBase64URL(JSON.stringify(session))}`).map((cookie) => ({
    ...cookie, domain: '127.0.0.1', path: '/', secure: false, httpOnly: false, sameSite: 'Lax' as const,
    expires: Math.floor(Date.now() / 1000) + 3600,
  })));
  page = await context.newPage();
  await page.goto(`${appUrl}/forge?template=${fixture.sourceAssetId}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  const first = await openBranch(0);
  observed.workingCopies = [first.workingCopyId];
  const baseX = await numeric(first.field);
  assert(Number.isFinite(baseX));
  const valueA = hundredth(baseX + 17.25);
  await observeTransition(first.field, 'Position X control', valueA, async () => {
    await first.field.fill(String(valueA)); await first.field.press('Tab');
  });
  const undo = page.getByRole('button', { name: 'Undo layer change', exact: true });
  const redo = page.getByRole('button', { name: 'Redo layer change', exact: true });
  await observeTransition(first.field, 'Undo button', baseX, () => undo.click());
  await observeTransition(first.field, 'Redo button', valueA, () => redo.click());
  // Focus a real button so browser-native input undo cannot impersonate the editor shortcut.
  await undo.focus();
  await observeTransition(first.field, 'Control+Z shortcut', baseX, () => page!.keyboard.press('Control+z'));
  await redo.focus();
  await observeTransition(first.field, 'Control+Shift+Z shortcut', valueA, () => page!.keyboard.press('Control+Shift+z'));
  rec.record('Actual Position X control, Undo/Redo buttons and Control+Z/Control+Shift+Z change the observed editor value', 'PASS');
  const second = await openBranch(1);
  observed.workingCopies.push(second.workingCopyId);
  assert.notEqual(second.workingCopyId, first.workingCopyId);
  assert.equal(await numeric(second.field), baseX, 'Branch B must not inherit A private edits.');
  const valueB = hundredth(baseX + 31.5);
  await second.field.fill(String(valueB)); await second.field.press('Tab');
  await Promise.all([serverDraftHas(first.workingCopyId, valueA), serverDraftHas(second.workingCopyId, valueB)]);
  const returned = await openBranch(0);
  assert.equal(returned.workingCopyId, first.workingCopyId);
  assert.equal(await numeric(returned.field), valueA);
  rec.record('Real editor parks and restores independent dirty variants sharing source bytes', 'PASS');

  await context.setOffline(true);
  const offlineValue = hundredth(valueA + 3.25);
  await returned.field.fill(String(offlineValue)); await returned.field.press('Tab');
  await localDraftHas(first.workingCopyId, offlineValue);
  await context.close(); context = undefined;
  context = await launchBrowser(); observed.restarted = true;
  page = await context.newPage();
  await page.goto(`${appUrl}/forge?template=${fixture.sourceAssetId}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  const recovered = await openBranch(0);
  assert.equal(recovered.workingCopyId, first.workingCopyId);
  await until(() => numeric(recovered.field), (value) => value === offlineValue, 'offline edit restored after browser restart');
  await serverDraftHas(first.workingCopyId, offlineValue);
  await serverDraftHas(second.workingCopyId, valueB);
  observed.offlineEditRecovered = true;
  rec.record('Offline edit survives persistent-browser restart and authenticated replay to the same working copy', 'PASS');
  const comparison = await api('diff', { brandId: fixture.brandId,
    fromRevisionId: fixture.branches[0]!.revisionId, toRevisionId: fixture.branches[1]!.revisionId });
  assert.equal(comparison.status, 200);
  templateVersionDiffResponseSchema.parse(comparison.body);
  rec.record('Shared comparison API accepts exact immutable revision identities', 'PASS');
  const restoration = { brandId: fixture.brandId, variantId: fixture.branches[0]!.variantId,
    restoreRevisionId: fixture.branches[0]!.revisionId, expectedHeadRevisionId: fixture.branches[0]!.revisionId,
    idempotencyKey: `browser-restoration:${first.workingCopyId}`, message: 'Qualify append-only restoration and parked draft base' };
  const restored = await api('reverts', restoration);
  assert.equal(restored.status, 200);
  const accepted = templateVersionResultSchema.parse(restored.body);
  assert.notEqual(accepted.revision.id, restoration.expectedHeadRevisionId);
  const replay = await api('reverts', restoration);
  assert.equal(replay.status, 200);
  assert.equal(templateVersionResultSchema.parse(replay.body).revision.id, accepted.revision.id);
  assert.equal((await api('reverts', { ...restoration, message: 'Different intent with the same key' })).status, 409);
  assert.equal((await api('reverts', { ...restoration, idempotencyKey: `${restoration.idempotencyKey}:stale` })).status, 409);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
  const retained = await openBranch(0);
  assert.equal(retained.workingCopyId, first.workingCopyId);
  assert.equal(await numeric(retained.field), offlineValue);
  rec.record('Actual restoration appends once, rejects changed replay/stale heads, and preserves dirty copy at its captured base', 'PASS');
  const events = await until(familyHistory, (events) =>
    [first.workingCopyId, second.workingCopyId].every((id) => events.some((event) => event.changes.authoringWorkingCopyId === id)) &&
    events.some((event) => event.changes.authoringWorkingCopyId === first.workingCopyId && event.origin?.shortcut === 'Control+Shift+Z'),
  'permanent authenticated operation delivery across opaque family-history pages');
  const actions = events.filter((event) => observed.workingCopies.includes(String(event.changes.authoringWorkingCopyId)));
  observed.retainedOperations = actions;
  const pagedEvents = await familyHistory('100');
  for (const event of actions) assert.deepEqual(pagedEvents.find((candidate) => candidate.id === event.id), event,
    'Opaque-cursor traversal must retain every observed operation and its revision associations.');
  assert(actions.every((event) => event.principalId === session.user.id));
  assert(actions.some((event) => event.affectedObjects.length > 0 && event.evidence === 'recorded'));
  const streams = new Map<string, TemplateOperation[]>();
  for (const event of actions) streams.set(event.workingCopyId, [...(streams.get(event.workingCopyId) ?? []), event]);
  for (const stream of streams.values()) for (let index = 1; index < stream.length; index++) {
    assert(stream[index]!.sequence > stream[index - 1]!.sequence, 'Retained sequence must increase within its own stream.');
    assert(stream[index]!.causedBy.includes(stream[index - 1]!.id), 'Retained stream must preserve its prior action link.');
  }
  const firstActions = actions.filter((event) => event.changes.authoringWorkingCopyId === first.workingCopyId);
  const edited = firstActions.find((event) => {
    const command = event.changes.command;
    return event.origin?.control === 'Position X' && command !== null && typeof command === 'object' &&
      'edit' in command && command.edit !== null && typeof command.edit === 'object' && 'x' in command.edit && command.edit.x === valueA;
  });
  assert(edited, 'Retained Position X action must contain the actual edited value.');
  assert.deepEqual(edited.origin, { tool: 'Forge inspector', control: 'Position X' });
  assert.deepEqual(edited.affectedObjects, [`aep:${fixture.layer.compId}:${fixture.layer.layerId}`]);
  const replayActions = [
    { command: 'forge_undo', origin: { tool: 'Forge web editor', button: 'Undo' } },
    { command: 'forge_redo', origin: { tool: 'Forge web editor', button: 'Redo' } },
    { command: 'forge_undo', origin: { tool: 'Forge web editor', shortcut: 'Control+Z' } },
    { command: 'forge_redo', origin: { tool: 'Forge web editor', shortcut: 'Control+Shift+Z' } },
  ].map((expected) => {
    const event = firstActions.find((candidate) => candidate.command === expected.command &&
      candidate.origin?.button === ('button' in expected.origin ? expected.origin.button : undefined) &&
      candidate.origin?.shortcut === ('shortcut' in expected.origin ? expected.origin.shortcut : undefined));
    assert(event, `Retained history must contain actual ${JSON.stringify(expected.origin)}.`);
    assert.deepEqual(event.origin, expected.origin);
    assert(event.causedBy.includes(edited.id), 'Undo/redo must retain its affected edit identity.');
    return event;
  });
  const selected = [edited, ...replayActions];
  for (const [index, event] of selected.entries()) {
    assert.equal(event.workingCopyId, edited.workingCopyId);
    assert.equal(event.baseRevisionId, fixture.branches[0]!.revisionId);
    assert.equal(event.channel, 'forge'); assert.equal(event.outcome, 'succeeded'); assert.equal(event.evidence, 'recorded');
    if (index > 0) assert(event.sequence > selected[index - 1]!.sequence);
  }
  assert.deepEqual(replayActions[0]!.changes.before, replayActions[1]!.changes.after);
  assert.deepEqual(replayActions[0]!.changes.after, replayActions[1]!.changes.before);
  assert.deepEqual(replayActions[0]!.changes.before, replayActions[2]!.changes.before);
  assert.deepEqual(replayActions[0]!.changes.after, replayActions[2]!.changes.after);
  assert.deepEqual(replayActions[1]!.changes.before, replayActions[3]!.changes.before);
  assert.deepEqual(replayActions[1]!.changes.after, replayActions[3]!.changes.after);
  rec.record('Authenticated retained history preserves exact control/button/shortcut origins, affected edit, causal links and increasing stream sequence after restart', 'PASS');
  assert.deepEqual(await sourcePins(), original);
  rec.record('Original source version and upload metadata remain unchanged', 'PASS');
} catch (cause) {
  rec.record('Authenticated working-copy lifecycle', 'FAIL', describe(cause));
  if (page) await page.locator('body').innerText().then((text) =>
    writeFileSync(path.join(privateDir, 'working-copy-failure-dom.txt'), text.slice(0, 30000), { mode: 0o600 })).catch(() => undefined);
} finally {
  clearInterval(monitor);
  await context?.close().catch(() => undefined);
  next?.kill('SIGTERM');
  if (next && next.exitCode === null && next.signalCode === null) {
    const owned = next;
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => { owned.kill('SIGKILL'); resolve(); }, 10_000);
      owned.once('exit', () => { clearTimeout(timeout); resolve(); });
    });
  }
  writeFileSync(path.join(stage, 'working-copy-browser-observed.json'), `${JSON.stringify({ ...observed,
    blockedExternalHosts: [...unexpectedHosts], gracefulPersistentBrowserRestart: observed.restarted,
    boundary: 'Real authenticated local editor/draft/restart checks; no native compile, render, release promotion or deployment.' }, null, 2)}\n`);
}
rec.note('Local application qualification only. Client origin labels are not authenticated identity; causal/per-stream order is not exact global execution order. No fabricated history append. Native compilation, release/render pins, external historical reconstruction and hosted rollout are outside this bench.');
rec.finish({ json: true });

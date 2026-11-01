/** Actual authenticated Forge GUI; externally owned services, no fixture responses or direct API writes. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, readlinkSync, statfsSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { type TemplateRevision, type TemplateRevisionVariant, templateRevisionVariantsResponseSchema,
  templateVersionResultSchema, templateVersionDiffResponseSchema, templateVersionMergePreviewSchema,
  templateVersionHistoryResponseSchema, templateReleaseListResponseSchema, templateReleaseResultSchema } from '@continuum/contracts';
import { createChunks, stringToBase64URL } from '@supabase/ssr';
import { createClient, type Session } from '@supabase/supabase-js';
import { chromium, type BrowserContext, type Locator, type Page } from 'playwright';
import { z } from 'zod';
import { Recorder } from '../../Continuum-Backend/scripts/_bench/recorder';

const rec = new Recorder('forge:shared-versioning-gui-lifecycle:bench');
const configPath = process.env.VERSIONING_GUI_CONFIG;
assert(configPath, 'Provide VERSIONING_GUI_CONFIG; this bench never starts services.');
const session = z.object({ access_token: z.string(), refresh_token: z.string() }).passthrough();
const config = z.object({ stage: z.string(), appUrl: z.string().url(), apiUrl: z.string().url(), supabaseUrl: z.string().url(), anonKey: z.string(),
  brandId: z.string().uuid(), authSession: session, authSessionB: session, stackReadyPath: z.string(),
  chromeExecutable: z.string().optional(), cachePath: z.string().optional(),
  families: z.array(z.object({ family: z.enum(['after_effects', 'hyperframes', 'blender']), templateId: z.string().uuid(),
    layer: z.object({ compId: z.number(), layerId: z.number(), name: z.string() }).optional(),
    textField: z.string().default('forge_tagline'), independentField: z.string().default('forge_scale'),
  })).min(1),
}).parse(JSON.parse(readFileSync(configPath, 'utf8')));
const stage = path.resolve(config.stage);
const declaration = z.object({ owner: z.literal('aule-forge-versioning'), prefix: z.string(), budgetBytes: z.number(),
  admissionBytes: z.number(), stopFreeBytes: z.number(), maxActualRenders: z.literal(0), maxBrowserContexts: z.literal(2) })
  .parse(JSON.parse(readFileSync(path.join(stage, 'run.json'), 'utf8')));
assert(declaration.prefix.startsWith('gs://continuum-production-477821-creative-benchmarks/aule-forge-versioning/'));
assert.equal(JSON.parse(readFileSync(config.stackReadyPath, 'utf8')).ready, true, 'The coordinator declares the real stack ready.');
for (const value of [config.appUrl, config.apiUrl, config.supabaseUrl]) assert.equal(new URL(value).hostname, '127.0.0.1');
const free = () => { const value = statfsSync(stage); return Number(value.bavail) * Number(value.bsize); };
assert(free() >= declaration.admissionBytes, '50 GiB admission floor.');
const runId = randomUUID(), run = path.join(stage, 'forge-native', `gui-${runId}`);
mkdirSync(path.join(run, 'private'), { recursive: true, mode: 0o700 });
const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
writeFileSync(path.join(run, 'bench-source.ts'), readFileSync(import.meta.path), { flag: 'wx' });
const observed: Record<string, unknown> = { runId, startedAt: new Date().toISOString(), sourceSha256: sha(readFileSync(import.meta.path)),
  calls: [], checkpoints: [], families: [], crashes: [], unrun: ['Rendering and callbacks', 'Hosted/deployed production', 'Human physical gesture authentication', 'Presentation shared-registry bridge'] };
const list = (name: string) => observed[name] as object[];
const sanitize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /token|authorization/i.test(key) ? '[redacted]' : sanitize(item)]));
  return typeof value === 'string' ? value.replace(/https?:\/\/[^\s"'<>]+/g, text => { try { const url = new URL(text); return `${url.origin}${url.pathname}`; } catch { return '[URL]'; } }) : value;
};
type Family = typeof config.families[number];
type Branch = { name: string; revision: TemplateRevision; variant: TemplateRevisionVariant };
type Actor = { token: string; principalId: string; label: string; session: Session };
let context: BrowserContext | undefined, secondContext: BrowserContext | undefined, page: Page | undefined, otherPage: Page | undefined;
let stopped = false, screenshots = 0;
const used = (directory: string): number => { try { return readdirSync(directory, { withFileTypes: true }).reduce((sum, item) => {
  if (item.isSymbolicLink()) return sum; const file = path.join(directory, item.name);
  try { return sum + (item.isDirectory() ? used(file) : statSync(file).size); } catch (cause) { if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return sum; throw cause; }
}, 0); } catch (cause) { if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return 0; throw cause; } };
const monitor = setInterval(() => { if (free() < declaration.stopFreeBytes || used(stage) > declaration.budgetBytes) {
  stopped = true; void context?.close(); void secondContext?.close();
} }, 2000);
const deadline = setTimeout(() => { stopped = true; void context?.close(); void secondContext?.close(); }, 24 * 60_000);
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => { stopped = true; void context?.close(); void secondContext?.close(); });
async function until<T>(read: () => Promise<T>, accept: (value: T) => boolean, label: string, timeout = 60_000) {
  const end = Date.now() + timeout;
  for (;;) { assert(!stopped, 'Owned GUI storage/time bound reached.'); const value = await read(); if (accept(value)) return value;
    assert(Date.now() < end, `Timed out: ${label}`); await new Promise(resolve => setTimeout(resolve, 150)); }
}
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
async function checkpoint(label: string, target = page) {
  assert(target && ++screenshots <= 48, 'Bounded GUI evidence.');
  const file = `${String(screenshots).padStart(2, '0')}-${label.replace(/[^a-z0-9-]/gi, '-').slice(0, 100)}`;
  await target.screenshot({ path: path.join(run, `${file}.png`), fullPage: false });
  const text = (await target.locator('body').innerText()).slice(0, 60_000);
  writeFileSync(path.join(run, `${file}.txt`), text, { flag: 'wx' });
  const state = await target.evaluate(() => {
    const visible = (node: Element) => !!node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden';
    return { workingCopies: [...document.querySelectorAll('[data-working-copy-id]')].map(node => ({
      id: node.getAttribute('data-working-copy-id'), baseRevisionId: node.getAttribute('data-base-revision-id'), visible: visible(node) })),
      tabs: [...document.querySelectorAll('[role=tab]')].map(node => ({ label: node.textContent, selected: node.getAttribute('aria-selected'), visible: visible(node) })),
      layerLists: [...document.querySelectorAll('aside[aria-label="Layer workspace"] ol')].map(node => ({ label: node.getAttribute('aria-label'), visible: visible(node) })),
      selectedLayerButtons: [...document.querySelectorAll('aside[aria-label="Layer workspace"] button[aria-pressed=true]')].map(node => ({ label: node.textContent, visible: visible(node) })) };
  });
  writeFileSync(path.join(run, `${file}.state.json`), JSON.stringify(state, null, 2), { flag: 'wx' });
  const members = [`${file}.png`, `${file}.txt`, `${file}.state.json`].map(name => { const bytes = readFileSync(path.join(run, name)); return { file: name, bytes: bytes.length, sha256: sha(bytes) }; });
  writeFileSync(path.join(run, `${file}.sealed.json`), JSON.stringify({ runId, label, members }), { flag: 'wx' });
  list('checkpoints').push({ label, screenshot: `${file}.png`, dom: `${file}.txt` });
}
async function read(actor: Actor, family: Family, action: string) {
  const response = await fetch(`${config.apiUrl}/api/ai-studio/templates/${family.templateId}/${action}`, {
    headers: { authorization: `Bearer ${actor.token}` }, redirect: 'error', signal: AbortSignal.timeout(60_000) });
  const value: unknown = await response.json(); assert(response.ok, `Read-only corroboration ${action}: HTTP${response.status}`); return value;
}
const catalog = (actor: Actor, family: Family) => read(actor, family, `revision-variants?brandId=${config.brandId}`)
  .then(value => templateRevisionVariantsResponseSchema.parse(value).items);
function attach(target: Page, actor: Actor) {
  target.on('response', response => {
    const url = new URL(response.url());
    if (url.origin !== new URL(config.apiUrl).origin || !url.pathname.includes('/templates/')) return;
    const request = response.request();
    if (request.method() === 'GET') return;
    list('calls').push({ actor: actor.label, principalId: actor.principalId, path: url.pathname,
      method: request.method(), status: response.status(), requestSha256: sha(request.postData() ?? ''), request: sanitize(request.postDataJSON()) });
  });
}
async function launch(profile: string, actor: Actor) {
  const active = await chromium.launchPersistentContext(profile, { headless: true, viewport: { width: 1600, height: 1080 }, locale: 'en-US',
    ...(config.chromeExecutable ? { executablePath: config.chromeExecutable } : {}) });
  await active.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['127.0.0.1', 'localhost'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol)
      ? route.continue() : route.abort('blockedbyclient');
  });
  await active.addCookies(createChunks('sb-auth', `base64-${stringToBase64URL(JSON.stringify(actor.session))}`).map(cookie => ({
    ...cookie, domain: '127.0.0.1', path: '/', secure: false, httpOnly: false, sameSite: 'Lax' as const, expires: Math.floor(Date.now() / 1000) + 3600,
  })));
  return active;
}
async function forceOwnChrome(profile: string) {
  const candidates: { pid: number; uid: number; startTicks: string }[] = [];
  for (const name of readdirSync('/proc').filter(value => /^\d+$/.test(value))) try {
    const pid = Number(name), directory = `/proc/${pid}`, args = readFileSync(`${directory}/cmdline`).toString().split('\0');
    if (statSync(directory).uid !== process.getuid?.() || !args.includes(`--user-data-dir=${profile}`)) continue;
    assert(/chrome|chromium/.test(path.basename(readlinkSync(`${directory}/exe`))));
    candidates.push({ pid, uid: statSync(directory).uid, startTicks: readFileSync(`${directory}/stat`, 'utf8').split(') ')[1]!.split(' ')[19]! });
  } catch (cause) { if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause; }
  assert.equal(candidates.length, 1, 'One exact owned persistent browser root.');
  const owned = candidates[0]!;
  assert.equal(readFileSync(`/proc/${owned.pid}/stat`, 'utf8').split(') ')[1]!.split(' ')[19], owned.startTicks);
  process.kill(owned.pid, 'SIGKILL'); list('crashes').push({ ...owned, profile, signal: 'SIGKILL', scope: 'Exact owned browser root only' });
  await until(async () => { try { statSync(`/proc/${owned.pid}`); return false; } catch { return true; } }, Boolean, 'owned browser exited', 15_000);
}
const panel = (target: Page) => target.locator('section[aria-label="Version control"]:visible');
async function open(family: Family, target: Page, revisionId?: string) {
  const url = family.family === 'hyperframes' ? `${config.appUrl}/forge/native/${family.templateId}?brandId=${config.brandId}${revisionId ? `&revisionId=${revisionId}` : ''}`
    : family.family === 'blender' ? `${config.appUrl}/forge/scene/${family.templateId}${revisionId ? `?revision=${revisionId}` : ''}`
      : `${config.appUrl}/forge?template=${family.templateId}`;
  await target.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await showPanel(family, target);
}
async function showPanel(family: Family, target: Page) {
  await until(async () => {
    if (family.family === 'after_effects') {
      const tab = target.getByRole('tab', { name: /^Variants/ });
      if (await tab.getAttribute('aria-selected') !== 'true') await tab.click();
    } else {
      const details = target.locator('details').filter({ has: target.locator('summary', { hasText: 'Variant control and releases' }) }).first();
      if ((await details.getAttribute('open')) === null) await details.locator('summary').click();
    }
    return panel(target).isVisible();
  }, Boolean, 'version controls on the settled revision panel', 120_000);
}
async function inspect(family: Family, target: Page, actor: Actor, revisionId: string) {
  await showPanel(family, target); const variants = await catalog(actor, family);
  const variant = variants.find(item => item.revisions.some(revision => revision.id === revisionId)); assert(variant);
  const revision = variant.revisions.find(value => value.id === revisionId)!;
  await panel(target).getByRole('navigation', { name: 'Template variants' }).getByRole('button', { name: new RegExp(`^${escaped(variant.original ? 'Original' : variant.name)}\\b`) }).click();
  await panel(target).getByRole('button', { name: 'Revisions', exact: true }).click();
  await panel(target).getByRole('button', { name: `Inspect revision ${revision.number}`, exact: true }).click();
  await until(() => panel(target).textContent(), text => !!text?.includes(revisionId.slice(0, 8)), 'exact revision inspection');
  return { variant, revision };
}
async function aeLayers(target: Page, revisionId: string, readOnly = false) {
  const tab = target.getByRole('tab', { name: 'Edit layers', exact: true });
  const notice = target.locator('p:visible').filter({ hasText: /^This revision is read-only\. Branch it in Variants before editing\.$/ }).first();
  const copy = target.locator(`[data-working-copy-id][data-base-revision-id="${revisionId}"]:visible`);
  const workspace = target.locator('section[aria-label="Template layer editor"]:visible aside[aria-label="Layer workspace"]:visible');
  // Opening a revision schedules a keyed React transition. A click on the outgoing panel
  // can be replaced by its incoming Variants panel; admit only the requested visible editor.
  await until(async () => {
    if (await tab.getAttribute('aria-selected') !== 'true') await tab.click();
    return await tab.getAttribute('aria-selected') === 'true' && (readOnly
      ? await notice.isVisible() : await copy.count() > 0 && await workspace.isVisible());
  }, Boolean, readOnly ? 'requested Original read-only layer panel after revision transition'
    : `requested exact ${revisionId} layer editor after revision transition`, 120_000);
}
async function editor(family: Family, target: Page, actor: Actor, revisionId: string) {
  await inspect(family, target, actor, revisionId);
  await panel(target).getByRole('button', { name: 'Open exact revision', exact: true }).click();
  if (family.family === 'after_effects') {
    await aeLayers(target, revisionId);
    assert(family.layer);
    const workspace = target.getByRole('complementary', { name: 'Layer workspace', exact: true });
    const selected = workspace.getByRole('button', { name: family.layer.name, exact: true });
    await selected.click();
    await until(() => selected.getAttribute('aria-pressed'), value => value === 'true', 'exact requested layer selection; drag handles are not selection');
  }
}
async function uiResponse(target: Page, suffix: string, action: () => Promise<void>, expected = 200) {
  const response = target.waitForResponse(value => new URL(value.url()).pathname.endsWith(suffix) && value.request().method() === 'POST', { timeout: 120_000 });
  const [, received] = await Promise.all([action(), response]); const body: unknown = await received.json();
  assert(received.status() === expected || expected === 200 && received.status() === 201, `Actual GUI action ${suffix}: HTTP${received.status()}`); return body;
}
async function branch(family: Family, target: Page, actor: Actor, base: string, suffix: string): Promise<Branch> {
  await inspect(family, target, actor, base); const name = `GUI ${family.family} ${suffix} ${runId.slice(0, 8)}`;
  await panel(target).getByLabel('New variant name', { exact: true }).fill(name);
  const result = templateVersionResultSchema.parse(await uiResponse(target, '/branches', () => panel(target).getByRole('button', { name: /^Branch from revision / }).click()));
  assert.equal(result.revision.parentRevisionId, base);
  const variants = await catalog(actor, family); const variant = variants.find(value => value.variantId === result.revision.variantId); assert(variant);
  await until(() => panel(target).textContent(), text => !!text?.includes(name), 'new branch appears in real tree');
  return { name, revision: result.revision, variant };
}
async function field(family: Family, target: Page, independent = false): Promise<Locator> {
  const control = family.family === 'hyperframes' ? target.getByLabel(independent ? 'Width' : 'Text 1', { exact: true })
    : family.family === 'blender' ? target.locator(`[data-field="${independent ? family.independentField : family.textField}"]`).locator('input,textarea').first()
      : target.getByLabel(independent ? 'Position Y' : 'Position X', { exact: true }).first();
  await control.waitFor(); await until(() => control.isEnabled(), Boolean, 'native/AE private editor enabled'); return control;
}
async function fill(family: Family, target: Page, value: string, independent = false) {
  const control = await field(family, target, independent); await control.fill(value); await control.press('Tab');
  await until(() => control.inputValue(), actual => actual === value, 'actual edited field value');
  const marker = target.locator('[data-working-copy-id][data-base-revision-id]:visible').first(); await marker.waitFor();
  const copyId = await marker.getAttribute('data-working-copy-id'); assert(copyId);
  await target.waitForFunction(({ id, value, family, independent, fieldId, layer }) => new Promise<boolean>((resolve, reject) => {
    const opening = indexedDB.open('continuum-forge-private-drafts'); opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => { const db = opening.result, tx = db.transaction('drafts', 'readonly'), request = tx.objectStore('drafts').getAll();
      request.onsuccess = () => resolve(request.result.some((row: { scope?: { workingCopyId?: string }; commands?: unknown;
        projection?: { workingCopyId: string; history: { present: { width?: number; texts?: { value: string }[]; values?: Record<string, unknown> } } } }) => {
        if (row.projection?.workingCopyId === id) {
          const present = row.projection.history.present;
          return family === 'hyperframes' ? independent ? present.width === Number(value) : present.texts?.[0]?.value === value
            : present.values?.[fieldId] === (independent ? Number(value) : value);
        }
        if (row.scope?.workingCopyId !== id || !Array.isArray(row.commands)) return false;
        const property = independent ? 'y' : 'x';
        const includes = (input: unknown): boolean => {
          if (!input || typeof input !== 'object') return false;
          const command = input as { type?: string; nodeId?: string; edit?: Record<string, unknown> };
          return !!layer && command.type === 'layer.edit' && command.nodeId === `aep:${layer.compId}:${layer.layerId}`
            && command.edit?.[property] === Number(value) || Object.values(input).some(includes);
        };
        return row.commands.some(includes);
      }));
      request.onerror = () => reject(request.error); tx.oncomplete = () => db.close(); };
  }), { id: copyId, value, family: family.family, independent, fieldId: independent ? family.independentField : family.textField,
    layer: family.layer ?? null }, { timeout: 30_000 });
  return copyId;
}
async function save(family: Family, target: Page, actor: Actor, branch: Branch) {
  const button = target.getByRole('button', { name: family.family === 'hyperframes' ? 'Save variant' : family.family === 'blender' ? 'Save native revision' : 'Review and publish revision', exact: true });
  await until(() => button.isEnabled(), Boolean, 'verified native revision save admitted', 120_000); await button.click();
  const variants = await until(() => catalog(actor, family), values => values.find(value => value.variantId === branch.variant.variantId)?.draftHeadRevisionId !== branch.revision.id,
    'GUI save appends a new branch revision', 120_000);
  const variant = variants.find(value => value.variantId === branch.variant.variantId)!;
  const revision = variant.revisions.find(value => value.id === variant.draftHeadRevisionId)!;
  assert.equal(revision.parentRevisionId, branch.revision.id);
  // A remote head precedes local acknowledgement and the editor's onSaved remount.
  // Wait for that actual incoming revision before selecting another branch.
  await until(async () => {
    await showPanel(family, target);
    return panel(target).locator(`span[title="${revision.id}"]:visible`).count().then(count => count > 0);
  }, Boolean, 'saved revision acknowledgement and incoming version panel', 120_000);
  await editor(family, target, actor, revision.id);
  await until(async () => await target.locator(`[data-working-copy-id][data-base-revision-id="${revision.id}"]:visible`).count() > 0
    && await button.isDisabled(), Boolean, 'exact acknowledged clean editor after save remount', 120_000);
  return { ...branch, variant, revision };
}
async function pick(target: Page, title: string, branch: Branch) {
  await panel(target).getByRole('combobox', { name: title, exact: true }).click();
  await target.getByRole('option', { name: `${branch.name} · Revision ${branch.revision.number}`, exact: true }).click();
}
async function merge(family: Family, target: Page, actor: Actor, ours: Branch, theirs: Branch, conflict: boolean) {
  await inspect(family, target, actor, ours.revision.id); await panel(target).getByRole('button', { name: 'Merge', exact: true }).click();
  await pick(target, 'Source variant head', theirs);
  const preview = templateVersionMergePreviewSchema.parse(await uiResponse(target, '/merges/preview', () => panel(target).getByRole('button', { name: 'Preview merge', exact: true }).click()));
  assert.equal(preview.conflicts.length > 0, conflict);
  const commit = panel(target).getByRole('button', { name: 'Commit reviewed merge', exact: true });
  if (conflict) {
    assert(await commit.isDisabled(), 'Conflicts block commit before a real explicit choice.');
    const choices = panel(target).getByRole('button', { name: new RegExp(`^(Take ${escaped(theirs.name)}|Use complete ${escaped(theirs.name)} state)$`) });
    for (let index = 0; index < await choices.count(); index++) await choices.nth(index).click();
  }
  const accepted = templateVersionResultSchema.parse(await uiResponse(target, '/merges', () => commit.click()));
  assert.equal(accepted.revision.parentRevisionId, ours.revision.id);
  const commits = await read(actor, family, `commits?brandId=${config.brandId}`) as { items: { revisionId: string; mergeParentRevisionId: string | null }[] };
  assert.equal(commits.items.find(value => value.revisionId === accepted.revision.id)?.mergeParentRevisionId, theirs.revision.id);
  return { ...ours, revision: accepted.revision, variant: { ...ours.variant, draftHeadRevisionId: accepted.revision.id } };
}
async function releaseReview(family: Family, target: Page, actor: Actor, ours: Branch, theirs: Branch) {
  await inspect(family, target, actor, ours.revision.id); await panel(target).getByRole('button', { name: 'Releases', exact: true }).click();
  const before = templateReleaseListResponseSchema.parse(await read(actor, family, `releases?brandId=${config.brandId}&includeTargets=true`));
  const buttons = panel(target).getByRole('button', { name: 'Review release', exact: true });
  await until(() => buttons.count(), value => value > 0, 'verified production binding in GUI');
  await buttons.first().click();
  const first = templateReleaseResultSchema.parse(await uiResponse(target, '/releases', () => panel(target).getByRole('button', { name: 'Confirm production release', exact: true }).click()));
  await inspect(family, target, actor, theirs.revision.id); await panel(target).getByRole('button', { name: 'Releases', exact: true }).click();
  await panel(target).getByRole('button', { name: 'Review release', exact: true }).first().click();
  const second = templateReleaseResultSchema.parse(await uiResponse(target, '/releases', () => panel(target).getByRole('button', { name: 'Confirm production release', exact: true }).click()));
  const releaseList = panel(target).getByRole('list', { name: 'Immutable releases', exact: true });
  const row = releaseList.locator('li').filter({ hasText: `Release ${first.release.id.slice(0, 8)}` });
  await row.getByText('Verified release pins', { exact: true }).click();
  assert((await row.locator('pre').textContent())?.includes(ours.revision.id), 'Actual GUI exposes immutable revision pins.');
  await row.getByRole('button', { name: 'Review rollback', exact: true }).click();
  const rollback = templateReleaseResultSchema.parse(await uiResponse(target, '/releases/rollback', () => panel(target).getByRole('button', { name: 'Confirm release rollback', exact: true }).click()));
  assert.equal(rollback.release.id, first.release.id);
  const after = templateReleaseListResponseSchema.parse(await read(actor, family, `releases?brandId=${config.brandId}`));
  assert.equal(after.heads.find(value => value.bindingId === first.release.bindingId && value.templateKey === first.release.templateKey)?.releaseId, first.release.id);
  return { before, first, second, after, scope: 'Actual GUI release/rollback and pin inspection. No new renders or callback execution.' };
}
async function permanentHistory(family: Family, target: Page, actor: Actor, copyIds: string[]) {
  const events: ReturnType<typeof templateVersionHistoryResponseSchema.parse>['items'] = [];
  let cursor: string | undefined;
  for (let pageIndex = 0; pageIndex < 50; pageIndex++) {
    const result = templateVersionHistoryResponseSchema.parse(await read(actor, family,
      `history?${new URLSearchParams({ brandId: config.brandId, limit: '500', ...(cursor ? { cursor } : {}) })}`));
    events.push(...result.items); cursor = result.nextCursor ?? undefined; if (!cursor) break;
  }
  assert(!cursor, 'Bounded permanent-history traversal completed.');
  const selected = events.filter(event => copyIds.includes(String(event.changes.nativeWorkingCopyId ?? event.changes.authoringWorkingCopyId)));
  assert(selected.length >= 4, 'Actual GUI actions must reach permanent authenticated history.');
  assert(selected.every(event => event.principalId === actor.principalId && event.channel === 'forge' && event.evidence === 'recorded'));
  for (const workingCopyId of new Set(selected.map(event => event.workingCopyId))) {
    const stream = selected.filter(event => event.workingCopyId === workingCopyId).sort((a, b) => a.sequence - b.sequence);
    for (let index = 1; index < stream.length; index++) { assert(stream[index]!.sequence > stream[index - 1]!.sequence);
      assert(stream[index]!.causedBy.includes(stream[index - 1]!.id)); }
  }
  assert(selected.some(event => event.origin?.control)); assert(selected.some(event => /Undo/.test(event.origin?.button ?? '')));
  await showPanel(family, target); await panel(target).getByRole('button', { name: 'Operations', exact: true }).click();
  await panel(target).getByRole('button', { name: 'Refresh operations', exact: true }).click();
  const streamId = selected.find(event => event.origin?.control)!.workingCopyId;
  for (let index = 0; index < 50; index++) {
    if (await target.getByRole('list', { name: `Operations for working copy ${streamId}`, exact: true }).count()) break;
    const more = panel(target).getByRole('button', { name: 'Load more operations', exact: true });
    if (!(await more.count())) break; await more.click(); await until(() => more.isEnabled(), Boolean, 'history page settled');
  }
  const visible = target.getByRole('list', { name: `Operations for working copy ${streamId}`, exact: true }); await visible.waitFor();
  assert((await visible.textContent())?.includes(actor.principalId));
  assert((await panel(target).textContent())?.includes('Timestamps do not establish order between clients.'));
  return selected;
}

try {
  const member = createClient(config.supabaseUrl, config.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const aUser = await member.auth.getUser(config.authSession.access_token), bUser = await member.auth.getUser(config.authSessionB.access_token);
  assert.ifError(aUser.error); assert.ifError(bUser.error); assert(aUser.data.user && bUser.data.user);
  for (const pair of [config.authSession, config.authSessionB]) {
    const claims = JSON.parse(Buffer.from(pair.access_token.split('.')[1]!, 'base64url').toString()) as { exp: number };
    assert(claims.exp > Date.now() / 1000 + 300, 'The coordinator must provide unexpired actors; this driver never refreshes them.');
  }
  // Match the existing real-browser harness: cookies contain complete genuine SDK Sessions.
  const sessions = await Promise.all([config.authSession, config.authSessionB].map(pair =>
    createClient(config.supabaseUrl, config.anonKey, { auth: { persistSession: false, autoRefreshToken: false } }).auth.setSession(pair)));
  for (const [index, result] of sessions.entries()) {
    assert.ifError(result.error); assert(result.data.session);
    const original = index === 0 ? config.authSession : config.authSessionB;
    assert.equal(result.data.session.access_token, original.access_token, 'No actor refresh is permitted.');
    assert.equal(result.data.session.refresh_token, original.refresh_token, 'No actor refresh is permitted.');
  }
  const sessionA = sessions[0]!.data.session!, sessionB = sessions[1]!.data.session!;
  assert.equal(sessionA.user.id, aUser.data.user.id); assert.equal(sessionB.user.id, bUser.data.user.id);
  observed.sessionPackaging = { source: 'Actual SDK setSession on genuine unexpired token pairs', tokensUnchanged: true,
    expiresAt: [sessionA.expires_at, sessionB.expires_at] };
  const a: Actor = { token: config.authSession.access_token, principalId: aUser.data.user.id, label: 'A', session: sessionA };
  const b: Actor = { token: config.authSessionB.access_token, principalId: bUser.data.user.id, label: 'B', session: sessionB };
  assert.notEqual(a.principalId, b.principalId); observed.actors = [a, b].map(({ label, principalId }) => ({ label, principalId }));
  const profile = path.join(run, 'private', 'chrome-a');
  context = await launch(profile, a); secondContext = await launch(path.join(run, 'private', 'chrome-b'), b);
  page = await context.newPage(); otherPage = await secondContext.newPage(); attach(page, a); attach(otherPage, b);
  rec.record('Genuine actors verified and Chrome contexts launched on the isolated stack', 'PASS');
  for (const family of config.families) {
    const result: Record<string, unknown> = { family: family.family, templateId: family.templateId, steps: [] }; list('families').push(result);
    const steps = result.steps as string[];
    try {
      const variants = await catalog(a, family), original = variants.find(value => value.original); assert(original);
      const base = original.revisions.find(value => value.id === original.draftHeadRevisionId); assert(base);
      await open(family, page, base.id); await inspect(family, page, a, base.id);
      await panel(page).getByRole('button', { name: 'Open exact revision', exact: true }).click();
      if (family.family === 'after_effects') await aeLayers(page, base.id, true);
      else { const control = family.family === 'hyperframes' ? page.getByLabel('Text 1', { exact: true })
        : page.locator(`[data-field="${family.textField}"]`).locator('input,textarea').first();
        await control.waitFor(); assert(await control.isDisabled(), 'Original is read-only until a real explicit branch.'); }
      steps.push('Original read-only'); rec.record(`${family.family}: Original is read-only until explicit branching`, 'PASS');
      const branchA = await branch(family, page, a, base.id, 'A'), branchB = await branch(family, page, a, base.id, 'B'), branchC = await branch(family, page, a, base.id, 'C');
      result.initialBranches = [branchA, branchB, branchC];
      await editor(family, page, a, branchA.revision.id);
      const first = await field(family, page), initial = await first.inputValue();
      const valueA = family.family === 'after_effects' ? String(Math.round((Number(initial) + 17.25) * 100) / 100) : `GUI A ${runId.slice(0, 8)}`;
      const copyA = await fill(family, page, valueA);
      const undo = page.getByRole('button', { name: family.family === 'hyperframes' ? 'Undo native change' : family.family === 'blender' ? 'Undo' : 'Undo layer change', exact: true });
      const redo = page.getByRole('button', { name: family.family === 'hyperframes' ? 'Redo native change' : family.family === 'blender' ? 'Redo' : 'Redo layer change', exact: true });
      await until(() => undo.isEnabled(), Boolean, 'undo admitted after durable input'); await undo.click();
      await until(() => first.inputValue(), value => value === initial, 'native/AE Undo button changed actual field');
      await redo.click(); await until(() => first.inputValue(), value => value === valueA, 'native/AE Redo button changed actual field');
      await editor(family, page, a, branchB.revision.id);
      const independent = await field(family, page, true), initialIndependent = await independent.inputValue();
      const independentValue = String(Math.round((Number(initialIndependent) + (family.family === 'blender' ? 0.5 : 7)) * 100) / 100);
      const copyB = await fill(family, page, independentValue, true);
      await editor(family, page, a, branchA.revision.id); assert.equal(await (await field(family, page)).inputValue(), valueA);
      await checkpoint(`${family.family}-dirty-branches`);
      await forceOwnChrome(profile); await context.close().catch(() => undefined);
      context = await launch(profile, a); page = await context.newPage(); attach(page, a);
      await open(family, page, branchA.revision.id); await editor(family, page, a, branchA.revision.id);
      assert.equal(await (await field(family, page)).inputValue(), valueA);
      assert.equal(await page.locator('[data-working-copy-id]:visible').first().getAttribute('data-working-copy-id'), copyA);
      await editor(family, page, a, branchB.revision.id); assert.equal(await (await field(family, page, true)).inputValue(), independentValue);
      steps.push('Dirty branch isolation and forced browser restart');
      rec.record(`${family.family}: actual dirty A/B editors, Undo/Redo and forced Chrome restart preserve exact private copies`, 'PASS');
      const savedB = await save(family, page, a, branchB);
      await editor(family, page, a, branchA.revision.id); const savedA = await save(family, page, a, branchA);
      await editor(family, page, a, branchC.revision.id);
      const valueC = family.family === 'after_effects' ? String(Number(initial) + 43) : `GUI C ${runId.slice(0, 8)}`;
      await fill(family, page, valueC); const savedC = await save(family, page, a, branchC);
      result.saved = { savedA, savedB, savedC };
      await inspect(family, page, a, savedA.revision.id); await panel(page).getByRole('button', { name: 'Compare / restore', exact: true }).click();
      await pick(page, 'Revision to compare', savedB);
      const diff = templateVersionDiffResponseSchema.parse(await uiResponse(page, '/diff', () => panel(page!).getByRole('button', { name: 'Compare revisions', exact: true }).click()));
      assert(diff.changes.length > 0); assert((await panel(page).getByRole('list', { name: 'Semantic revision differences' }).textContent())?.includes('Before:'));
      result.diff = diff;
      const disjoint = await merge(family, page, a, savedA, savedB, false);
      const overlapping = await merge(family, page, a, disjoint, savedC, true); result.merges = { disjoint, overlapping };
      await checkpoint(`${family.family}-reviewed-merges`);
      rec.record(`${family.family}: real GUI saves, before/after comparison, independent merge and explicit conflicting choice retain both parents`, 'PASS');
      // Keep one real reviewed preview open while the other authenticated browser advances its destination.
      await inspect(family, page, a, overlapping.revision.id); await panel(page).getByRole('button', { name: 'Merge', exact: true }).click();
      await pick(page, 'Source variant head', savedB);
      const stalePreview = templateVersionMergePreviewSchema.parse(await uiResponse(page, '/merges/preview',
        () => panel(page!).getByRole('button', { name: 'Preview merge', exact: true }).click()));
      result.stalePreview = stalePreview;
      if (stalePreview.conflicts.length) {
        const choices = panel(page).getByRole('button', { name: new RegExp(`^(Keep ${escaped(overlapping.name)}|Use complete ${escaped(overlapping.name)} state)$`) });
        assert(await choices.count() > 0, 'Every source/field conflict is reviewed before exercising stale refusal.');
        for (let index = 0; index < await choices.count(); index++) await choices.nth(index).click();
      }
      const staleCommit = panel(page).getByRole('button', { name: 'Commit reviewed merge', exact: true });
      assert(await staleCommit.isEnabled(), 'The reviewed preview is initially committable before the other actor moves its head.');
      await open(family, otherPage, overlapping.revision.id); await editor(family, otherPage, b, overlapping.revision.id);
      const later = family.family === 'after_effects' ? String(Number(initial) + 63) : `GUI later ${runId.slice(0, 8)}`;
      await fill(family, otherPage, later); const advanced = await save(family, otherPage, b, overlapping);
      if (await staleCommit.isDisabled()) {
        await panel(page).getByText('A branch head changed. Preview the merge again.', { exact: true }).waitFor();
        result.staleRefusal = 'Client invalidated the previously enabled preview after observing the changed head.';
      } else {
        await uiResponse(page, '/merges', () => staleCommit.click(), 409);
        await panel(page).getByRole('button', { name: 'Stop retrying', exact: true }).click();
        result.staleRefusal = 'Backend rejected the reviewed old heads with HTTP409.';
      }
      const unchanged = (await catalog(a, family)).find(value => value.variantId === advanced.variant.variantId);
      assert.equal(unchanged?.draftHeadRevisionId, advanced.revision.id, 'Stale refusal never appends a destination commit.');
      await panel(page).getByRole('button', { name: 'Refresh heads', exact: true }).click();
      await inspect(family, page, a, advanced.revision.id); await panel(page).getByRole('button', { name: 'Compare / restore', exact: true }).click();
      await pick(page, 'Revision to compare', savedA);
      await panel(page).getByRole('button', { name: new RegExp(`^Review restoration onto ${escaped(branchA.name)}$`) }).click();
      const restored = templateVersionResultSchema.parse(await uiResponse(page, '/reverts', () => panel(page!).getByRole('button', { name: 'Append restored revision', exact: true }).click()));
      assert.equal(restored.revision.parentRevisionId, advanced.revision.id);
      result.restored = restored;
      rec.record(`${family.family}: second authenticated GUI save invalidates the stale merge; reviewed restoration appends history`, 'PASS');
      result.releases = await releaseReview(family, page, a, { ...branchA, revision: restored.revision }, savedB);
      await checkpoint(`${family.family}-release-rollback-pins`);
      rec.record(`${family.family}: GUI production release, second promotion, rollback and exact immutable pin review`, 'PASS');
      result.operationEvidence = await permanentHistory(family, page, a, [copyA, copyB]);
      await checkpoint(`${family.family}-permanent-operation-history`);
      rec.record(`${family.family}: permanent authenticated history shows recorded controls/buttons, per-stream sequence and causal order`, 'PASS');
      steps.push('Complete GUI lifecycle');
    } catch (cause) {
      result.failure = cause instanceof Error ? cause.message : String(cause);
      rec.record(`${family.family}: remaining real GUI lifecycle`, 'FAIL', String(result.failure));
      await checkpoint(`${family.family}-failure`).catch(() => undefined);
      rec.record(`${family.family}: uncompleted journey steps`, 'SKIP', `Stopped at actual failure after ${steps.join(', ') || 'initial load'}; no API-only replacement.`);
    }
  }
} catch (cause) { rec.record('Real authenticated GUI harness', 'FAIL', cause instanceof Error ? cause.message : String(cause)); }
finally {
  clearInterval(monitor); clearTimeout(deadline);
  await context?.close().catch(() => undefined); await secondContext?.close().catch(() => undefined);
  observed.finishedAt = new Date().toISOString(); observed.counts = rec.summary();
  writeFileSync(path.join(run, 'observed.json'), `${JSON.stringify(sanitize(observed), null, 2)}\n`, { flag: 'wx' });
  rec.note('Real GUI uses existing product pages and authenticated Backend writes. Direct API calls are read-only corroboration. Browser-local drafts are not shared server drafts; client origin labels are not authenticated physical gestures. No renders, callbacks, hosted production or Presentation bridge qualification.');
  console.log(JSON.stringify({ run, observed: path.join(run, 'observed.json') })); rec.finish({ json: true });
}

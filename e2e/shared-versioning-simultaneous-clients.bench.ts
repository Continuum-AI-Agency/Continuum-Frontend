/** Two real Chrome API clients race authenticated saves. No app UI, mock replies or SQL writes. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, readlinkSync, statfsSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  type SaveTemplateRevisionRequest,
  type TemplateOperationInput,
  type TemplateRevision,
  saveTemplateRevisionRequestSchema,
  templateRevisionSchema,
  templateRevisionVariantsResponseSchema,
  templateVersionHistoryAppendResponseSchema,
  templateVersionMergePreviewSchema,
  templateVersionResultSchema,
} from '@continuum/contracts';
import { createClient } from '@supabase/supabase-js';
import { unzipSync } from 'fflate';
import { type BrowserContext, chromium, type Page } from 'playwright';
import { z } from 'zod';
import { Recorder } from '../../Continuum-Backend/scripts/_bench/recorder';

const sessionSchema = z.object({ access_token: z.string(), refresh_token: z.string() });
const configPath = process.env.WORKING_COPY_QUAL_CONFIG;
assert(configPath, 'Provide the genuine private zero-media fixture.');
const config = z.object({
  supabaseUrl: z.string().url(), apiUrl: z.string().url(), anonKey: z.string(),
  serviceRoleKey: z.string(), brandId: z.string().uuid(), templateId: z.string().uuid(),
  sourceAssetId: z.string().uuid(), sourceVersionId: z.string().uuid(),
  branches: z.array(z.object({ revisionId: z.string().uuid() })).min(1),
  layer: z.object({ compId: z.number().int().positive(), layerId: z.number().int().positive() }),
  authSession: sessionSchema, authSessionB: sessionSchema.optional(),
}).parse(JSON.parse(readFileSync(configPath, 'utf8')));
for (const url of [config.apiUrl, config.supabaseUrl])
  assert.equal(new URL(url).hostname, '127.0.0.1', 'Qualification is loopback only.');
const stage = path.resolve(process.env.WORKING_COPY_QUAL_STAGE ?? path.dirname(path.dirname(configPath)));
const cache = path.resolve(import.meta.dir, '../.next/working-copy-6bc9e4a1');
const runId = randomUUID();
const run = path.join(stage, `simultaneous-clients-${runId}`);
const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const free = () => Number(statfsSync(stage).bavail) * Number(statfsSync(stage).bsize);
assert(free() >= 50 * 1024 ** 3, '50 GiB admission floor.');
mkdirSync(path.join(run, 'private'), { recursive: true, mode: 0o700 });
const source = readFileSync(import.meta.path, 'utf8');
writeFileSync(path.join(run, 'bench-source.ts'), source, { flag: 'wx' });
const rec = new Recorder('forge:shared-versioning-simultaneous-clients:bench');
const evidence: Record<string, unknown> = {
  runId, sourceSha256: sha(source), owner: 'versioning_backend',
  approvedGcsPrefix: `gs://continuum-production-477821-creative-benchmarks/aule-forge-versioning/20261031-control-6bc9e4a1/refinement-v3/simultaneous-clients-${runId}/`,
  budget: { combinedStageAndOwnedNextCacheBytes: 2 * 1024 ** 3, maxDurationMs: 10 * 60_000 },
  qualification: 'Two independent Chrome processes issuing real authenticated Backend API requests. Browser transport overlap is observed, not exact server execution order, UI interaction, or two-user collaboration unless distinct principals are verified.',
  calls: [], races: [], byteProofs: [],
};
const rows = (key: string) => evidence[key] as object[];
const admin = createClient(config.supabaseUrl, config.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
type Reply = { status: number; body: unknown };
type Barrier = { arrive: (client: string) => Promise<void> };
type Client = {
  label: 'A' | 'B'; context: BrowserContext; page: Page; token: string; principalId: string;
  barrier: Barrier | null; chrome: { pid: number; uid: number; startTicks: string };
};
type Proposal = { client: Client; body: SaveTemplateRevisionRequest; event: TemplateOperationInput };
const contexts: BrowserContext[] = [];
let stopReason: string | null = null;
const bytesUsed = (directory: string): number => {
  try {
    return readdirSync(directory, { withFileTypes: true }).reduce((sum, entry) => {
      if (entry.isSymbolicLink()) return sum;
      const child = path.join(directory, entry.name);
      try { return sum + (entry.isDirectory() ? bytesUsed(child) : statSync(child).size); }
      catch (cause) { if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return sum; throw cause; }
    }, 0);
  } catch (cause) { if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return 0; throw cause; }
};
const stop = (reason: string) => {
  stopReason ??= reason;
  void Promise.allSettled(contexts.map((context) => context.close()));
};
const timeout = setTimeout(() => stop('ten-minute owned-run bound'), 10 * 60_000);
const monitor = setInterval(() => {
  if (free() < 20 * 1024 ** 3 || bytesUsed(stage) + bytesUsed(cache) > 2 * 1024 ** 3)
    stop('owned staging or free-space boundary');
}, 3000);

function ownedChrome(profile: string) {
  const found: { pid: number; uid: number; startTicks: string }[] = [];
  const processInfo = (pid: number) => {
    const base = `/proc/${pid}`;
    return { pid, uid: statSync(base).uid,
      args: readFileSync(`${base}/cmdline`, 'utf8').split(/[\0\s]+/).filter(Boolean),
      parent: Number(readFileSync(`${base}/status`, 'utf8').match(/^PPid:\s+(\d+)/m)?.[1]),
      startTicks: readFileSync(`${base}/stat`, 'utf8').split(') ')[1]!.split(' ')[19]!,
    };
  };
  for (const entry of readdirSync('/proc').filter((name) => /^\d+$/.test(name))) {
    try {
      if (statSync(`/proc/${entry}`).uid !== process.getuid?.()) continue;
      const item = processInfo(Number(entry));
      if (!item.args.includes(`--user-data-dir=${profile}`) || item.args.some((arg) => arg.startsWith('--type=')) ||
        !/\/(chrome|chrome-headless-shell)$/.test(readlinkSync(`/proc/${entry}/exe`))) continue;
      let parent = item.parent;
      const seen = new Set<number>();
      while (parent > 1 && parent !== process.pid && !seen.has(parent)) { seen.add(parent); parent = processInfo(parent).parent; }
      assert.equal(parent, process.pid, 'Each Chrome main process must descend from this bench.');
      found.push({ pid: item.pid, uid: item.uid, startTicks: item.startTicks });
    } catch (cause) {
      if (!['ENOENT', 'ESRCH', 'EACCES', 'EPERM'].includes((cause as NodeJS.ErrnoException).code ?? '')) throw cause;
    }
  }
  assert.equal(found.length, 1, 'Identify exactly one owned Chrome main process per private profile.');
  return found[0]!;
}

async function launch(label: Client['label'], session: z.infer<typeof sessionSchema>): Promise<Client> {
  const profile = path.join(run, 'private', `chrome-${label}`);
  mkdirSync(profile, { recursive: true, mode: 0o700 });
  const context = await chromium.launchPersistentContext(profile, {
    headless: true,
    ...(process.env.WORKING_COPY_QUAL_CHROME ? { executablePath: process.env.WORKING_COPY_QUAL_CHROME } : {}),
  });
  contexts.push(context);
  const chrome = ownedChrome(profile);
  const page = await context.newPage();
  await context.route('**/*', (route) => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
    ? route.continue() : route.abort('blockedbyclient'));
  // This is the real API document, including its actual 404 if no health route exists.
  await page.goto(`${config.apiUrl}/healthz`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  assert.equal(new URL(page.url()).origin, new URL(config.apiUrl).origin);
  const identity = await page.evaluate(async ({ url, token, anonKey }) => {
    const response = await fetch(`${url}/auth/v1/user`, {
      headers: { authorization: `Bearer ${token}`, apikey: anonKey }, signal: AbortSignal.timeout(30_000),
    });
    return { status: response.status, body: await response.json() as unknown };
  }, { url: config.supabaseUrl, token: session.access_token, anonKey: config.anonKey });
  assert.equal(identity.status, 200, `Actual GoTrue identity for client ${label}.`);
  const principalId = z.object({ id: z.guid() }).parse(identity.body).id;
  const client: Client = { label, context, page, token: session.access_token, principalId, barrier: null, chrome };
  await page.exposeFunction('qualificationRaceReady', () => {
    assert(client.barrier, 'Both real requests must be armed before releasing the race.');
    return client.barrier.arrive(client.label);
  });
  return client;
}

async function request(client: Client, action: string, body?: unknown, racing = false): Promise<Reply> {
  assert(!stopReason, stopReason ?? 'Owned run stopped.');
  const url = `${config.apiUrl}/api/ai-studio/templates/${config.templateId}/${action}`;
  const observation = { client: client.label, principalId: client.principalId, action, request: body,
    requestSha256: body === undefined ? null : sha(JSON.stringify(body)), startedAt: new Date().toISOString() };
  rows('calls').push(observation);
  try {
    const result = await client.page.evaluate(async ({ url, token, body, racing }) => {
      if (racing) await (window as unknown as { qualificationRaceReady: () => Promise<void> }).qualificationRaceReady();
      const response = await fetch(url, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(120_000),
      });
      return { status: response.status, body: await response.json() as unknown };
    }, { url, token: client.token, body, racing });
    Object.assign(observation, { receivedAt: new Date().toISOString(), ...result });
    return result;
  } catch (cause) {
    Object.assign(observation, { failedAt: new Date().toISOString(), transportError: cause instanceof Error ? cause.message : String(cause) });
    throw cause;
  }
}
async function family(client: Client) {
  const result = await request(client, `revision-variants?brandId=${config.brandId}`);
  assert.equal(result.status, 200);
  return templateRevisionVariantsResponseSchema.parse(result.body).items;
}
async function head(client: Client, variantId: string) {
  const variant = (await family(client)).find((value) => value.variantId === variantId);
  assert(variant);
  const revision = variant.revisions.find((value) => value.id === variant.draftHeadRevisionId);
  assert(revision);
  return revision;
}
async function branch(client: Client, parentRevisionId: string, label: string) {
  const result = await request(client, 'branches', { brandId: config.brandId, parentRevisionId,
    name: `Simultaneous ${label} ${runId.slice(0, 8)}`, idempotencyKey: randomUUID() });
  assert.equal(result.status, 200);
  return templateVersionResultSchema.parse(result.body).revision;
}
async function prepareProposal(client: Client, base: TemplateRevision, edit: { x?: number; y?: number }, label: string, causedBy: string[] = []): Promise<Proposal> {
  const event: TemplateOperationInput = {
    id: randomUUID(), workingCopyId: randomUUID(), sequence: 1, command: 'qualification_revision_request',
    baseRevisionId: base.id, channel: 'api', outcome: 'requested', evidence: 'recorded', causedBy,
    affectedObjects: [`aep:${config.layer.compId}:${config.layer.layerId}`],
    changes: { qualification: 'Actual browser API proposal, no UI click or upstream history claim', label,
      variantId: base.variantId, expectedHeadRevisionId: base.id, edit },
    origin: { tool: `Independent Chrome API client ${client.label}` },
  };
  const body = saveTemplateRevisionRequestSchema.parse({ brandId: config.brandId,
    parentRevisionId: base.id, variantId: base.variantId, expectedHeadRevisionId: base.id,
    idempotencyKey: randomUUID(), edits: { layers: [{ ...config.layer, ...edit }], slots: [], orders: [] },
    operations: [event], operationCoverage: { workingCopyId: event.workingCopyId, throughSequence: 1 } });
  const result = await request(client, 'history', { brandId: config.brandId, operations: [event] });
  assert.equal(result.status, 200);
  const accepted = templateVersionHistoryAppendResponseSchema.parse(result.body).items;
  assert.equal(accepted.length, 1); assert.equal(accepted[0]?.id, event.id);
  assert.equal(accepted[0]?.principalId, client.principalId);
  writeFileSync(path.join(run, `proposal-${event.id}.json`), `${JSON.stringify({ client: client.label,
    principalId: client.principalId, body, bodySha256: sha(JSON.stringify(body)), event }, null, 2)}\n`, { flag: 'wx' });
  return { client, body, event };
}
async function terminal(proposal: Proposal, reply: Reply) {
  const event: TemplateOperationInput = { ...proposal.event, id: randomUUID(), sequence: 2,
    command: 'qualification_revision_response', outcome: reply.status < 300 ? 'succeeded' : 'failed',
    causedBy: [proposal.event.id], changes: { actualStatus: reply.status, actualResponse: reply.body,
      frozenRequestSha256: sha(JSON.stringify(proposal.body)) } };
  const append = await request(proposal.client, 'history', { brandId: config.brandId, operations: [event] });
  assert.equal(append.status, 200);
  const read = await request(proposal.client, `history?${new URLSearchParams({ brandId: config.brandId,
    workingCopyId: proposal.event.workingCopyId, limit: '10' })}`);
  assert.equal(read.status, 200);
  const items = templateVersionHistoryAppendResponseSchema.parse({ items: (read.body as { items: unknown }).items }).items;
  assert.deepEqual(items.map((item) => item.id), [proposal.event.id, event.id]);
  assert(items.every((item) => item.principalId === proposal.client.principalId));
  assert.deepEqual(items[0]?.changes, proposal.event.changes);
}
async function save(proposal: Proposal) {
  const result = await request(proposal.client, 'revisions', proposal.body);
  await terminal(proposal, result);
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return templateRevisionSchema.parse(result.body);
}
async function race(a: Proposal, b: Proposal, label: string) {
  assert.equal(a.body.variantId, b.body.variantId);
  assert.equal(a.body.expectedHeadRevisionId, b.body.expectedHeadRevisionId);
  const observedHeads = await Promise.all([head(a.client, a.body.variantId!), head(b.client, b.body.variantId!)]);
  assert(observedHeads.every((value) => value.id === a.body.expectedHeadRevisionId));
  const ready = new Set<string>();
  let release: () => void = () => undefined;
  let refuse: (cause: Error) => void = () => undefined;
  const gate = new Promise<void>((resolve, reject) => { release = resolve; refuse = reject; });
  const armTimeout = setTimeout(() => refuse(new Error('Both actual clients did not arm within ten seconds.')), 10_000);
  const barrier: Barrier = { async arrive(client) { ready.add(client); if (ready.size === 2) release(); await gate; } };
  a.client.barrier = barrier; b.client.barrier = barrier;
  const timings = new Map<string, { dispatchedMs?: number; responseMs?: number }>();
  const listeners = [a, b].map((proposal) => {
    const timing: { dispatchedMs?: number; responseMs?: number } = {};
    timings.set(proposal.client.label, timing);
    const matches = (request: import('playwright').Request) => request.method() === 'POST' &&
      new URL(request.url()).pathname.endsWith('/revisions') && request.postDataJSON()?.idempotencyKey === proposal.body.idempotencyKey;
    const onRequest = (request: import('playwright').Request) => { if (matches(request)) timing.dispatchedMs = performance.now(); };
    const onResponse = (response: import('playwright').Response) => { if (matches(response.request())) timing.responseMs = performance.now(); };
    proposal.client.page.on('request', onRequest); proposal.client.page.on('response', onResponse);
    return () => { proposal.client.page.off('request', onRequest); proposal.client.page.off('response', onResponse); };
  });
  try {
    const results = await Promise.all([request(a.client, 'revisions', a.body, true), request(b.client, 'revisions', b.body, true)]);
    const intervals = [...timings].map(([client, timing]) => { assert(timing.dispatchedMs !== undefined && timing.responseMs !== undefined); return { client, ...timing }; });
    const overlapMs = Math.min(...intervals.map((value) => value.responseMs!)) - Math.max(...intervals.map((value) => value.dispatchedMs!));
    assert(overlapMs > 0, 'Actual browser request intervals must overlap; a sequential run is not concurrency evidence.');
    rows('races').push({ label, sharedHeadRevisionId: a.body.expectedHeadRevisionId, intervals, overlapMs,
      proposals: [a, b].map((value) => ({ client: value.client.label, principalId: value.client.principalId,
        idempotencyKey: value.body.idempotencyKey, requestSha256: sha(JSON.stringify(value.body)) })), statuses: results.map((value) => value.status) });
    await Promise.all([terminal(a, results[0]!), terminal(b, results[1]!)]);
    return results;
  } finally { clearTimeout(armTimeout); listeners.forEach((off) => off()); a.client.barrier = null; b.client.barrier = null; }
}
async function verifyBytes(revision: TemplateRevision, expected: { x: number; y: number }, label: string, principalId?: string, positionKind: 'explicit' | 'native-composition-default' = 'explicit') {
  const immutable = await admin.schema('media').from('template_revisions').select('created_by,parent_revision_id,checksum,parse:source_snapshot->parse')
    .eq('brand_id', config.brandId).eq('template_id', config.templateId).eq('id', revision.id).single();
  assert.ifError(immutable.error); assert(immutable.data);
  if (principalId) assert.equal(immutable.data.created_by, principalId);
  assert.equal(immutable.data.parent_revision_id, revision.parentRevisionId);
  assert.equal(immutable.data.checksum, revision.checksum);
  const version = await admin.schema('media').from('asset_versions').select('bucket,storage_path,checksum,size_bytes')
    .eq('brand_id', config.brandId).eq('asset_id', revision.sourceAssetId).eq('id', revision.sourceVersionId).single();
  assert.ifError(version.error); assert(version.data);
  const downloaded = await admin.storage.from(version.data.bucket).download(version.data.storage_path);
  assert.ifError(downloaded.error); assert(downloaded.data);
  const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
  assert.equal(bytes.length, version.data.size_bytes); assert.equal(sha(bytes), version.data.checksum); assert.equal(sha(bytes), revision.checksum);
  const parse = z.object({ fonts: z.array(z.unknown()), slots: z.array(z.unknown()), missingFootage: z.array(z.unknown()).optional(),
    structure: z.object({ sourcePackageChecksum: z.string(), sourceAepChecksum: z.string(),
      comps: z.array(z.object({ id: z.number(), layers: z.array(z.object({ id: z.number(), positionSource: z.object({ kind: z.string(), value: z.array(z.number()) }).nullish() })) })) }) }).parse(immutable.data.parse);
  assert.equal(parse.fonts.length, 0); assert.equal(parse.slots.length, 0); assert.equal(parse.missingFootage?.length ?? 0, 0);
  assert.equal(parse.structure.sourcePackageChecksum, sha(bytes));
  const aeps = Object.entries(unzipSync(bytes)).filter(([name]) => /\.aep$/i.test(name));
  assert.equal(aeps.length, 1); assert.equal(sha(aeps[0]![1]), parse.structure.sourceAepChecksum);
  const position = parse.structure.comps.find((comp) => comp.id === config.layer.compId)?.layers.find((layer) => layer.id === config.layer.layerId)?.positionSource;
  assert.equal(position?.kind, positionKind); assert.deepEqual(position?.value.slice(0, 2), [expected.x, expected.y]);
  const packageFile = path.join(run, `${label}-${revision.id}.zip`);
  writeFileSync(packageFile, bytes, { flag: 'wx' });
  rows('byteProofs').push({ label, revisionId: revision.id, parentRevisionId: revision.parentRevisionId,
    createdBy: immutable.data.created_by, sourceAssetId: revision.sourceAssetId, sourceVersionId: revision.sourceVersionId,
    packageFile, packageSha256: sha(bytes), innerAepSha256: sha(aeps[0]![1]), packageBytes: bytes.length, nativePosition: position?.value, positionKind });
}
async function preview(client: Client, ours: TemplateRevision, theirs: TemplateRevision) {
  const body = { brandId: config.brandId, variantId: ours.variantId, sourceVariantId: theirs.variantId,
    expectedHeadRevisionId: ours.id, expectedSourceHeadRevisionId: theirs.id };
  const result = await request(client, 'merges/preview', body);
  assert.equal(result.status, 200);
  return { body, preview: templateVersionMergePreviewSchema.parse(result.body) };
}
async function merge(client: Client, value: Awaited<ReturnType<typeof preview>>, resolutions: { path: string; choice: 'ours' | 'theirs' }[]) {
  return request(client, 'merges', { ...value.body, previewToken: value.preview.previewToken, resolutions,
    idempotencyKey: randomUUID(), message: 'Resolve actual simultaneous browser API proposals' });
}
async function verifyMergeParent(revision: TemplateRevision, otherId: string) {
  const result = await admin.schema('media').from('template_version_commits').select('merge_parent_revision_id')
    .eq('brand_id', config.brandId).eq('revision_id', revision.id).single();
  assert.ifError(result.error); assert.equal(result.data?.merge_parent_revision_id, otherId);
}
const expectedEdit = (proposal: Proposal, baseline: { x: number; y: number }) => ({ ...baseline,
  ...proposal.body.edits.layers.find((layer) => layer.compId === config.layer.compId && layer.layerId === config.layer.layerId) });

try {
  const a = await launch('A', config.authSession);
  const b = await launch('B', config.authSessionB ?? config.authSession);
  assert.notEqual(a.chrome.pid, b.chrome.pid, 'Independent clients must use distinct actual Chrome main processes.');
  evidence.clients = [a, b].map((client) => ({ label: client.label, principalId: client.principalId, chrome: client.chrome }));
  evidence.principalQualification = a.principalId === b.principalId ? 'same authenticated principal, two independent Chrome processes' : 'two independently authenticated brand-member principals';
  rec.record('Two independent real Chrome clients authenticate through actual GoTrue', 'PASS');
  const base = (await family(a)).flatMap((variant) => variant.revisions).find((revision) => revision.id === config.branches[0]!.revisionId);
  assert(base); assert.equal(base.sourceAssetId, config.sourceAssetId); assert.equal(base.sourceVersionId, config.sourceVersionId);
  const sourceRow = await admin.schema('media').from('template_revisions').select('parse:source_snapshot->parse')
    .eq('brand_id', config.brandId).eq('template_id', config.templateId).eq('id', base.id).single();
  assert.ifError(sourceRow.error);
  const sourceParse = z.object({ structure: z.object({ comps: z.array(z.object({ id: z.number(),
    layers: z.array(z.object({ id: z.number(), positionSource: z.object({ kind: z.enum(['explicit', 'native-composition-default']), value: z.array(z.number()) }).nullish() })) })) }) }).parse(sourceRow.data?.parse);
  const originalSource = sourceParse.structure.comps.find((comp) => comp.id === config.layer.compId)?.layers.find((layer) => layer.id === config.layer.layerId)?.positionSource;
  const originalPosition = originalSource?.value;
  assert(originalSource && originalPosition && originalPosition.length >= 2);
  const baseline = { x: originalPosition[0]!, y: originalPosition[1]! };
  assert.notEqual(baseline.x, 600); assert.notEqual(baseline.x, 620); assert.notEqual(baseline.y, 1100);
  await verifyBytes(base, baseline, 'original-baseline', undefined, originalSource.kind);

  const shared = await branch(a, base.id, 'independent-race');
  const independent = await Promise.all([prepareProposal(a, shared, { x: 600 }, 'independent-X'), prepareProposal(b, shared, { y: 1100 }, 'independent-Y')]);
  const replies = await race(independent[0]!, independent[1]!, 'independent-shared-head');
  assert(replies.every((reply) => [201, 409].includes(reply.status)), JSON.stringify(replies));
  const accepted = replies.flatMap((reply, index) => reply.status === 201 ? [{ proposal: independent[index]!, revision: templateRevisionSchema.parse(reply.body) }] : []);
  assert(accepted.length >= 1);
  const first = accepted.find((value) => value.revision.parentRevisionId === shared.id);
  assert(first, 'One immutable accepted commit must descend directly from the exact shared head.');
  await verifyBytes(first.revision, expectedEdit(first.proposal, baseline), 'independent-first', first.proposal.client.principalId);
  const finalHead = await head(a, shared.variantId);
  if (accepted.length === 2) {
    const next = accepted.find((value) => value.revision.id !== first.revision.id)!;
    assert.equal(next.revision.parentRevisionId, first.revision.id); assert.equal(finalHead.id, next.revision.id);
    await verifyBytes(next.revision, { x: 600, y: 1100 }, 'independent-auto-combined', next.proposal.client.principalId);
  } else assert.equal(finalHead.id, first.revision.id);
  const other = independent.find((value) => value !== first.proposal)!;
  const fork = await branch(other.client, shared.id, 'preserved-independent-proposal');
  const preserved = await save(await prepareProposal(other.client, fork,
    other === independent[0] ? { x: 600 } : { y: 1100 }, 'explicit-preserved-independent', [other.event.id]));
  await verifyBytes(preserved, expectedEdit(other, baseline), 'independent-preserved', other.client.principalId);
  const destination = await branch(first.proposal.client, first.revision.id, 'independent-merge-destination');
  const independentPreview = await preview(a, destination, preserved);
  assert.deepEqual(independentPreview.preview.conflicts, []);
  const independentMerge = await merge(a, independentPreview, []);
  assert.equal(independentMerge.status, 200, JSON.stringify(independentMerge.body));
  const combined = templateVersionResultSchema.parse(independentMerge.body).revision;
  assert.equal(combined.parentRevisionId, destination.id); await verifyMergeParent(combined, preserved.id);
  await verifyBytes(combined, { x: 600, y: 1100 }, 'independent-explicit-merge', a.principalId);
  rec.record('Overlapping real same-head saves preserve both independent proposals and a two-parent native merge', 'PASS');

  const overlapBase = await branch(a, base.id, 'overlap-race');
  const overlaps = await Promise.all([prepareProposal(a, overlapBase, { x: 600 }, 'overlap-X600'), prepareProposal(b, overlapBase, { x: 620 }, 'overlap-X620')]);
  const overlapReplies = await race(overlaps[0]!, overlaps[1]!, 'overlapping-shared-field');
  assert.deepEqual(overlapReplies.map((reply) => reply.status).sort(), [201, 409]);
  const winnerIndex = overlapReplies.findIndex((reply) => reply.status === 201);
  const winner = templateRevisionSchema.parse(overlapReplies[winnerIndex]!.body);
  const loser = overlaps[1 - winnerIndex]!;
  assert.equal(winner.parentRevisionId, overlapBase.id);
  await verifyBytes(winner, expectedEdit(overlaps[winnerIndex]!, baseline), 'overlap-winner', overlaps[winnerIndex]!.client.principalId);
  assert.equal((await head(a, overlapBase.variantId)).id, winner.id);
  const loserFork = await branch(loser.client, overlapBase.id, 'preserved-overlap-proposal');
  const loserSaved = await save(await prepareProposal(loser.client, loserFork,
    winnerIndex === 0 ? { x: 620 } : { x: 600 }, 'explicit-preserved-overlap', [loser.event.id]));
  await verifyBytes(loserSaved, expectedEdit(loser, baseline), 'overlap-preserved-loser', loser.client.principalId);
  const overlappingPreview = await preview(a, winner, loserSaved);
  assert(overlappingPreview.preview.conflicts.some((conflict) => conflict.kind === 'field'));
  assert.equal((await merge(a, overlappingPreview, [])).status, 409);
  assert.equal((await head(a, winner.variantId)).id, winner.id);
  const choices = overlappingPreview.preview.conflicts.map((conflict) => ({ path: conflict.path, choice: 'theirs' as const }));
  const resolved = await merge(a, overlappingPreview, choices);
  assert.equal(resolved.status, 200);
  const selected = templateVersionResultSchema.parse(resolved.body).revision;
  assert.equal(selected.parentRevisionId, winner.id); await verifyMergeParent(selected, loserSaved.id);
  await verifyBytes(selected, expectedEdit(loser, baseline), 'overlap-explicit-theirs', a.principalId);
  // Both earlier immutable accepted byte pins remain readable after resolution.
  await verifyBytes(winner, expectedEdit(overlaps[winnerIndex]!, baseline), 'overlap-winner-after-resolution');
  await verifyBytes(loserSaved, expectedEdit(loser, baseline), 'overlap-loser-after-resolution');
  rec.record('Same-field simultaneous saves explicitly conflict; both proposals survive and chosen native bytes are exact', 'PASS');

  const staleDestination = await branch(a, first.revision.id, 'stale-preview-destination');
  const stale = await preview(a, staleDestination, preserved);
  const moved = await save(await prepareProposal(b, staleDestination, { x: 640 }, 'other-client-advances-preview-head'));
  await verifyBytes(moved, { x: 640, y: expectedEdit(first.proposal, baseline).y }, 'other-client-head-advance', b.principalId);
  assert.equal((await merge(a, stale, [])).status, 409);
  assert.equal((await head(a, staleDestination.variantId)).id, moved.id);
  assert.equal((await head(a, preserved.variantId)).id, preserved.id);
  evidence.stalePreview = { qualification: 'Ordered stale-preview refusal after the other real client advanced the head; not claimed as a simultaneous commit race',
    previewHeadRevisionId: staleDestination.id, actualNewHeadRevisionId: moved.id, sourceHeadRevisionId: preserved.id };
  rec.record('A real second client advances the head; the first client stale preview is refused without changing either head', 'PASS');
} catch (cause) {
  rec.record('Real simultaneous-client qualification', 'FAIL', cause instanceof Error ? cause.message : String(cause));
} finally {
  clearTimeout(timeout); clearInterval(monitor);
  await Promise.allSettled(contexts.map((context) => context.close()));
  writeFileSync(path.join(run, 'observed.json'), `${JSON.stringify({ ...evidence, stopReason }, null, 2)}\n`, { flag: 'wx' });
  rec.note('Actual browser API concurrency only. Credentials remain private. Production rendering, pixels, UI collaboration and deployed behavior are not qualified. No fixture SQL writes or synthetic responses.');
  console.log(JSON.stringify({ artifactPrefix: run }));
  rec.finish({ json: true });
}

/** Real Chrome clients, separate Backend workers and an observed database-read barrier. */
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
const processSchema = z.object({ pid: z.number().int().positive(), uid: z.number().int().nonnegative(),
  startTicks: z.string(), executable: z.string() });
const workerSchema = processSchema.extend({ label: z.enum(['A', 'B']), apiUrl: z.string().url(), sourceHead: z.string().regex(/^[a-f0-9]{40}$/) });
const barrierReceiptSchema = z.object({ schema: z.literal('aule-semantic-head-barrier/1'), caseId: z.string(),
  variantId: z.string().uuid(), expectedHeadRevisionId: z.string().uuid(), controller: processSchema,
  bothHeldBeforeRelease: z.literal(true), unchangedPayloads: z.literal(true), reads: z.array(z.object({
    client: z.enum(['A', 'B']), apiUrl: z.string().url(), workerPid: z.number().int().positive(), workerStartTicks: z.string(),
    observedHeadRevisionId: z.string().uuid(), responseSha256: z.string().regex(/^[a-f0-9]{64}$/),
    forwardedSha256: z.string().regex(/^[a-f0-9]{64}$/), heldSequence: z.number().int().positive(), releasedSequence: z.number().int().positive(),
  })).length(2) });
const preparedScenarioSchema = z.object({ id: z.string().regex(/^[a-z0-9-]+$/), kind: z.enum(['source', 'structural']),
  oursRevisionId: z.string().uuid(), theirsRevisionId: z.string().uuid(), choice: z.enum(['ours', 'theirs']),
  expectedPosition: z.object({ x: z.number(), y: z.number() }),
  layer: z.object({ compId: z.number().int().positive(), layerId: z.number().int().positive() }).optional(),
  expectedLayerOrder: z.object({ compId: z.number(), layerIds: z.array(z.number()) }).optional(),
  expectedReadiness: z.object({ fonts: z.array(z.unknown()), slots: z.array(z.unknown()), missingFootage: z.array(z.unknown()) }).optional() });
const configPath = process.env.WORKING_COPY_QUAL_CONFIG;
assert(configPath, 'Provide the genuine private zero-media fixture.');
const config = z.object({
  supabaseUrl: z.string().url(), apiUrl: z.string().url(), anonKey: z.string(),
  serviceRoleKey: z.string(), brandId: z.string().uuid(), templateId: z.string().uuid(),
  sourceAssetId: z.string().uuid(), sourceVersionId: z.string().uuid(),
  branches: z.array(z.object({ revisionId: z.string().uuid() })).min(1),
  layer: z.object({ compId: z.number().int().positive(), layerId: z.number().int().positive() }),
  authSession: sessionSchema, authSessionB: sessionSchema.optional(),
  secondaryApiUrl: z.string().url().optional(), workerEvidenceFile: z.string().optional(),
  serverBarrierDir: z.string().optional(), preparedScenarioFile: z.string().optional(),
}).parse(JSON.parse(readFileSync(configPath, 'utf8')));
for (const url of [config.apiUrl, config.secondaryApiUrl ?? config.apiUrl, config.supabaseUrl])
  assert.equal(new URL(url).hostname, '127.0.0.1', 'Qualification is loopback only.');
const stage = path.resolve(process.env.WORKING_COPY_QUAL_STAGE ?? path.dirname(path.dirname(configPath)));
const declaration = z.object({ prefix: z.string(), budgetBytes: z.number().positive(), admissionBytes: z.number().positive(),
  stopFreeBytes: z.number().positive(), maxActualRenders: z.literal(0), maxInteractiveBrowserContexts: z.number().int().min(2) })
  .parse(JSON.parse(readFileSync(path.join(stage, 'run.json'), 'utf8')));
assert(declaration.prefix.startsWith('gs://continuum-production-477821-creative-benchmarks/aule-forge-versioning/'));
const runId = randomUUID();
const run = path.join(stage, `simultaneous-clients-${runId}`);
const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const free = () => Number(statfsSync(stage).bavail) * Number(statfsSync(stage).bsize);
assert(declaration.admissionBytes >= 50 * 1024 ** 3 && free() >= declaration.admissionBytes, '50 GiB admission floor.');
mkdirSync(path.join(run, 'private'), { recursive: true, mode: 0o700 });
const source = readFileSync(import.meta.path, 'utf8');
writeFileSync(path.join(run, 'bench-source.ts'), source, { flag: 'wx' });
const rec = new Recorder('forge:shared-versioning-simultaneous-clients:bench');
const evidence: Record<string, unknown> = {
  runId, sourceSha256: sha(source), owner: 'aule-forge-versioning',
  approvedGcsPrefix: declaration.prefix,
  budget: { wholeStageBytes: declaration.budgetBytes, maxDurationMs: 20 * 60_000 },
  qualification: 'Real authenticated browser API proposals and byte-backed native artifacts. Cross-process races require two actual Backend identities and unchanged held database responses; no UI, rendered pixels or global execution-order claim.',
  calls: [], races: [], byteProofs: [], scenarios: [], refusals: [],
};
const rows = (key: string) => evidence[key] as object[];
const privateValues = [config.serviceRoleKey, config.anonKey, config.authSession.access_token, config.authSession.refresh_token,
  config.authSessionB?.access_token, config.authSessionB?.refresh_token].filter((value): value is string => !!value);
function record(file: string, value: unknown) {
  assert.equal(path.basename(file), file);
  const bytes = JSON.stringify(value, null, 2) + '\n';
  assert(!privateValues.some(secret => bytes.includes(secret)), 'Private credential refused in public evidence.');
  writeFileSync(path.join(run, file), bytes, { flag: 'wx' });
  writeFileSync(path.join(run, `${file}.sealed.json`), JSON.stringify({ owner: 'aule-forge-versioning', closed: true,
    members: [{ file, bytes: Buffer.byteLength(bytes), sha256: sha(bytes) }] }, null, 2) + '\n', { flag: 'wx' });
}
const workers = config.workerEvidenceFile
  ? z.object({ workers: z.array(workerSchema).length(2) }).parse(JSON.parse(readFileSync(config.workerEvidenceFile, 'utf8'))).workers : [];
const crossProcess = config.secondaryApiUrl !== undefined;
if (crossProcess) {
  assert(config.workerEvidenceFile && config.serverBarrierDir, 'Two-worker qualification requires exact process and database barrier evidence.');
  assert.notEqual(config.secondaryApiUrl, config.apiUrl);
  assert.equal(new Set(workers.map(worker => worker.pid)).size, 2);
  assert.equal(new Set(workers.map(worker => worker.label)).size, 2);
  assert.equal(new Set(workers.map(worker => worker.sourceHead)).size, 1, 'Both workers must run the same pinned source.');
  assert.equal(workers.find(worker => worker.label === 'A')?.apiUrl, config.apiUrl);
  assert.equal(workers.find(worker => worker.label === 'B')?.apiUrl, config.secondaryApiUrl);
  const relative = path.relative(stage, path.resolve(config.serverBarrierDir));
  assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'Barrier evidence belongs under declared staging.');
}
const preparedScenarios = config.preparedScenarioFile
  ? z.object({ scenarios: z.array(preparedScenarioSchema) }).parse(JSON.parse(readFileSync(config.preparedScenarioFile, 'utf8'))).scenarios : [];
record('configuration-scope.json', { crossProcess, workers, preparedScenarios, barrierProtocol: 'aule-semantic-head-barrier/1' });
if (process.env.SEMANTIC_PREPARE_ONLY === '1') {
  record('prepared.json', { sourceSha256: sha(source), crossProcess, noBrowserServiceOrApiStarted: true });
  console.log(JSON.stringify({ prepared: run })); process.exit(0);
}
const admin = createClient(config.supabaseUrl, config.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
type Reply = { status: number; body: unknown };
type Barrier = { arrive: (client: string) => Promise<void> };
type Client = {
  label: 'A' | 'B'; context: BrowserContext; page: Page; token: string; principalId: string;
  barrier: Barrier | null; chrome: { pid: number; uid: number; startTicks: string }; apiUrl: string;
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
const timeout = setTimeout(() => stop('twenty-minute owned-run bound'), 20 * 60_000);
const monitor = setInterval(() => {
  if (free() < declaration.stopFreeBytes || bytesUsed(stage) > declaration.budgetBytes)
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
  const apiUrl = label === 'B' ? config.secondaryApiUrl ?? config.apiUrl : config.apiUrl;
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
  await page.goto(`${apiUrl}/healthz`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  assert.equal(new URL(page.url()).origin, new URL(apiUrl).origin);
  const identity = await page.evaluate(async ({ url, token, anonKey }) => {
    const response = await fetch(`${url}/auth/v1/user`, {
      headers: { authorization: `Bearer ${token}`, apikey: anonKey }, signal: AbortSignal.timeout(30_000),
    });
    return { status: response.status, body: await response.json() as unknown };
  }, { url: config.supabaseUrl, token: session.access_token, anonKey: config.anonKey });
  assert.equal(identity.status, 200, `Actual GoTrue identity for client ${label}.`);
  const principalId = z.object({ id: z.guid() }).parse(identity.body).id;
  const client: Client = { label, context, page, token: session.access_token, principalId, barrier: null, chrome, apiUrl };
  await page.exposeFunction('qualificationRaceReady', () => {
    assert(client.barrier, 'Both real requests must be armed before releasing the race.');
    return client.barrier.arrive(client.label);
  });
  return client;
}

async function request(client: Client, action: string, body?: unknown, racing = false, apiUrl = client.apiUrl): Promise<Reply> {
  assert(!stopReason, stopReason ?? 'Owned run stopped.');
  const url = `${apiUrl}/api/ai-studio/templates/${config.templateId}/${action}`;
  const observation = { client: client.label, principalId: client.principalId, apiUrl, action, request: body,
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
    record(`call-${String(rows('calls').length).padStart(5, '0')}-${randomUUID()}.json`, observation);
    return result;
  } catch (cause) {
    Object.assign(observation, { failedAt: new Date().toISOString(), transportError: cause instanceof Error ? cause.message : String(cause) });
    record(`failed-call-${randomUUID()}.json`, observation);
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
  record(`proposal-${event.id}.json`, { client: client.label,
    principalId: client.principalId, body, bodySha256: sha(JSON.stringify(body)), event });
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
  const caseId = `${label}-${runId}`;
  let armed: { client: string; apiUrl: string; workerPid: number; workerStartTicks: string; idempotencyKey: string; requestSha256: string }[] = [];
  if (crossProcess) {
    armed = [a, b].map(proposal => {
      const worker = workers.find(value => value.label === proposal.client.label); assert(worker);
      verifyProcess(worker);
      return { client: proposal.client.label, apiUrl: proposal.client.apiUrl, workerPid: worker.pid, workerStartTicks: worker.startTicks,
        idempotencyKey: proposal.body.idempotencyKey, requestSha256: sha(JSON.stringify(proposal.body)) };
    });
    const arm = { schema: 'aule-semantic-head-barrier/1', caseId, brandId: config.brandId, templateId: config.templateId,
      variantId: a.body.variantId, expectedHeadRevisionId: a.body.expectedHeadRevisionId, requests: armed };
    writeFileSync(path.join(config.serverBarrierDir!, `${caseId}.arm.json`), JSON.stringify(arm, null, 2) + '\n', { flag: 'wx' });
    record(`${caseId}-arm.json`, arm);
  }
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
    let serverBarrier: z.infer<typeof barrierReceiptSchema> | undefined;
    if (crossProcess) {
      const receiptFile = path.join(config.serverBarrierDir!, `${caseId}.receipt.json`);
      const deadline = Date.now() + 30_000;
      while (!readdirSync(config.serverBarrierDir!).includes(path.basename(receiptFile))) {
        assert(!stopReason && Date.now() < deadline, 'Actual database-read barrier receipt missing.');
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      serverBarrier = barrierReceiptSchema.parse(JSON.parse(readFileSync(receiptFile, 'utf8')));
      assert.equal(serverBarrier.caseId, caseId); assert.equal(serverBarrier.variantId, a.body.variantId);
      assert.equal(serverBarrier.expectedHeadRevisionId, a.body.expectedHeadRevisionId);
      verifyProcess(serverBarrier.controller);
      assert.equal(new Set(serverBarrier.reads.map(read => read.client)).size, 2);
      for (const read of serverBarrier.reads) {
        const expected = armed.find(value => value.client === read.client); assert(expected);
        assert.equal(read.apiUrl, expected.apiUrl); assert.equal(read.workerPid, expected.workerPid);
        assert.equal(read.workerStartTicks, expected.workerStartTicks); assert.equal(read.observedHeadRevisionId, a.body.expectedHeadRevisionId);
        assert.equal(read.responseSha256, read.forwardedSha256, 'Held real response bytes must be forwarded unchanged.');
      }
      assert(Math.max(...serverBarrier.reads.map(read => read.heldSequence)) < Math.min(...serverBarrier.reads.map(read => read.releasedSequence)),
        'Both exact worker head-read responses must be held before either is released.');
      for (const worker of workers) verifyProcess(worker);
      record(`${caseId}-barrier.json`, serverBarrier);
    }
    const resultEvidence = { label, caseId, sharedHeadRevisionId: a.body.expectedHeadRevisionId, intervals, overlapMs, serverBarrier,
      proposals: [a, b].map((value) => ({ client: value.client.label, principalId: value.client.principalId,
        apiUrl: value.client.apiUrl, idempotencyKey: value.body.idempotencyKey, requestSha256: sha(JSON.stringify(value.body)) })), statuses: results.map((value) => value.status) };
    rows('races').push(resultEvidence); record(`${caseId}-race.json`, resultEvidence);
    await Promise.all([terminal(a, results[0]!), terminal(b, results[1]!)]);
    return results;
  } finally { clearTimeout(armTimeout); listeners.forEach((off) => off()); a.client.barrier = null; b.client.barrier = null; }
}
function verifyProcess(expected: z.infer<typeof processSchema>) {
  const base = `/proc/${expected.pid}`;
  assert.equal(statSync(base).uid, expected.uid);
  assert.equal(readFileSync(`${base}/stat`, 'utf8').split(') ')[1]!.split(' ')[19], expected.startTicks);
  assert.equal(readlinkSync(`${base}/exe`), expected.executable);
}
async function verifyBytes(revision: TemplateRevision, expected: { x: number; y: number }, label: string, principalId?: string,
  positionKind: 'explicit' | 'native-composition-default' = 'explicit', order?: { compId: number; layerIds: number[] }, target = config.layer,
  readiness?: { fonts: unknown[]; slots: unknown[]; missingFootage: unknown[] }) {
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
      comps: z.array(z.object({ id: z.number(), layers: z.array(z.object({ id: z.number(), index: z.number().nullable().optional(), positionSource: z.object({ kind: z.string(), value: z.array(z.number()).nullable() }).nullish() })) })) }) }).parse(immutable.data.parse);
  assert.deepEqual(parse.fonts, readiness?.fonts ?? []);
  assert.deepEqual(parse.slots, readiness?.slots ?? []);
  assert.deepEqual(parse.missingFootage ?? [], readiness?.missingFootage ?? []);
  assert.equal(parse.structure.sourcePackageChecksum, sha(bytes));
  const aeps = Object.entries(unzipSync(bytes)).filter(([name]) => /\.aep$/i.test(name));
  assert.equal(aeps.length, 1); assert.equal(sha(aeps[0]![1]), parse.structure.sourceAepChecksum);
  const composition = parse.structure.comps.find(comp => comp.id === target.compId); assert(composition);
  const nativeLayer = composition.layers.find(layer => layer.id === target.layerId); assert(nativeLayer);
  const position = nativeLayer.positionSource;
  assert(position?.value && position.value.length >= 2, 'The selected native target needs its recorded coordinates.');
  assert.equal(position.kind, positionKind); assert.deepEqual(position.value.slice(0, 2), [expected.x, expected.y]);
  let nativeOrder: number[] | undefined;
  if (order) {
    const composition = parse.structure.comps.find(comp => comp.id === order.compId); assert(composition);
    assert(composition.layers.every(layer => layer.index !== undefined && layer.index !== null), 'Native order needs actual parsed layer indices.');
    nativeOrder = [...composition.layers].sort((a, b) => a.index! - b.index!).map(layer => layer.id);
    assert.deepEqual(nativeOrder, order.layerIds);
  }
  const packageFile = path.join(run, `${label}-${revision.id}.zip`);
  writeFileSync(packageFile, bytes, { flag: 'wx' });
  const proof = { label, revisionId: revision.id, parentRevisionId: revision.parentRevisionId,
    createdBy: immutable.data.created_by, sourceAssetId: revision.sourceAssetId, sourceVersionId: revision.sourceVersionId,
    packageFile, packageSha256: sha(bytes), innerAepSha256: sha(aeps[0]![1]), packageBytes: bytes.length,
    nativeLayer: { compId: composition.id, layerId: nativeLayer.id }, nativePosition: position?.value, positionKind, nativeOrder,
    readiness: { fonts: parse.fonts, slots: parse.slots, missingFootage: parse.missingFootage ?? [] } };
  rows('byteProofs').push(proof); record(`${label}-${revision.id}-bytes.json`, proof);
}
async function preview(client: Client, ours: TemplateRevision, theirs: TemplateRevision) {
  const body = { brandId: config.brandId, variantId: ours.variantId, sourceVariantId: theirs.variantId,
    expectedHeadRevisionId: ours.id, expectedSourceHeadRevisionId: theirs.id };
  const result = await request(client, 'merges/preview', body);
  assert.equal(result.status, 200);
  return { body, preview: templateVersionMergePreviewSchema.parse(result.body) };
}
async function merge(client: Client, value: Awaited<ReturnType<typeof preview>>, resolutions: { path: string; choice: 'ours' | 'theirs' }[]) {
  const body = { ...value.body, previewToken: value.preview.previewToken, resolutions,
    idempotencyKey: randomUUID(), message: 'Resolve actual simultaneous browser API proposals' };
  return { ...await request(client, 'merges', body), request: body };
}
async function verifyMergeParent(revision: TemplateRevision, otherId: string) {
  const result = await admin.schema('media').from('template_version_commits').select('merge_parent_revision_id')
    .eq('brand_id', config.brandId).eq('revision_id', revision.id).single();
  assert.ifError(result.error); assert.equal(result.data?.merge_parent_revision_id, otherId);
}
const expectedEdit = (proposal: Proposal, baseline: { x: number; y: number }) => ({ ...baseline,
  ...proposal.body.edits.layers.find((layer) => layer.compId === config.layer.compId && layer.layerId === config.layer.layerId) });
async function replaySave(proposal: Proposal, revision: TemplateRevision, otherWorker: Client) {
  const before = await head(proposal.client, revision.variantId);
  const result = await request(proposal.client, 'revisions', proposal.body, false, otherWorker.apiUrl);
  assert.equal(result.status, 200, JSON.stringify(result.body)); assert.equal(templateRevisionSchema.parse(result.body).id, revision.id);
  assert.equal((await head(proposal.client, revision.variantId)).id, before.id);
  const changed = structuredClone(proposal.body); changed.edits.layers[0]!.x = 777;
  const changedResult = await request(proposal.client, 'revisions', changed, false, otherWorker.apiUrl);
  assert.equal(changedResult.status, 409, JSON.stringify(changedResult.body));
  rows('refusals').push({ kind: 'changed-save-intent', original: proposal.body, changed, result: changedResult });
  if (proposal.client.principalId !== otherWorker.principalId) {
    const owner = await request(otherWorker, 'revisions', proposal.body);
    assert([403, 409].includes(owner.status), JSON.stringify(owner.body));
    rows('refusals').push({ kind: 'different-save-principal', request: proposal.body, result: owner });
  } else rec.record('Different-principal replay refusal', 'SKIP', 'Both clients use the same actual authenticated principal.');
  assert.equal((await head(proposal.client, revision.variantId)).id, before.id);
}
async function automaticPair(a: Client, b: Client, base: TemplateRevision, baseline: { x: number; y: number },
  label: string, edits: [{ x?: number; y?: number }, { x?: number; y?: number }], expected: { x: number; y: number }) {
  const shared = await branch(a, base.id, label);
  const proposals = await Promise.all([prepareProposal(a, shared, edits[0], `${label}-A`), prepareProposal(b, shared, edits[1], `${label}-B`)]);
  const replies = await race(proposals[0]!, proposals[1]!, label);
  assert.deepEqual(replies.map(reply => reply.status), [201, 201], `Independent or identical proposals must both be accepted: ${JSON.stringify(replies)}`);
  const accepted = replies.map((reply, index) => ({ revision: templateRevisionSchema.parse(reply.body), proposal: proposals[index]! }));
  assert.notEqual(accepted[0]!.revision.id, accepted[1]!.revision.id, 'Distinct save intents retain distinct immutable commits.');
  const first = accepted.find(value => value.revision.parentRevisionId === shared.id); assert(first);
  const second = accepted.find(value => value !== first)!;
  assert.equal(second.revision.parentRevisionId, first.revision.id);
  assert.equal((await head(a, shared.variantId)).id, second.revision.id);
  await verifyBytes(first.revision, expectedEdit(first.proposal, baseline), `${label}-first`, first.proposal.client.principalId);
  await verifyBytes(second.revision, expected, `${label}-automatic-final`, second.proposal.client.principalId);
  await replaySave(first.proposal, first.revision, first.proposal.client === a ? b : a);
  return { first, second, shared };
}

try {
  const a = await launch('A', config.authSession);
  const b = await launch('B', config.authSessionB ?? config.authSession);
  assert.notEqual(a.chrome.pid, b.chrome.pid, 'Independent clients must use distinct actual Chrome main processes.');
  evidence.clients = [a, b].map((client) => ({ label: client.label, apiUrl: client.apiUrl, principalId: client.principalId, chrome: client.chrome }));
  evidence.principalQualification = a.principalId === b.principalId ? 'same authenticated principal, two independent Chrome processes' : 'two independently authenticated brand-member principals';
  rec.record('Two independent real Chrome clients authenticate through actual GoTrue', 'PASS');
  if (crossProcess) { for (const worker of workers) verifyProcess(worker); rec.record('Two exact current-source Backend worker identities are live', 'PASS'); }
  else rec.record('Two-Backend-worker execution', 'SKIP', 'No secondaryApiUrl: transport-only legacy mode, no cross-process qualification.');
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

  const independent = await automaticPair(a, b, base, baseline, 'independent-shared-head', [{ x: 600 }, { y: 1100 }], { x: 600, y: 1100 });
  rec.record('Independent same-head saves both succeed and automatically combine X/Y in verified native bytes', 'PASS');
  await automaticPair(a, b, base, baseline, 'identical-shared-head', [{ x: 600 }, { x: 600 }], { x: 600, y: baseline.y });
  rec.record('Identical same-head outcomes both succeed without a false semantic conflict', 'PASS');
  await automaticPair(a, b, base, baseline, 'canonical-multi-axis', [{ x: 700, y: 1200 }, { x: 700 }], { x: 700, y: 1200 });
  rec.record('Canonical multi-axis x/y and identical single-axis x combine without losing y', 'PASS');
  evidence.normalizationBoundary = 'This public revision API admits canonical x/y only; compound producer command normalization is a separate qualification. No unsupported position field was invented.';

  const overlapBase = await branch(a, base.id, 'overlap-race');
  const overlaps = await Promise.all([prepareProposal(a, overlapBase, { x: 600 }, 'overlap-X600'), prepareProposal(b, overlapBase, { x: 620 }, 'overlap-X620')]);
  const overlapReplies = await race(overlaps[0]!, overlaps[1]!, 'overlapping-shared-field');
  assert.deepEqual(overlapReplies.map((reply) => reply.status).sort(), [201, 409]);
  const winnerIndex = overlapReplies.findIndex((reply) => reply.status === 201);
  const winner = templateRevisionSchema.parse(overlapReplies[winnerIndex]!.body);
  const loser = overlaps[1 - winnerIndex]!;
  rows('refusals').push({ kind: 'differing-same-field', request: loser.body, result: overlapReplies[1 - winnerIndex] });
  assert.equal((overlapReplies[1 - winnerIndex]!.body as { error?: unknown }).error, 'template_revision_head_conflict');
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

  const replayAdvance = await save(await prepareProposal(b, selected, { x: 660 }, 'advance-accepted-merge-head'));
  const replay = await request(a, 'merges', resolved.request, false, b.apiUrl);
  assert.equal(replay.status, 200); assert.equal(templateVersionResultSchema.parse(replay.body).revision.id, selected.id);
  assert.equal((await head(a, selected.variantId)).id, replayAdvance.id);
  const changedMerge = await request(a, 'merges', { ...resolved.request, message: 'Changed reviewed merge intent' }, false, b.apiUrl);
  assert.equal(changedMerge.status, 409); rows('refusals').push({ kind: 'changed-merge-intent', result: changedMerge });
  if (a.principalId !== b.principalId) {
    const owner = await request(b, 'merges', resolved.request); assert([403, 409].includes(owner.status));
    rows('refusals').push({ kind: 'different-merge-principal', result: owner });
    rec.record('A different authenticated principal cannot claim an accepted merge intent', 'PASS');
  } else rec.record('Different-principal merge replay refusal', 'SKIP', 'Both clients use the same actual authenticated principal.');
  rec.record('Accepted merge replays across workers after head movement; changed intent is refused', 'PASS');

  const first = independent.first;
  const staleDestination = await branch(a, first.revision.id, 'stale-preview-destination');
  const sourceBranch = await branch(b, first.revision.id, 'stale-preview-source');
  const preserved = await save(await prepareProposal(b, sourceBranch, { y: 1300 }, 'source-for-stale-destination-preview'));
  const stale = await preview(a, staleDestination, preserved);
  const moved = await save(await prepareProposal(b, staleDestination, { x: 640 }, 'other-client-advances-preview-head'));
  await verifyBytes(moved, { x: 640, y: expectedEdit(first.proposal, baseline).y }, 'other-client-head-advance', b.principalId);
  assert.equal((await merge(a, stale, [])).status, 409);
  assert.equal((await head(a, staleDestination.variantId)).id, moved.id);
  assert.equal((await head(a, preserved.variantId)).id, preserved.id);
  evidence.stalePreview = { qualification: 'Ordered stale-preview refusal after the other real client advanced the head; not claimed as a simultaneous commit race',
    previewHeadRevisionId: staleDestination.id, actualNewHeadRevisionId: moved.id, sourceHeadRevisionId: preserved.id };
  rec.record('A real second client advances the head; the first client stale preview is refused without changing either head', 'PASS');

  const staleSourceDestination = await branch(a, base.id, 'source-move-destination');
  const staleSource = await branch(b, base.id, 'source-move-source');
  const sourcePreview = await preview(a, staleSourceDestination, staleSource);
  const movedSource = await save(await prepareProposal(b, staleSource, { x: 680 }, 'other-client-advances-preview-source'));
  const sourceRefusal = await merge(a, sourcePreview, []); assert.equal(sourceRefusal.status, 409);
  assert.equal((await head(a, staleSourceDestination.variantId)).id, staleSourceDestination.id);
  assert.equal((await head(b, staleSource.variantId)).id, movedSource.id);
  rows('refusals').push({ kind: 'stale-source-preview', result: sourceRefusal });
  rec.record('Moving the source head invalidates its exact reviewed merge preview', 'PASS');

  for (const scenario of preparedScenarios) {
    const catalog = await family(a);
    const ours = catalog.flatMap(variant => variant.revisions).find(revision => revision.id === scenario.oursRevisionId);
    const theirs = catalog.flatMap(variant => variant.revisions).find(revision => revision.id === scenario.theirsRevisionId);
    assert(ours && theirs); assert.notEqual(ours.variantId, theirs.variantId);
    if (scenario.kind === 'source') { assert.notEqual(ours.sourceVersionId, theirs.sourceVersionId); assert.notEqual(ours.checksum, theirs.checksum); }
    const reviewed = await preview(a, ours, theirs);
    assert(reviewed.preview.conflicts.some(conflict => conflict.kind === scenario.kind));
    const unresolved = await merge(a, reviewed, []); assert.equal(unresolved.status, 409);
    assert.equal((await head(a, ours.variantId)).id, ours.id); assert.equal((await head(b, theirs.variantId)).id, theirs.id);
    const resolution = await merge(a, reviewed, reviewed.preview.conflicts.map(conflict => ({ path: conflict.path, choice: scenario.choice })));
    assert.equal(resolution.status, 200, JSON.stringify(resolution.body));
    const committed = templateVersionResultSchema.parse(resolution.body).revision;
    assert.equal(committed.parentRevisionId, ours.id); await verifyMergeParent(committed, theirs.id);
    const chosen = scenario.choice === 'ours' ? ours : theirs;
    assert.equal(committed.sourceVersionId, chosen.sourceVersionId); assert.equal(committed.checksum, chosen.checksum);
    await verifyBytes(committed, scenario.expectedPosition, scenario.id, a.principalId, 'explicit', scenario.expectedLayerOrder, scenario.layer, scenario.expectedReadiness);
    const proof = { ...scenario, preview: reviewed, unresolved, committed };
    rows('scenarios').push(proof); record(`${scenario.id}-scenario.json`, proof);
    rec.record(`Prepared genuine ${scenario.kind} conflict remains unresolved until reviewed two-parent acceptance`, 'PASS');
  }
  for (const kind of ['source', 'structural'] as const)
    if (!preparedScenarios.some(scenario => scenario.kind === kind)) rec.record(`${kind} native conflict scenario`, 'SKIP', 'No genuine root-prepared API revision pair supplied.');
} catch (cause) {
  rec.record('Real simultaneous-client qualification', 'FAIL', cause instanceof Error ? cause.message : String(cause));
} finally {
  clearTimeout(timeout); clearInterval(monitor);
  await Promise.allSettled(contexts.map((context) => context.close()));
  record('observed.json', { ...evidence, stopReason });
  rec.note('Actual browser API concurrency only. Credentials remain private. Production rendering, pixels, UI collaboration and deployed behavior are not qualified. No fixture SQL writes or synthetic responses.');
  console.log(JSON.stringify({ artifactPrefix: run }));
  rec.finish({ json: true });
}

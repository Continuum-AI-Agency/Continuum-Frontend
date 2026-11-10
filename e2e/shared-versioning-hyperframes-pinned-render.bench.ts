/** Opt-in actual supported-vector worker proof. The owner starts every service separately. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statfsSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  type HyperframesSceneView, type TemplateRevision,
  hyperframesSceneRefSchema, hyperframesSceneSchema, hyperframesSceneViewSchema, hyperframesSceneResourcesSchema,
  hyperframesSceneRenderExecutionSpecSchema, hyperframesSceneRenderRequestSchema,
  hyperframesSceneRenderStatusSchema, registerMediaResponseSchema, libraryUploadTicketSchema,
  saveHyperframesRevisionRequestSchema, templateRevisionSchema, templateRevisionVariantsResponseSchema,
  templateVersionResultSchema, templateVersionDiffResponseSchema,
  templateReleaseListResponseSchema, templateReleaseResultSchema, templateReleaseSchema,
} from '@continuum/contracts';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { Recorder } from '../../Continuum-Backend/scripts/_bench/recorder';

const rec = new Recorder('forge:shared-versioning-hyperframes-pinned-render:bench');
const configPath = process.env.VERSIONING_HYPERFRAMES_RENDER_CONFIG;
assert(configPath, 'Provide VERSIONING_HYPERFRAMES_RENDER_CONFIG; this driver never starts services.');
const session = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1) });
const config = z.object({ stage: z.string(), supabaseUrl: z.string().url(), apiUrl: z.string().url(),
  libraryUploadUrl: z.string().url(), microUrl: z.string().url(), anonKey: z.string().min(1), serviceRoleKey: z.string().min(1),
  brandId: z.string().uuid(), authSession: session, authSessionB: session, sourcePath: z.string(),
  nativeBinaryPath: z.string(), bindingId: z.string().uuid().optional(),
  resumeObservedPath: z.string().optional(), resumeObservedSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).parse(JSON.parse(readFileSync(configPath, 'utf8')));
const stage = path.resolve(config.stage);
const declaration = z.object({ owner: z.literal('aule-forge-versioning'), prefix: z.string(), budgetBytes: z.number(),
  admissionBytes: z.number(), stopFreeBytes: z.number(), outputBudgetBytes: z.number().max(64 << 20),
  maxWidth: z.number().max(640), maxHeight: z.number().max(360), maxFramesPerRender: z.number().max(12), maxRenders: z.number().max(4),
}).parse(JSON.parse(readFileSync(path.join(stage, 'run.json'), 'utf8')));
assert(declaration.prefix.startsWith('gs://continuum-production-477821-creative-benchmarks/aule-forge-versioning/'));
for (const value of [config.supabaseUrl, config.apiUrl, config.libraryUploadUrl, config.microUrl]) assert.equal(new URL(value).hostname, '127.0.0.1');
assert.equal(new URL(config.supabaseUrl).protocol, 'https:');
const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const engineSha256 = '203e1769c29b8d5547fe6b6642fe5369e0e00a69e4aaf9eadfaef5f2896641e2';
const engine = 'hyperframes-native/4+resvg-0.48.1';
const tools = { encoderSha256: 'ed16af623947494a72e284b6eb8ff225f2da22b38b5d5069c2fd4b4ba3384e41',
  probeSha256: '272f6ebc634a63d9c8b4ca68e964119d980f25154e5aa2c35e5487da48e9a58f' };
assert.equal(sha(readFileSync(config.nativeBinaryPath)), engineSha256);
assert.equal(sha(readFileSync('/usr/bin/ffmpeg')), tools.encoderSha256);
assert.equal(sha(readFileSync('/usr/bin/ffprobe')), tools.probeSha256);
const source = readFileSync(config.sourcePath);
assert.equal(sha(source), 'cbde5b04f4fd30efc57316b7375ca824739c15b86270a3c9465035358ac23f8b', 'Use the separately identified explicit-viewport vector source.');
const free = () => { const value = statfsSync(stage); return Number(value.bavail) * Number(value.bsize); };
assert(free() >= declaration.admissionBytes, '50 GiB admission floor.');
const runId = randomUUID(), run = path.join(stage, `hyperframes-worker-${runId}`);
mkdirSync(path.join(run, 'private'), { recursive: true, mode: 0o700 });
writeFileSync(path.join(run, 'bench-source.ts'), readFileSync(import.meta.path), { flag: 'wx' });
writeFileSync(path.join(run, 'source.html'), source, { flag: 'wx' });
const evidence: Record<string, unknown> = { runId, startedAt: new Date().toISOString(), benchSha256: sha(readFileSync(import.meta.path)),
  approvedGcsPrefix: `${declaration.prefix}hyperframes-worker-${runId}/`, calls: [], artifacts: [], jobs: [],
  fixture: { sha256: sha(source), bytes: source.length, scope: 'Distinct controlled static 32x24 vector HTML; original artwork with explicit parser viewport/fps attributes. No customer or general-fidelity claim.' },
  qualification: 'Actual authenticated template routes, immutable Library intake, native ingest/compiler, durable render jobs, real product consumer and pinned 203e executor. PubSub/OIDC, hosted, typed Skia and general format fidelity are unrun.' };
const rows = (key: string) => evidence[key] as object[];
const stop = new AbortController();
const used = (directory: string): number => {
  try { return readdirSync(directory, { withFileTypes: true }).reduce((sum, item) => {
    if (item.isSymbolicLink()) return sum;
    const file = path.join(directory, item.name);
    try { return sum + (item.isDirectory() ? used(file) : statSync(file).size); }
    catch (cause) { if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return sum; throw cause; }
  }, 0); } catch (cause) { if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return 0; throw cause; }
};
const timer = setTimeout(() => stop.abort(), 12 * 60_000);
const monitor = setInterval(() => { if (free() < declaration.stopFreeBytes || used(stage) > declaration.budgetBytes) stop.abort(); }, 2000);
async function localFetch(input: RequestInfo | URL, init?: RequestInit) {
  assert(!stop.signal.aborted, 'Owned storage/time/free-space bound reached.');
  assert.equal(new URL(input instanceof Request ? input.url : String(input)).hostname, '127.0.0.1');
  return fetch(input, { ...init, redirect: 'error', signal: AbortSignal.any([stop.signal,
    AbortSignal.timeout(180_000), ...(init?.signal ? [init.signal] : [])]) });
}
const options = { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: localFetch } };
const admin = createClient(config.supabaseUrl, config.serviceRoleKey, options), member = createClient(config.supabaseUrl, config.anonKey, options);
type Actor = { label: string; principalId: string; token: string };
let templateId = '', totalOutputBytes = 0;
const sanitize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) =>
    [key, key === 'lease_token' ? (typeof item === 'string' ? { sha256: sha(item) } : item) : sanitize(item)]));
  if (typeof value === 'string') return value.replace(/https?:\/\/[^\s"'<>]+/g, text => {
    try { const url = new URL(text); return `${url.origin}${url.pathname}`; } catch { return '[redacted URL]'; }
  });
  return value;
};
async function request(actor: Actor, url: string, body?: unknown, expectedStatus?: number) {
  const id = randomUUID();
  const response = await localFetch(url, { method: body === undefined ? 'GET' : 'POST', headers: {
    authorization: `Bearer ${actor.token}`, apikey: config.anonKey, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const text = await response.text(); assert(Buffer.byteLength(text) <= 8 << 20);
  const result: unknown = JSON.parse(text);
  writeFileSync(path.join(run, 'private', `${id}.json`), JSON.stringify({ path: new URL(url).pathname, request: body,
    responseStatus: response.status, response: result }), { flag: 'wx', mode: 0o600 });
  rows('calls').push({ id, path: new URL(url).pathname, actor: actor.label, principalId: actor.principalId,
    status: response.status, requestSha256: body === undefined ? null : sha(JSON.stringify(body)), responseSha256: sha(text) });
  if (expectedStatus !== undefined) assert.equal(response.status, expectedStatus, `Actual ${new URL(url).pathname}`);
  else assert(response.ok, `Actual ${new URL(url).pathname} refused HTTP${response.status}; raw private packet ${id}.`);
  return result;
}
const query = (extra: Record<string, string> = {}) => new URLSearchParams({ brandId: config.brandId, ...extra });
const api = (actor: Actor, action: string, body?: unknown, status?: number) => request(actor,
  `${config.apiUrl}/api/ai-studio/templates/${templateId}/${action}`, body, status);
async function identity(label: string, token: string): Promise<Actor> {
  const result = await member.auth.getUser(token); assert.ifError(result.error); assert(result.data.user);
  return { label, token, principalId: result.data.user.id };
}
async function scene(actor: Actor, revision: TemplateRevision) {
  const native = hyperframesSceneViewSchema.parse(await api(actor, `scene?${query({ family: 'hyperframes', revisionId: revision.id })}`));
  assert.equal(native.revision.revisionId, revision.id); assert.equal(native.sceneSha256, revision.native?.sceneSha256);
  assert.deepEqual(native.viewport, { width: 32, height: 24 }); assert.equal(native.clock.frameCount, 3);
  assert(native.renderer); assert.deepEqual(native.renderer, { engine: { implementation: engine, sha256: engineSha256 }, tools });
  return native;
}
async function stored(bucket: string, key: string, expected: { sha256: string; sizeBytes: number }, file: string) {
  assert(expected.sizeBytes <= declaration.outputBudgetBytes);
  const result = await admin.storage.from(bucket).download(key); assert.ifError(result.error); assert(result.data);
  const bytes = new Uint8Array(await result.data.arrayBuffer()); assert.equal(bytes.length, expected.sizeBytes); assert.equal(sha(bytes), expected.sha256);
  writeFileSync(path.join(run, file), bytes, { flag: 'wx' });
  return bytes;
}
async function retainNative(revision: TemplateRevision, label: string) {
  const result = await admin.schema('media').from('template_revision_native').select('scene')
    .eq('brand_id', config.brandId).eq('revision_id', revision.id).single(); assert.ifError(result.error);
  const pin = hyperframesSceneRefSchema.parse(result.data?.scene); assert.equal(pin.sha256, revision.native?.sceneSha256); assert(pin.resources);
  const bytes = await stored(pin.bucket, pin.storagePath, { sha256: pin.sha256, sizeBytes: pin.byteLength }, `${label}-scene.json`);
  const decoded = hyperframesSceneSchema.parse(JSON.parse(Buffer.from(bytes).toString('utf8')));
  assert.deepEqual(decoded.fonts, []); assert.deepEqual(decoded.dependencies, []);
  assert.equal(decoded.source.sha256, sha(source)); assert.equal(decoded.source.upload?.sha256, sha(source));
  const manifest = await stored(pin.resources.bucket, pin.resources.storagePath,
    { sha256: pin.resources.sha256, sizeBytes: pin.resources.byteLength }, `${label}-resources.json`);
  assert.deepEqual(hyperframesSceneResourcesSchema.parse(JSON.parse(Buffer.from(manifest).toString('utf8'))).resources, []);
  rows('artifacts').push({ label, revisionId: revision.id, sourceVersionId: revision.sourceVersionId, sourceSha256: revision.checksum,
    scene: pin, fonts: decoded.fonts, dependencies: decoded.dependencies });
}
async function branchSave(actor: Actor, base: TemplateRevision, original: HyperframesSceneView, width: number) {
  const branch = templateVersionResultSchema.parse(await api(actor, 'branches', { brandId: config.brandId,
    parentRevisionId: base.id, name: `Vector ${width}px ${runId.slice(0, 8)}`, idempotencyKey: randomUUID() })).revision;
  assert(branch.native);
  const body = saveHyperframesRevisionRequestSchema.parse({ family: 'hyperframes', brandId: config.brandId,
    parentRevisionId: branch.id, variantId: branch.variantId, expectedHeadRevisionId: branch.id,
    expectedParentSceneSha256: branch.native.sceneSha256, expectedSourceSceneSha256: original.sceneSha256,
    idempotencyKey: randomUUID(), edits: { schema: 'hyperframes.edits/1', sourceSha256: original.edits.sourceSha256,
      operations: [{ op: 'style', nodeId: 'block', properties: { width: `${width}px` } }] },
    origin: { tool: 'Actual supported-vector pinned-render qualification' } });
  const saved = templateRevisionSchema.parse(await api(actor, 'revisions', body));
  assert.equal(saved.createdBy, actor.principalId); assert.equal(saved.sourceVersionId, base.sourceVersionId);
  await retainNative(saved, `width-${width}`);
  return { revision: saved, view: await scene(actor, saved) };
}
const jobRowSchema = z.object({ id: z.string().uuid(), state: z.string(), kind: z.string(), source_id: z.string(), source_revision: z.string(),
  created_by: z.string().uuid(), attempt_count: z.number().int().nonnegative(), execution_spec: hyperframesSceneRenderExecutionSpecSchema,
  input_manifest: z.unknown(), error_code: z.string().nullable(), result_asset_refs: z.unknown() }).passthrough();
async function snapshot(jobId: string, label: string) {
  const result = await admin.schema('media').from('client_render_jobs').select('*')
    .eq('brand_id', config.brandId).eq('id', jobId).single(); assert.ifError(result.error); assert(result.data);
  writeFileSync(path.join(run, 'private', `job-${jobId}-${label}.json`), JSON.stringify(result.data, null, 2), { flag: 'wx', mode: 0o600 });
  const row = jobRowSchema.parse(result.data);
  rows('jobs').push({ label, row: sanitize(row) }); return row;
}
async function enqueue(actor: Actor, saved: { revision: TemplateRevision; view: HyperframesSceneView }, label: string, release?: { id: string; bindingId: string; templateKey: string }) {
  assert(saved.view.renderer);
  const body = hyperframesSceneRenderRequestSchema.parse({ family: 'hyperframes', brandId: config.brandId,
    revisionId: saved.revision.id, sceneSha256: saved.view.sceneSha256, submissionId: randomUUID(),
    engine: saved.view.renderer.engine, tools: saved.view.renderer.tools, outputs: [{ file: 'png', frame: 1 }],
    ...(release ? { releaseId: release.id, bindingId: release.bindingId, templateKey: release.templateKey } : {}) });
  const status = hyperframesSceneRenderStatusSchema.parse(await api(actor, 'scene/renders', body)); assert.equal(status.state, 'ready');
  const row = await snapshot(status.jobId, `${label}-queued`);
  assert.equal(row.kind, 'scene_render'); assert.equal(row.source_id, `hyperframes:${templateId}`);
  assert.equal(row.source_revision, body.submissionId);
  assert.equal(row.execution_spec.revision.templateId, templateId); assert.equal(row.execution_spec.revision.variantId, saved.revision.variantId);
  assert.equal(row.execution_spec.revision.revisionId, saved.revision.id);
  assert.equal(row.execution_spec.source.assetId, saved.revision.sourceAssetId);
  assert.equal(row.execution_spec.source.versionId, saved.revision.sourceVersionId);
  assert.equal(row.execution_spec.source.entrySha256, saved.revision.native?.entrySha256);
  assert.equal(row.execution_spec.source.scene.sha256, saved.view.sceneSha256);
  assert.equal(row.execution_spec.intent.releaseId, release?.id);
  assert.equal(row.execution_spec.source.upload.sha256, sha(source)); assert.equal(row.created_by, actor.principalId);
  return { actor, saved, label, body, row };
}
async function consume(queued: Awaited<ReturnType<typeof enqueue>>, width: number) {
  await request(queued.actor, `${config.apiUrl}/__qualification/consume`, { jobId: queued.row.id });
  const after = await snapshot(queued.row.id, `${queued.label}-consumed`);
  assert.deepEqual(after.execution_spec, queued.row.execution_spec, 'The actual worker retains the originally selected pins.');
  assert.deepEqual(after.input_manifest, queued.row.input_manifest);
  assert.equal(after.attempt_count, queued.row.attempt_count + 1, 'Only the legitimate worker lease increments attempt count.');
  const status = hyperframesSceneRenderStatusSchema.parse(await api(queued.actor, `scene/renders/${queued.row.id}?${query()}`));
  evidence.lastWorkerOutcome = status;
  assert.equal(status.state, 'completed', `Actual worker state ${status.state}: ${status.error?.code ?? ''}`);
  assert.equal(status.outputs.length, 1);
  const output = status.outputs[0]!; assert.equal(output.file, 'png');
  totalOutputBytes += output.bytes; assert(totalOutputBytes <= declaration.outputBudgetBytes);
  const version = await admin.schema('media').from('asset_versions').select('asset_id,id,bucket,storage_path,checksum,size_bytes')
    .eq('brand_id', config.brandId).eq('asset_id', output.assetId).eq('id', output.versionId).single(); assert.ifError(version.error); assert(version.data);
  assert.equal(version.data.checksum, output.sha256); assert.equal(version.data.size_bytes, output.bytes);
  const file = `${queued.label}-output.png`;
  const bytes = await stored(version.data.bucket, version.data.storage_path, { sha256: output.sha256, sizeBytes: output.bytes }, file);
  assert.equal(Buffer.from(bytes).readUInt32BE(16), 32); assert.equal(Buffer.from(bytes).readUInt32BE(20), 24);
  const rgba = execFileSync('/usr/bin/ffmpeg', ['-v', 'error', '-i', path.join(run, file), '-f', 'rawvideo', '-pix_fmt', 'rgba', '-threads', '1', 'pipe:1'],
    { timeout: 10_000, maxBuffer: 64 << 10 }); assert.equal(rgba.length, 32 * 24 * 4);
  for (let y = 0; y < 24; y++) for (let x = 0; x < 32; x++) {
    const inside = x >= 4 && x < 4 + width && y >= 3 && y < 9, at = (y * 32 + x) * 4;
    assert.deepEqual([...rgba.subarray(at, at + 4)], inside ? [255, 0, 0, 255] : [0, 0, 0, 255], `Actual vector pixel ${x},${y}`);
  }
  writeFileSync(path.join(run, `${queued.label}-output.rgba`), rgba, { flag: 'wx' });
  rows('artifacts').push({ label: queued.label, output, version: version.data, rawRgbaSha256: sha(rgba), expectedWidth: width,
    oracle: 'Direct unchanged authored CSS rectangle geometry at x4,y3,h6, opaque red/black; no renderer helper or browser pixels.' });
  return { row: after, output, rawRgbaSha256: sha(rgba) };
}
type Queued = Awaited<ReturnType<typeof enqueue>>;
async function completePinnedJobs(jobs: [Queued, Queued, Queued], target: { bindingId: string; templateKey: string }, releaseId: string, actor: Actor) {
  const outputs = [await consume(jobs[0], 10), await consume(jobs[1], 10), await consume(jobs[2], 12)];
  assert.equal(outputs[0]!.rawRgbaSha256, outputs[1]!.rawRgbaSha256); assert.notEqual(outputs[1]!.rawRgbaSha256, outputs[2]!.rawRgbaSha256);
  const afterPublication = templateReleaseListResponseSchema.parse(await api(actor, `releases?${query()}`));
  assert.equal(afterPublication.heads.find(value => value.bindingId === target.bindingId && value.templateKey === target.templateKey)?.releaseId, releaseId,
    'Late completion of the older queued release B must not override the explicit rollback to A.');
  assert.equal(afterPublication.items.length, 2);
  evidence.releaseAfterPublication = afterPublication;
  evidence.final = { renders: outputs.length, totalOutputBytes, resumedOriginalJobs: Boolean(config.resumeObservedPath), producerScope: 'Three actual native product-worker renders; all sources static, three admitted clock frames, one PNG output requested per render.' };
  rec.record('Real product consumers render the originally queued states and publish independently decoded exact Library pixels', 'PASS');
}
async function resumeOriginalJobs(a: Actor, b: Actor) {
  assert(config.resumeObservedPath && config.resumeObservedSha256);
  const file = path.resolve(config.resumeObservedPath);
  assert(file.startsWith(stage + path.sep), 'Resume evidence belongs to the declared producer.');
  const bytes = readFileSync(file); assert.equal(sha(bytes), config.resumeObservedSha256);
  const previous = z.object({
    intake: z.object({ templateId: z.string().uuid(), versionId: z.string().uuid(), ingestJobId: z.string().uuid(), revisionId: z.string().uuid() }).passthrough(),
    actors: z.array(z.object({ label: z.string(), principalId: z.string().uuid() })),
    jobs: z.array(z.object({ label: z.string(), row: jobRowSchema })),
    releases: z.object({ target: z.object({ bindingId: z.string().uuid(), templateKey: z.string() }).passthrough(),
      releaseA: templateReleaseSchema, releaseB: templateReleaseSchema,
      advancedBranchHeadRevisionId: z.string().uuid(), advancedBranchHeadSceneSha256: z.string() }).passthrough(),
  }).passthrough().parse(JSON.parse(bytes.toString('utf8')));
  assert.equal(previous.actors.find(value => value.label === 'A')?.principalId, a.principalId);
  assert.equal(previous.actors.find(value => value.label === 'B')?.principalId, b.principalId);
  templateId = previous.intake.templateId;
  evidence.resumption = { observedPath: file, observedSha256: sha(bytes), originalIntake: previous.intake,
    priorActualAttempts: 1, remainingActualAttempts: 3, priorCounts: previous.counts,
    scope: 'Retry original ready proof job and first consumption of two original production jobs. No intake, edit, release or job-state reset.' };
  const { target, releaseA, releaseB } = previous.releases;
  async function verifyPointers(label: string) {
    const history = templateRevisionVariantsResponseSchema.parse(await api(a, `revision-variants?${query()}`));
    const branch = history.items.find(value => value.variantId === releaseA.variantId);
    assert.equal(branch?.draftHeadRevisionId, previous.releases.advancedBranchHeadRevisionId);
    assert.equal(branch?.revisions.find(value => value.id === branch.draftHeadRevisionId)?.native?.sceneSha256,
      previous.releases.advancedBranchHeadSceneSha256);
    const releases = templateReleaseListResponseSchema.parse(await api(a, `releases?${query()}`));
    assert.equal(releases.heads.find(value => value.bindingId === target.bindingId && value.templateKey === target.templateKey)?.releaseId, releaseA.id);
    assert.equal(releases.items.length, 2);
    assert.deepEqual(releases.items.find(value => value.id === releaseA.id), releaseA);
    assert.deepEqual(releases.items.find(value => value.id === releaseB.id), releaseB);
    evidence[label] = { history, releases };
    return history;
  }
  const history = await verifyPointers('beforeResume');
  const version = await admin.schema('media').from('asset_versions').select('bucket,storage_path,checksum,size_bytes')
    .eq('brand_id', config.brandId).eq('asset_id', templateId).eq('id', previous.intake.versionId).single();
  assert.ifError(version.error); assert(version.data);
  assert.equal(version.data.checksum, sha(source)); assert.equal(version.data.size_bytes, source.length);
  const protectedSource = await stored(version.data.bucket, version.data.storage_path,
    { sha256: sha(source), sizeBytes: source.length }, 'protected-original.html'); assert.deepEqual(Buffer.from(protectedSource), source);
  const jobs: Queued[] = [];
  for (const [label, actor] of [['proof-width10', a], ['releaseA-width10', a], ['releaseB-width12', b]] as const) {
    const original = previous.jobs.find(value => value.label === `${label}-queued`); assert(original);
    const row = await snapshot(original.row.id, `${label}-before-resume`);
    assert.equal(row.state, 'ready'); assert.equal(row.attempt_count, label === 'proof-width10' ? 1 : 0);
    assert.deepEqual(row.execution_spec, original.row.execution_spec); assert.deepEqual(row.input_manifest, original.row.input_manifest);
    assert.equal(row.created_by, actor.principalId);
    const revision = history.items.flatMap(value => value.revisions).find(value => value.id === row.execution_spec.revision.revisionId); assert(revision?.native);
    assert.equal(revision.sourceVersionId, previous.intake.versionId);
    assert.equal(row.execution_spec.source.assetId, revision.sourceAssetId);
    assert.equal(row.execution_spec.source.versionId, revision.sourceVersionId);
    assert.equal(row.execution_spec.source.scene.sha256, revision.native.sceneSha256);
    assert.equal(row.execution_spec.intent.releaseId, label === 'proof-width10' ? undefined : label === 'releaseA-width10' ? releaseA.id : releaseB.id);
    await retainNative(revision, `${label}-retained`);
    const saved = { revision, view: await scene(actor, revision) };
    jobs.push({ actor, saved, label, body: hyperframesSceneRenderRequestSchema.parse(row.execution_spec.intent), row });
  }
  rec.record('Original protected upload, saved scenes, queued immutable pins, advanced draft and rollback release remain verified', 'PASS');
  assert.equal(jobs.length, 3);
  await completePinnedJobs([jobs[0]!, jobs[1]!, jobs[2]!], target, releaseA.id, a);
  await verifyPointers('afterResume');
  const metadata = z.object({ renderAttempts: z.literal(4) }).passthrough()
    .parse(await request(a, `${config.apiUrl}/__qualification/metadata`)); evidence.finalWrapper = metadata;
  rec.record('Exactly four total actual attempts retain three completed original jobs and the explicit release rollback', 'PASS');
}

try {
  const [a, b] = await Promise.all([identity('A', config.authSession.access_token), identity('B', config.authSessionB.access_token)]);
  assert.notEqual(a.principalId, b.principalId); evidence.actors = [a, b].map(({ label, principalId }) => ({ label, principalId }));
  const metadata = z.object({ googleProjectConfigured: z.literal(false), renderAttempts: z.number() }).passthrough()
    .parse(await request(a, `${config.apiUrl}/__qualification/metadata`));
  assert.equal(metadata.renderAttempts, config.resumeObservedPath ? 1 : 0); evidence.wrapper = metadata;
  const health = z.object({ engine: z.literal(engineSha256) }).passthrough().parse(await request(a, `${config.microUrl}/health`)); evidence.engineHealth = health;
  rec.record('Two genuine principals and the actual exact pinned native executor are verified', 'PASS');
  if (config.resumeObservedPath) await resumeOriginalJobs(a, b);
  else {
  const ticket = libraryUploadTicketSchema.parse(await request(a, config.libraryUploadUrl, { action: 'sign_upload', brandId: config.brandId,
    fileName: 'versioning-vector.html', mimeType: 'text/html', sizeBytes: source.length }));
  const upload = await member.storage.from(ticket.bucket).uploadToSignedUrl(ticket.path, ticket.token, source, { contentType: 'text/html' }); assert.ifError(upload.error);
  const pins = registerMediaResponseSchema.parse(await request(a, config.libraryUploadUrl, { action: 'register', brandId: config.brandId,
    assetId: ticket.assetId, bucket: ticket.bucket, storagePath: ticket.path, fileName: 'versioning-vector.html', mimeType: 'text/html',
    sizeBytes: source.length, checksum: sha(source), integrityState: 'verified' }));
  templateId = pins.assetId; assert(pins.ingestJobId);
  await request(a, `${config.apiUrl}/__qualification/consume`, { jobId: pins.ingestJobId });
  const history = templateRevisionVariantsResponseSchema.parse(await api(a, `revision-variants?${query()}`));
  const original = history.items.find(value => value.original); assert(original);
  const base = original.revisions.find(value => value.id === original.draftHeadRevisionId); assert(base?.native);
  assert.equal(base.checksum, sha(source)); assert.equal(base.sourceVersionId, pins.versionId);
  const uploadedVersion = await admin.schema('media').from('asset_versions').select('bucket,storage_path,checksum,size_bytes')
    .eq('brand_id', config.brandId).eq('asset_id', templateId).eq('id', pins.versionId).single();
  assert.ifError(uploadedVersion.error); assert(uploadedVersion.data);
  assert(uploadedVersion.data.storage_path.includes('/native-original/'));
  assert.equal(uploadedVersion.data.checksum, sha(source)); assert.equal(uploadedVersion.data.size_bytes, source.length);
  const originalBytes = await stored(uploadedVersion.data.bucket, uploadedVersion.data.storage_path,
    { sha256: sha(source), sizeBytes: source.length }, 'protected-original.html'); assert.deepEqual(Buffer.from(originalBytes), source);
  const baseView = await scene(a, base); await retainNative(base, 'original');
  evidence.intake = { templateId, versionId: pins.versionId, ingestJobId: pins.ingestJobId, revisionId: base.id, sceneSha256: baseView.sceneSha256,
    qualification: 'Actual member-authenticated Library protected original and real product ingest/parser/compiler. No seeded rows or invented scene.' };
  rec.record('Protected Library intake and the real ingest worker produce an immutable small vector scene', 'PASS');
  const first = await branchSave(a, base, baseView, 10), second = await branchSave(b, base, baseView, 12);
  const diff = templateVersionDiffResponseSchema.parse(await api(a, 'diff', { brandId: config.brandId, fromRevisionId: first.revision.id, toRevisionId: second.revision.id }));
  assert(diff.nativeChanged); assert(diff.changes.some(change => change.path.includes('width') && change.from === '10px' && change.to === '12px'));
  evidence.diff = diff; rec.record('Both real principals branch/save/reopen native width edits with a detailed before/after diff', 'PASS');
  const proof = await enqueue(a, first, 'proof-width10');
  const releases = templateReleaseListResponseSchema.parse(await api(a, `releases?${query({ includeTargets: 'true' })}`));
  const target = releases.targets?.find(value => value.family === 'hyperframes' && (!config.bindingId || value.bindingId === config.bindingId)); assert(target);
  const releaseTarget = { brandId: config.brandId, bindingId: target.bindingId, templateKey: target.templateKey };
  const releaseA = templateReleaseResultSchema.parse(await api(a, 'releases', { ...releaseTarget, revisionId: first.revision.id,
    expectedReleaseId: null, idempotencyKey: randomUUID() })).release;
  assert.equal(z.object({ sha256: z.string() }).parse(releaseA.manifest.native).sha256, first.view.sceneSha256);
  const productionA = await enqueue(a, first, 'releaseA-width10', releaseA);
  assert(first.revision.native);
  const advanced = templateRevisionSchema.parse(await api(a, 'revisions', saveHyperframesRevisionRequestSchema.parse({
    family: 'hyperframes', brandId: config.brandId, parentRevisionId: first.revision.id,
    variantId: first.revision.variantId, expectedHeadRevisionId: first.revision.id,
    expectedParentSceneSha256: first.revision.native.sceneSha256, expectedSourceSceneSha256: baseView.sceneSha256,
    idempotencyKey: randomUUID(), edits: { schema: 'hyperframes.edits/1', sourceSha256: baseView.edits.sourceSha256,
      operations: [{ op: 'style', nodeId: 'block', properties: { width: '14px' } }] },
  })));
  await retainNative(advanced, 'width-14-new-head');
  assert.notEqual(advanced.native?.sceneSha256, first.view.sceneSha256);
  const movedHistory = templateRevisionVariantsResponseSchema.parse(await api(a, `revision-variants?${query()}`));
  assert.equal(movedHistory.items.find(value => value.variantId === first.revision.variantId)?.draftHeadRevisionId, advanced.id);
  const releaseB = templateReleaseResultSchema.parse(await api(a, 'releases', { ...releaseTarget, revisionId: second.revision.id,
    expectedReleaseId: releaseA.id, idempotencyKey: randomUUID() })).release;
  const productionB = await enqueue(b, second, 'releaseB-width12', releaseB);
  const replay = hyperframesSceneRenderStatusSchema.parse(await api(a, 'scene/renders', productionA.body)); assert.equal(replay.jobId, productionA.row.id);
  const rollback = templateReleaseResultSchema.parse(await api(a, 'releases/rollback', { ...releaseTarget,
    expectedReleaseId: releaseB.id, releaseId: releaseA.id, idempotencyKey: randomUUID() })); assert.equal(rollback.release.id, releaseA.id);
  evidence.releases = { target, releaseA, releaseB, rollback, queuedIntentReplayJobId: replay.jobId,
    advancedBranchHeadRevisionId: advanced.id, advancedBranchHeadSceneSha256: advanced.native?.sceneSha256 };
  for (const queued of [proof, productionA, productionB]) {
    const held = await snapshot(queued.row.id, `${queued.label}-after-pointer-moves`); assert.equal(held.state, 'ready');
    assert.deepEqual(held.execution_spec, queued.row.execution_spec); assert.deepEqual(held.input_manifest, queued.row.input_manifest);
  }
  rec.record('Proof and production jobs freeze exact revision/source/scene/release pins through promotion, replay and rollback', 'PASS');
  await completePinnedJobs([proof, productionA, productionB], target, releaseA.id, a);
  }
} catch (cause) {
  evidence.failure = { message: cause instanceof Error ? cause.message : String(cause) };
  rec.record('Actual supported-vector pinned render', 'FAIL', cause instanceof Error ? cause.message : String(cause));
} finally {
  clearTimeout(timer); clearInterval(monitor);
  evidence.finishedAt = new Date().toISOString(); evidence.counts = rec.summary();
  writeFileSync(path.join(run, 'observed.json'), `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
  rec.note('Supported static vector fixture only; no PubSub/OIDC, hosted/deployed production, typed Skia, text/fonts/media or general renderer-fidelity qualification.');
  console.log(JSON.stringify({ run, observed: path.join(run, 'observed.json') })); rec.finish({ json: true });
}

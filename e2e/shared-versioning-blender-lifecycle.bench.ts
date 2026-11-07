/** Opt-in actual Blender lifecycle. The owner starts services and declares the evidence run. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statfsSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  type TemplateRevision,
  saveTemplateRevisionRequestSchema,
  sceneTemplateViewSchema,
  templateReleaseListResponseSchema,
  templateReleaseResultSchema,
  templateRevisionSchema,
  templateRevisionVariantsResponseSchema,
  templateSourceSchema,
  templateVersionCommitsResponseSchema,
  templateVersionDiffResponseSchema,
  templateVersionHistoryResponseSchema,
  templateVersionMergePreviewSchema,
  templateVersionResultSchema,
  templateVersioningCandidateSchema,
} from '@continuum/contracts';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { Recorder } from '../../Continuum-Backend/scripts/_bench/recorder';

const rec = new Recorder('forge:shared-versioning-blender-lifecycle:bench');
const configPath = process.env.VERSIONING_BLENDER_CONFIG;
assert(configPath, 'Provide VERSIONING_BLENDER_CONFIG; this bench never starts services.');
const session = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1) });
const config = z.object({
  supabaseUrl: z.string().url(), apiUrl: z.string().url(), libraryUploadUrl: z.string().url().optional(),
  recoverySupabaseUrl: z.string().url().optional(),
  anonKey: z.string().min(1), serviceRoleKey: z.string().min(1), brandId: z.string().uuid(),
  authSession: session, authSessionB: session, stage: z.string().min(1),
  sourcePath: z.string().min(1), sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  bindingId: z.string().uuid().optional(),
  renderBoundary: z.literal('unconfigured-cloud-run'),
}).parse(JSON.parse(readFileSync(configPath, 'utf8')));
const stage = path.resolve(config.stage);
const declaration = z.object({ owner: z.literal('aule-forge-versioning'), prefix: z.string(),
  budgetBytes: z.number().positive(), admissionBytes: z.number().positive(), stopFreeBytes: z.number().positive(),
}).parse(JSON.parse(readFileSync(path.join(stage, 'run.json'), 'utf8')));
assert(declaration.prefix.startsWith('gs://continuum-production-477821-creative-benchmarks/aule-forge-versioning/'));
const uploadUrl = config.libraryUploadUrl ?? `${config.supabaseUrl}/functions/v1/library-upload`;
for (const url of [config.supabaseUrl, config.apiUrl, uploadUrl, config.recoverySupabaseUrl ?? config.supabaseUrl]) assert.equal(new URL(url).hostname, '127.0.0.1');
assert.equal(new URL(config.supabaseUrl).protocol, 'https:', 'Use genuine TLS Storage without weakening download guards.');
const runId = randomUUID(), run = path.join(stage, `blender-lifecycle-${runId}`);
const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const free = () => { const s = statfsSync(stage); return Number(s.bavail) * Number(s.bsize); };
assert(free() >= declaration.admissionBytes, '50 GiB admission floor.');
mkdirSync(path.join(run, 'private'), { recursive: true, mode: 0o700 });
const sourceText = readFileSync(import.meta.path, 'utf8');
writeFileSync(path.join(run, 'bench-source.ts'), sourceText, { flag: 'wx' });
const evidence: Record<string, unknown> = {
  runId, startedAt: new Date().toISOString(), sourceSha256: sha(sourceText),
  approvedGcsPrefix: `${declaration.prefix}blender-lifecycle-${runId}/`, calls: [], artifacts: [],
  qualification: 'Actual loopback Auth, Library, Backend and native Forge writer. No rendered pixels, browser, image-default, hosted or production qualification.',
};
const rows = (key: string) => evidence[key] as object[];
const stop = new AbortController();
const used = (directory: string): number => readdirSync(directory, { withFileTypes: true }).reduce((sum, entry) => {
  if (entry.isSymbolicLink()) return sum;
  const file = path.join(directory, entry.name);
  try { return sum + (entry.isDirectory() ? used(file) : statSync(file).size); }
  catch (cause) { if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return sum; throw cause; }
}, 0);
const deadline = setTimeout(() => stop.abort(), 10 * 60_000);
const monitor = setInterval(() => {
  if (free() < declaration.stopFreeBytes || used(stage) > declaration.budgetBytes) stop.abort();
}, 3000);
async function localFetch(input: RequestInfo | URL, init?: RequestInit) {
  assert(!stop.signal.aborted, 'Owned request/time/storage bound reached.');
  assert.equal(new URL(input instanceof Request ? input.url : String(input)).hostname, '127.0.0.1');
  return fetch(input, { ...init, redirect: 'error',
    signal: AbortSignal.any([stop.signal, AbortSignal.timeout(120_000), ...(init?.signal ? [init.signal] : [])]) });
}
const options = { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: localFetch } };
const admin = createClient(config.supabaseUrl, config.serviceRoleKey, options);
const member = createClient(config.supabaseUrl, config.anonKey, options);
type Actor = { label: string; principalId: string; token: string };
let templateId = '';
async function identity(label: string, token: string): Promise<Actor> {
  const result = await member.auth.getUser(token); assert.ifError(result.error); assert(result.data.user);
  return { label, token, principalId: result.data.user.id };
}
async function request(actor: Actor, url: string, body?: unknown, expectedStatus?: number) {
  const observation = { path: new URL(url).pathname, actor: actor.label, principalId: actor.principalId,
    requestSha256: body === undefined ? null : sha(JSON.stringify(body)), startedAt: new Date().toISOString() };
  rows('calls').push(observation);
  const response = await localFetch(url, { method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${actor.token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result: unknown = await response.json();
  Object.assign(observation, { status: response.status, receivedAt: new Date().toISOString() });
  if (!response.ok) {
    const receipt = `refusal-${randomUUID()}.json`;
    writeFileSync(path.join(run, 'private', receipt), JSON.stringify({ path: observation.path, status: response.status, body: result }), { flag: 'wx', mode: 0o600 });
    Object.assign(observation, { privateReceipt: receipt });
  }
  if (expectedStatus !== undefined) assert.equal(response.status, expectedStatus, `Actual ${observation.path} status`);
  else assert(response.ok, `Actual ${observation.path} refused HTTP${response.status}; inspect private receipt.`);
  return { status: response.status, body: result };
}
const api = (actor: Actor, action: string, body?: unknown, assetId = templateId, status?: number) => request(actor,
  `${config.apiUrl}/api/ai-studio/templates/${assetId}${action.startsWith('?') ? action : `/${action}`}`, body, status);
const query = (extra: Record<string, string> = {}) => new URLSearchParams({ brandId: config.brandId, ...extra });
async function sourceBytes(revision: TemplateRevision, label: string) {
  const row = await admin.schema('media').from('asset_versions').select('id,asset_id,bucket,storage_path,checksum,size_bytes')
    .eq('brand_id', config.brandId).eq('asset_id', revision.sourceAssetId).eq('id', revision.sourceVersionId).single();
  assert.ifError(row.error);
  const pin = z.object({ id: z.string().uuid(), asset_id: z.string().uuid(), bucket: z.string(), storage_path: z.string(),
    checksum: z.string().regex(/^[a-f0-9]{64}$/), size_bytes: z.number().int().positive().max(16 << 20) }).parse(row.data);
  const stored = await admin.storage.from(pin.bucket).download(pin.storage_path); assert.ifError(stored.error); assert(stored.data);
  const bytes = new Uint8Array(await stored.data.arrayBuffer());
  assert.equal(bytes.length, pin.size_bytes); assert.equal(sha(bytes), pin.checksum); assert.equal(sha(bytes), revision.checksum);
  const file = `${label}.blend`; writeFileSync(path.join(run, file), bytes, { flag: 'wx' });
  return { pin, bytes, file };
}
async function view(actor: Actor, revision: TemplateRevision) {
  const result = sceneTemplateViewSchema.parse((await api(actor, `scene?${query({ revisionId: revision.id })}`, undefined, revision.sourceAssetId)).body);
  assert.equal(result.revisionId, revision.id); assert.equal(result.versionId, revision.sourceVersionId);
  assert.deepEqual(result.externals, []);
  return result;
}
async function ingest(actor: Actor) {
  const bytes = readFileSync(config.sourcePath); assert.equal(sha(bytes), config.sourceSha256);
  assert(bytes.length > 0 && bytes.length < (16 << 20), 'Bounded actual .blend fixture.');
  const ticket = z.object({ assetId: z.string().uuid(), bucket: z.string(), path: z.string(), token: z.string() }).parse((await request(actor, uploadUrl,
    { action: 'sign_upload', brandId: config.brandId, fileName: 'forge-template.blend', mimeType: 'application/x-blender', sizeBytes: bytes.length })).body);
  const upload = await member.storage.from(ticket.bucket).uploadToSignedUrl(ticket.path, ticket.token, bytes, { contentType: 'application/x-blender' });
  assert.ifError(upload.error);
  const registered = z.object({ assetId: z.string().uuid(), versionId: z.string().uuid() }).parse((await request(actor, uploadUrl,
    { action: 'register', brandId: config.brandId, assetId: ticket.assetId, bucket: ticket.bucket, storagePath: ticket.path,
      fileName: 'forge-template.blend', mimeType: 'application/x-blender', sizeBytes: bytes.length,
      checksum: config.sourceSha256, integrityState: 'verified' })).body);
  assert.equal(registered.assetId, ticket.assetId); templateId = registered.assetId;
  await api(actor, 'parse/retry', { brandId: config.brandId });
  let source = templateSourceSchema.parse((await api(actor, `?${query()}`)).body);
  const end = Date.now() + 120_000;
  while (source.parseState === 'pending' && Date.now() < end) {
    await new Promise(resolve => setTimeout(resolve, 500));
    source = templateSourceSchema.parse((await api(actor, `?${query()}`)).body);
  }
  assert.equal(source.parseState, 'parsed'); assert.equal(source.family, 'blender'); assert.equal(source.versionId, registered.versionId);
  const variants = templateRevisionVariantsResponseSchema.parse((await api(actor, `revision-variants?${query()}`)).body).items;
  const original = variants.find(value => value.original); assert(original);
  const base = original.revisions.find(value => value.id === original.draftHeadRevisionId); assert(base);
  assert.equal(base.checksum, config.sourceSha256);
  const originalBytes = await sourceBytes(base, 'original'); assert.deepEqual(Buffer.from(originalBytes.bytes), bytes);
  const native = await view(actor, base);
  const text = native.fields.find(field => field.key === 'forge_tagline');
  const number = native.fields.find(field => field.key === 'forge_scale');
  assert.equal(text?.kind, 'text'); assert.equal(text.default, 'hello'); assert.equal(text.exposed, true);
  assert.equal(number?.kind, 'number'); assert.equal(number.default, 1); assert.equal(number.exposed, true);
  assert(native.outputs.some(output => output.id === 'Main/CamWide'));
  const fixturePath = path.join(stage, 'private', `native-blender-fixture-${runId}.json`);
  mkdirSync(path.dirname(fixturePath), { recursive: true, mode: 0o700 });
  writeFileSync(fixturePath, JSON.stringify({ apiUrl: config.apiUrl, supabaseUrl: config.recoverySupabaseUrl ?? config.supabaseUrl,
    anonKey: config.anonKey, serviceRoleKey: config.serviceRoleKey,
    authSession: config.authSession, authSessionB: config.authSessionB, brandId: config.brandId, templateId,
    family: 'blender', outputId: 'Main/CamWide', fieldId: text.key,
    capturedValue: `captured-${runId}`, laterValue: `later-${runId}`, otherValue: `other-${runId}` }), { flag: 'wx', mode: 0o600 });
  evidence.fixture = { templateId, originalRevisionId: base.id, versionId: base.sourceVersionId,
    sourceSha256: config.sourceSha256, bytes: bytes.length, textField: text, independentField: number,
    outputId: 'Main/CamWide', fixturePath, intake: 'Genuine member Library sign/upload/register/parse and independent Storage byte readback.' };
  console.log(JSON.stringify({ event: 'blender-fixture-ready', templateId, fixturePath }));
  return base;
}
async function branch(actor: Actor, base: TemplateRevision) {
  return templateVersionResultSchema.parse((await api(actor, 'branches', { brandId: config.brandId, parentRevisionId: base.id,
    name: `Blender ${actor.label} ${randomUUID().slice(0, 8)}`, idempotencyKey: randomUUID() })).body).revision;
}
async function save(actor: Actor, base: TemplateRevision, values: Record<string, string | number>) {
  const body = saveTemplateRevisionRequestSchema.parse({ brandId: config.brandId, parentRevisionId: base.id,
    variantId: base.variantId, expectedHeadRevisionId: base.id, idempotencyKey: randomUUID(),
    edits: { blender: { values, outputId: 'Main/CamWide' } }, origin: { tool: 'Actual Blender lifecycle qualification' } });
  return templateRevisionSchema.parse((await api(actor, 'revisions', body)).body);
}
async function verify(actor: Actor, revision: TemplateRevision, expected: Record<string, string | number>, label: string, candidateRequired = true) {
  const native = await view(actor, revision);
  const artifact = await sourceBytes(revision, label);
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(native.values?.[key], value, `Saved revision override ${key}`);
    assert.equal(native.fields.find(field => field.key === key)?.default, value, `Actual native reparsed default ${key}`);
  }
  const mappings = await admin.schema('media').from('template_revision_derivations').select('receipt')
    .eq('brand_id', config.brandId).eq('template_id', templateId).eq('revision_id', revision.id);
  assert.ifError(mappings.error);
  const candidates = z.array(z.object({ receipt: templateVersioningCandidateSchema })).parse(mappings.data);
  if (candidateRequired) assert.equal(candidates.length, 1);
  for (const { receipt } of candidates) {
    assert.equal(receipt.qualification, 'verified-bytes'); assert.equal(receipt.format, 'blender');
    assert.equal(receipt.artifact.sha256, artifact.pin.checksum); assert.equal(receipt.artifact.size, artifact.bytes.length);
    assert.equal(receipt.checkout.artifact.sha256, artifact.pin.checksum);
    assert.notEqual(receipt.operationSha256, receipt.artifact.sha256, 'Operation identity is separate from file identity.');
  }
  rows('artifacts').push({ label, revisionId: revision.id, sourceVersionId: revision.sourceVersionId,
    file: artifact.file, sha256: artifact.pin.checksum, bytes: artifact.bytes.length, expected, candidates });
}
const mergeInput = (ours: TemplateRevision, theirs: TemplateRevision) => ({ brandId: config.brandId,
  variantId: ours.variantId, sourceVariantId: theirs.variantId, expectedHeadRevisionId: ours.id, expectedSourceHeadRevisionId: theirs.id });
async function merge(actor: Actor, ours: TemplateRevision, theirs: TemplateRevision, resolutions: Array<{ path: string; choice: 'ours' | 'theirs' }>) {
  const input = mergeInput(ours, theirs);
  const preview = templateVersionMergePreviewSchema.parse((await api(actor, 'merges/preview', input)).body);
  const body = { ...input, previewToken: preview.previewToken, resolutions, idempotencyKey: randomUUID() };
  return { preview, body, result: templateVersionResultSchema.parse((await api(actor, 'merges', body)).body) };
}
async function jobSnapshot(requestId: string) {
  const result = await admin.schema('media').from('client_render_jobs').select('id,state,error_code,execution_spec,input_manifest')
    .eq('brand_id', config.brandId).eq('source_id', `blend:${templateId}`).eq('source_revision', requestId).single();
  assert.ifError(result.error);
  return z.object({ id: z.string().uuid(), state: z.string(), error_code: z.string().nullable(),
    execution_spec: z.object({ template: z.object({ revisionId: z.string().uuid(), releaseId: z.string().uuid().optional(), versionId: z.string().uuid(), sha256: z.string() }).passthrough() }).passthrough(),
    input_manifest: z.unknown(),
  }).parse(result.data);
}
try {
  const [a, b] = await Promise.all([identity('A', config.authSession.access_token), identity('B', config.authSessionB.access_token)]);
  assert.notEqual(a.principalId, b.principalId); evidence.actors = [a, b].map(({ label, principalId }) => ({ label, principalId }));
  const original = await ingest(a); await view(b, original);
  rec.record('Two genuine principals read the authentic uploaded/ingested Blender source with exact byte identity', 'PASS');
  const first = await branch(a, original), second = await branch(b, original);
  const ours = await save(a, first, { forge_tagline: `A-${runId}` });
  const theirs = await save(b, second, { forge_scale: 1.25 });
  await verify(a, ours, { forge_tagline: `A-${runId}` }, 'ours'); await verify(b, theirs, { forge_scale: 1.25 }, 'theirs');
  assert.equal(ours.createdBy, a.principalId); assert.equal(theirs.createdBy, b.principalId);
  rec.record('Both principals branch, edit, save and reopen actual natively written/reparsed Blender files', 'PASS');
  const diff = templateVersionDiffResponseSchema.parse((await api(a, 'diff', { brandId: config.brandId, fromRevisionId: original.id, toRevisionId: ours.id })).body);
  assert(diff.changes.some(change => change.path === '/blender/values/forge_tagline' && change.to === `A-${runId}`));
  evidence.diff = diff;
  const accepted = await merge(a, ours, theirs, []); assert.deepEqual(accepted.preview.conflicts, []);
  const merged = accepted.result.revision; assert.equal(merged.parentRevisionId, ours.id);
  await verify(a, merged, { forge_tagline: `A-${runId}`, forge_scale: 1.25 }, 'merged');
  const commits = templateVersionCommitsResponseSchema.parse((await api(a, `commits?${query()}`)).body).items;
  assert.equal(commits.find(commit => commit.revisionId === merged.id)?.mergeParentRevisionId, theirs.id);
  const replay = templateVersionResultSchema.parse((await api(a, 'merges', accepted.body)).body);
  assert.equal(replay.replayed, true); assert.equal(replay.revision.id, merged.id);
  evidence.independentMerge = { preview: accepted.preview, revisionId: merged.id, mergeParentRevisionId: theirs.id, replay: replay.replayed };
  rec.record('Semantic diff and independent merge append both parents and a verified artifact; identical intent replays', 'PASS');
  const conflictBranch = await branch(b, ours);
  const conflicting = await save(b, conflictBranch, { forge_tagline: `B-${runId}` });
  const changed = await save(a, merged, { forge_tagline: `A2-${runId}` });
  await verify(b, conflicting, { forge_tagline: `B-${runId}` }, 'conflicting');
  await verify(a, changed, { forge_tagline: `A2-${runId}`, forge_scale: 1.25 }, 'changed');
  const staleSave = await api(a, 'revisions', saveTemplateRevisionRequestSchema.parse({ brandId: config.brandId, parentRevisionId: merged.id,
    variantId: merged.variantId, expectedHeadRevisionId: merged.id, idempotencyKey: randomUUID(),
    edits: { blender: { values: { forge_tagline: `stale-${runId}` }, outputId: 'Main/CamWide' } } }), templateId, 409);
  assert.equal(z.object({ error: z.string() }).parse(staleSave.body).error, 'template_revision_head_conflict');
  const conflictInput = mergeInput(changed, conflicting);
  const conflict = templateVersionMergePreviewSchema.parse((await api(a, 'merges/preview', conflictInput)).body);
  assert.equal(conflict.conflicts.length, 1); assert.equal(conflict.conflicts[0]?.path, '/blender/values/forge_tagline');
  assert.equal(conflict.conflicts[0]?.ours, `A2-${runId}`); assert.equal(conflict.conflicts[0]?.theirs, `B-${runId}`);
  const unresolved = await api(a, 'merges', { ...conflictInput, previewToken: conflict.previewToken, resolutions: [], idempotencyKey: randomUUID() }, templateId, 409);
  assert.equal(z.object({ error: z.string() }).parse(unresolved.body).error, 'template_merge_conflicts_unresolved');
  const resolved = await merge(a, changed, conflicting, [{ path: '/blender/values/forge_tagline', choice: 'theirs' }]);
  await verify(a, resolved.result.revision, { forge_tagline: `B-${runId}`, forge_scale: 1.25 }, 'resolved');
  evidence.conflict = { preview: conflict, resolvedRevisionId: resolved.result.revision.id };
  rec.record('Overlapping native changes retain both proposals and require explicit reviewed resolution', 'PASS');
  const reverted = templateVersionResultSchema.parse((await api(a, 'reverts', { brandId: config.brandId, variantId: merged.variantId,
    restoreRevisionId: merged.id, expectedHeadRevisionId: resolved.result.revision.id, idempotencyKey: randomUUID() })).body).revision;
  assert.notEqual(reverted.id, merged.id); assert.equal(reverted.parentRevisionId, resolved.result.revision.id);
  assert.equal(reverted.checksum, merged.checksum);
  await verify(a, reverted, { forge_tagline: `A-${runId}`, forge_scale: 1.25 }, 'restored');
  await verify(a, merged, { forge_tagline: `A-${runId}`, forge_scale: 1.25 }, 'historical-merged');
  const history = templateVersionHistoryResponseSchema.parse((await api(a, `history?${query({ limit: '500' })}`)).body);
  assert(history.items.some(event => event.principalId === a.principalId)); assert(history.items.some(event => event.principalId === b.principalId));
  assert(history.items.some(event => event.command === 'edit_merge_commit'));
  evidence.recovery = { restoredRevisionId: reverted.id, restoredFromRevisionId: merged.id, operationCount: history.items.length,
    operations: history.items, note: 'Process-crash and dirty-working-copy checks are root-owned Aulë scenarios.' };
  rec.record('Restore appends history, retains exact historical bytes and preserves permanent authenticated operation evidence', 'PASS');
  const releases = templateReleaseListResponseSchema.parse((await api(a, `releases?${query({ includeTargets: 'true' })}`)).body);
  const target = releases.targets?.find(value => value.family === 'blender' && (!config.bindingId || value.bindingId === config.bindingId));
  assert(target, 'A genuine enabled render workspace binding is required; never synthesize a binding for a passing release.');
  const releaseInput = { brandId: config.brandId, bindingId: target.bindingId, templateKey: target.templateKey, expectedReleaseId: null };
  const proofRequestId = randomUUID();
  await api(a, 'scene/renders', { brandId: config.brandId, versionId: merged.sourceVersionId, revisionId: merged.id,
    outputId: 'Main/CamWide', values: {}, requestId: proofRequestId }, templateId, 503);
  const proof = await jobSnapshot(proofRequestId);
  assert.equal(proof.state, 'failed'); assert.equal(proof.error_code, 'scene_job_unconfigured'); assert.equal(proof.execution_spec.template.revisionId, merged.id);
  assert.equal(proof.execution_spec.template.releaseId, undefined);
  const promoted = templateReleaseResultSchema.parse((await api(a, 'releases', { ...releaseInput, revisionId: merged.id, idempotencyKey: randomUUID() })).body);
  const source = z.object({ versionId: z.string().uuid(), sha256: z.string() }).parse(promoted.release.manifest.source);
  assert.equal(source.versionId, merged.sourceVersionId); assert.equal(source.sha256, merged.checksum);
  const productionRequestId = randomUUID();
  await api(a, 'scene/renders', { brandId: config.brandId, versionId: merged.sourceVersionId, releaseId: promoted.release.id,
    bindingId: target.bindingId, templateKey: target.templateKey, outputId: 'Main/CamWide', values: {}, requestId: productionRequestId }, templateId, 503);
  const queued = await jobSnapshot(productionRequestId);
  assert.equal(queued.state, 'failed'); assert.equal(queued.error_code, 'scene_job_unconfigured'); assert.equal(queued.execution_spec.template.revisionId, merged.id);
  assert.equal(queued.execution_spec.template.releaseId, promoted.release.id); assert.equal(queued.execution_spec.template.sha256, merged.checksum);
  assert.equal(queued.execution_spec.template.versionId, merged.sourceVersionId);
  const next = templateReleaseResultSchema.parse((await api(a, 'releases', { ...releaseInput, expectedReleaseId: promoted.release.id,
    revisionId: resolved.result.revision.id, idempotencyKey: randomUUID() })).body);
  const staleRelease = await api(a, 'releases', { ...releaseInput, revisionId: reverted.id, idempotencyKey: randomUUID() }, templateId, 409);
  assert.equal(z.object({ error: z.string() }).parse(staleRelease.body).error, 'template_release_head_conflict');
  const rolledBack = templateReleaseResultSchema.parse((await api(a, 'releases/rollback', { ...releaseInput,
    expectedReleaseId: next.release.id, releaseId: promoted.release.id, idempotencyKey: randomUUID() })).body);
  assert.equal(rolledBack.release.id, promoted.release.id); assert.deepEqual(await jobSnapshot(productionRequestId), queued);
  assert.deepEqual(await jobSnapshot(proofRequestId), proof);
  evidence.releases = { target, first: promoted, second: next, rollback: rolledBack, durableProofJob: proof, durableProductionJob: queued,
    qualification: 'Actual release CAS/rollback and durable render enqueue pins; genuine scene_job_unconfigured refusal. No render dispatch or pixels.' };
  rec.record('Release CAS, rollback and durable render pins survive pointer changes with honest unconfigured-renderer refusal', 'PASS');
} catch (cause) {
  evidence.failure = { message: cause instanceof Error ? cause.message : String(cause) };
  rec.record('Actual Blender lifecycle', 'FAIL', cause instanceof Error ? cause.message : String(cause));
} finally {
  clearTimeout(deadline); clearInterval(monitor);
  evidence.finishedAt = new Date().toISOString(); evidence.counts = rec.summary();
  writeFileSync(path.join(run, 'observed.json'), `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
  rec.note('Real local native lifecycle only. Image dependencies, rendered pixels, hosted behavior and production acceptance remain unqualified.');
  console.log(JSON.stringify({ run, observed: path.join(run, 'observed.json') }));
  rec.finish({ json: true });
}

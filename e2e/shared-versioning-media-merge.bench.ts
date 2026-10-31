/** Opt-in actual collected-media merge. Run only after the owner declares MEDIA READY. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statfsSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  type TemplateOperationInput,
  type TemplateParse,
  type TemplateRevision,
  saveTemplateRevisionRequestSchema,
  templateLayerInventorySchema,
  templateOperationInputSchema,
  templateParseSchema,
  templateRevisionSchema,
  templateRevisionVariantsResponseSchema,
  templateSourceSchema,
  templateVersionHistoryAppendResponseSchema,
  templateVersioningCandidateSchema,
  templateVersionMergePreviewSchema,
  templateVersionResultSchema,
} from '@continuum/contracts';
import { createClient } from '@supabase/supabase-js';
import { unzipSync } from 'fflate';
import { z } from 'zod';
import { Recorder } from '../../Continuum-Backend/scripts/_bench/recorder';

const rec = new Recorder('forge:shared-versioning-media-merge:bench');
const configPath = process.env.VERSIONING_MEDIA_MERGE_CONFIG;
assert(configPath, 'Provide VERSIONING_MEDIA_MERGE_CONFIG; this bench never starts services.');
const session = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1) });
const config = z.object({
  supabaseUrl: z.string().url(), apiUrl: z.string().url(), libraryUploadUrl: z.string().url().optional(),
  anonKey: z.string().min(1), serviceRoleKey: z.string().min(1), brandId: z.string().uuid(),
  authSession: session, authSessionB: session, nativeWalPath: z.string().min(1),
  nativeRequestsPath: z.string().optional(), artworkRepairObservationsPath: z.string().optional(),
  sourcePackagePath: z.string().optional(), stage: z.string().optional(),
  layer: z.object({ compId: z.number().int().positive(), layerId: z.number().int().positive() }).optional(),
}).parse(JSON.parse(readFileSync(configPath, 'utf8')));
const stage = path.resolve(process.env.VERSIONING_MEDIA_MERGE_STAGE ?? config.stage ?? path.dirname(path.dirname(configPath)));
const declaration = z.object({ owner: z.literal('aule-forge-versioning'), prefix: z.string(), budgetBytes: z.number(),
  admissionBytes: z.number(), stopFreeBytes: z.number() }).parse(JSON.parse(readFileSync(path.join(stage, 'run.json'), 'utf8')));
assert(declaration.prefix.startsWith('gs://continuum-production-477821-creative-benchmarks/aule-forge-versioning/'));
const uploadUrl = config.libraryUploadUrl ?? `${config.supabaseUrl}/functions/v1/library-upload`;
for (const url of [config.supabaseUrl, config.apiUrl, uploadUrl]) assert.equal(new URL(url).hostname, '127.0.0.1', 'Loopback qualification only.');
assert.equal(new URL(config.supabaseUrl).protocol, 'https:', 'Use the genuine TLS Storage gateway; never weaken the Forge HTTPS guard.');
const runId = randomUUID(), run = path.join(stage, `media-merge-${runId}`), startedAt = new Date().toISOString();
const sha = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const free = () => { const s = statfsSync(stage); return Number(s.bavail) * Number(s.bsize); };
assert(free() >= declaration.admissionBytes, '50 GiB admission floor.');
mkdirSync(path.join(run, 'private'), { recursive: true, mode: 0o700 });
const sourceText = readFileSync(import.meta.path, 'utf8');
writeFileSync(path.join(run, 'bench-source.ts'), sourceText, { flag: 'wx' });
const evidence: Record<string, unknown> = { owner: declaration.owner, runId, startedAt, sourceSha256: sha(sourceText),
  approvedGcsPrefix: `${declaration.prefix}media-merge-${runId}/`,
  qualification: 'Actual loopback Auth, Library upload/register/parse and two-user native materialization. No browser UI, renderer fidelity, hosted or production acceptance.',
  calls: [], packages: [], media: [], warnings: [],
  budget: { stageBytes: declaration.budgetBytes, durationMs: 10 * 60_000, serviceSupervision: 'Separate root-owned supervisor; this bench only aborts its own requests.' } };
const rows = (name: string) => evidence[name] as object[];
const stop = new AbortController();
const used = (directory: string): number => {
  try { return readdirSync(directory, { withFileTypes: true }).reduce((sum, entry) => {
    if (entry.isSymbolicLink()) return sum;
    const file = path.join(directory, entry.name);
    try { return sum + (entry.isDirectory() ? used(file) : statSync(file).size); }
    catch (cause) { if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return sum; throw cause; }
  }, 0); } catch (cause) { if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return 0; throw cause; }
};
const deadline = setTimeout(() => stop.abort(), 10 * 60_000);
const monitor = setInterval(() => {
  if (free() < declaration.stopFreeBytes || used(stage) > declaration.budgetBytes) stop.abort();
}, 3000);
async function localFetch(input: RequestInfo | URL, init?: RequestInit) {
  assert(!stop.signal.aborted, 'Owned request/storage/time bound reached.');
  const url = new URL(input instanceof Request ? input.url : String(input));
  assert.equal(url.hostname, '127.0.0.1', 'No external source/provider access from the bench.');
  return fetch(input, { ...init, redirect: 'error', signal: AbortSignal.any([stop.signal, AbortSignal.timeout(120_000), ...(init?.signal ? [init.signal] : [])]) });
}
const admin = createClient(config.supabaseUrl, config.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: localFetch },
});
const member = createClient(config.supabaseUrl, config.anonKey, {
  auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: localFetch },
});
type Actor = { label: string; token: string; principalId: string };
let templateId = '';
async function request(actor: Actor, url: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') {
  const observation = { actor: actor.label, principalId: actor.principalId, path: new URL(url).pathname,
    method, requestSha256: body === undefined ? null : sha(JSON.stringify(body)), startedAt: new Date().toISOString() };
  rows('calls').push(observation);
  const response = await localFetch(url, { method, headers: { authorization: `Bearer ${actor.token}`,
    ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result: unknown = await response.json();
  Object.assign(observation, { status: response.status, receivedAt: new Date().toISOString() });
  if (!response.ok) {
    // Raw refusal bodies can contain signed URLs: retain them only in excluded private staging.
    const file = `http-refusal-${randomUUID()}.json`;
    writeFileSync(path.join(run, 'private', file), JSON.stringify({ path: observation.path, status: response.status, body: result }), { flag: 'wx', mode: 0o600 });
    throw new Error(`Actual ${observation.path} refused HTTP${response.status}; private receipt ${file}`);
  }
  return { status: response.status, body: result };
}
const api = (actor: Actor, action = '', body?: unknown, assetId = templateId) => request(actor,
  `${config.apiUrl}/api/ai-studio/templates/${assetId}${action.startsWith('?') ? action : action ? `/${action}` : ''}`, body);
const query = () => new URLSearchParams({ brandId: config.brandId });
const entries = (bytes: Uint8Array) => {
  assert(bytes.length < 16 * 1024 ** 2, 'Bounded collected source/native package.');
  return unzipSync(bytes);
};
const sourcePackage = readFileSync(config.sourcePackagePath ?? path.resolve(import.meta.dir, '../../../Aule/tests/e2e/IMG+LOGO.zip'));
const originalFiles = entries(sourcePackage);
const footage = Object.entries(originalFiles).filter(([name]) => /\.(?:ai|png|jpe?g)$/i.test(name));
const rasters = new Set(footage.filter(([name]) => /\.(?:png|jpe?g)$/i.test(name)).map(([, bytes]) => sha(bytes)));
const sourceAep = Object.entries(originalFiles).filter(([name]) => /\.aep$/i.test(name));
const sourcePackageSha256 = '047192d4542e0710817d705a14bf684aaf2340f2e4ba2e446c25ecbf3b7b79c4';
const sourceAepSha256 = 'b7e4ecce3050f573117bab92aabc9706a2e4b5dd8e4ad7c50b05dd0bcd2fb29a';
const admittedRasters = new Set(rasters);
const generatedPixels = new Map<string, { sha256: string; bytes: number; inputPixel: string; artwork: string; layerId: number }>();
let admittedPackageSha256 = sourcePackageSha256, admittedAepSha256 = sourceAepSha256;
let originalVersionId = '';
let layer: { compId: number; layerId: number; x: number; y: number };
async function identity(label: string, token: string): Promise<Actor> {
  const result = await member.auth.getUser(token); assert.ifError(result.error); assert(result.data.user);
  return { label, token, principalId: result.data.user.id };
}
async function storedSourceVersion(versionId: string) {
  const result = await admin.schema('media').from('asset_versions').select('id,asset_id,bucket,storage_path,checksum,size_bytes')
    .eq('brand_id', config.brandId).eq('asset_id', templateId).eq('id', versionId).single();
  assert.ifError(result.error);
  const pin = z.object({ id: z.string().uuid(), asset_id: z.string().uuid(), bucket: z.string(), storage_path: z.string(),
    checksum: z.string().regex(/^[a-f0-9]{64}$/), size_bytes: z.number().int().positive() }).parse(result.data);
  const stored = await admin.storage.from(pin.bucket).download(pin.storage_path); assert.ifError(stored.error); assert(stored.data);
  const bytes = new Uint8Array(await stored.data.arrayBuffer());
  assert.equal(sha(bytes), pin.checksum); assert.equal(bytes.length, pin.size_bytes);
  return { pin, bytes, files: entries(bytes) };
}
async function originalUploadProof() {
  const original = await storedSourceVersion(originalVersionId);
  assert.equal(original.pin.checksum, sourcePackageSha256); assert.equal(original.bytes.length, sourcePackage.length);
  assert(original.files[sourceAep[0]![0]]); assert.equal(sha(original.files[sourceAep[0]![0]]!), sourceAepSha256);
  for (const [name, bytes] of footage) { assert(original.files[name]); assert.equal(sha(original.files[name]!), sha(bytes)); }
  const file = path.join(run, 'original-upload.zip');
  if (existsSync(file)) assert.equal(sha(readFileSync(file)), sourcePackageSha256);
  else writeFileSync(file, original.bytes, { flag: 'wx' });
  return original.pin;
}
function qualifyRepairObservation(files: Record<string, Uint8Array>, checksum: string, bytes: number, repairs: number) {
  assert(config.artworkRepairObservationsPath, 'Changed source requires the actual transparent artwork-repair observation, not inferred input pixels.');
  assert(statSync(config.artworkRepairObservationsPath).size < 8 * 1024 ** 2, 'Bounded repair observation metadata.');
  const repairSchema = z.object({ requestId: z.string().uuid(), observedAt: z.string(), filename: z.string(),
    inputPackageSha256: z.string().regex(/^[a-f0-9]{64}$/), inputAepSha256: z.string(),
    originalFiles: z.array(z.object({ path: z.string(), sha256: z.string(), bytes: z.number().int().nonnegative() })),
    artwork: z.array(z.object({ file: z.string(), source: z.enum(['illustrator', 'photoshop']), width: z.number(), height: z.number(),
      layers: z.array(z.object({ id: z.number().int(), name: z.string(), pixel: z.string(), sha256: z.string(), bytes: z.number().int().positive() })) })),
    response: z.object({ status: z.number(), checksum: z.string(), bytes: z.number().int().positive(), repairs: z.number().int().positive() }),
  });
  const summarySchema = z.object({ filename: z.string(), inputAepSha256: z.string(), observedAt: z.string(),
    response: z.object({ status: z.number(), checksum: z.string().optional() }) });
  const observations: unknown[] = readFileSync(config.artworkRepairObservationsPath, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
  const matches = observations.filter(value => {
    const summary = summarySchema.safeParse(value);
    return summary.success && summary.data.filename === 'IMG+LOGO.zip' && summary.data.inputAepSha256 === sourceAepSha256 &&
      summary.data.response.status === 200 && summary.data.response.checksum === checksum && Date.parse(summary.data.observedAt) >= Date.parse(startedAt);
  }).map(value => repairSchema.parse(value));
  assert.equal(matches.length, 1, 'Bind the exact newly completed repair request to its real output; stale observations are not admission evidence.');
  const observation = matches[0]!;
  assert.equal(observation.response.bytes, bytes); assert.equal(observation.response.repairs, repairs);
  const inputFiles = observation.originalFiles.filter(file => !file.path.endsWith('/'));
  const expectedFiles = Object.entries(originalFiles).filter(([name]) => !name.endsWith('/'));
  assert.deepEqual(inputFiles.map(file => file.path).sort(), expectedFiles.map(([name]) => name).sort());
  for (const [name, data] of expectedFiles) {
    const input = inputFiles.find(file => file.path === name); assert(input);
    assert.equal(input.sha256, sha(data)); assert.equal(input.bytes, data.length);
  }
  const directory = config.nativeRequestsPath ?? path.join(path.dirname(config.nativeWalPath), 'versioning/requests');
  const readEvent = (sequence: number) => {
    const file = path.join(directory, observation.requestId, `${sequence}.json`);
    assert(statSync(file).size < 300 * 1024, 'Bounded immutable repair request journal.');
    const record = z.object({ sha256: z.string(), event: z.unknown() }).parse(JSON.parse(readFileSync(file, 'utf8')));
    assert.equal(record.sha256, sha(JSON.stringify(record.event))); return record;
  };
  const first = readEvent(1), last = readEvent(2);
  const request = z.object({ id: z.string().uuid(), requestId: z.string().uuid(), command: z.literal('/v1/aep/repair-artwork'),
    request: z.object({ filename: z.literal('IMG+LOGO.zip'), inlineBase64: z.object({ sha256: z.string() }), artwork: z.array(z.unknown()) }) }).parse(first.event);
  const terminal = z.object({ requestId: z.string().uuid(), outcome: z.literal('succeeded'), causedBy: z.array(z.string()),
    previousEventSha256: z.string(), result: z.object({ artifactSha256: z.string() }) }).parse(last.event);
  assert.equal(request.requestId, observation.requestId); assert.equal(terminal.requestId, observation.requestId);
  assert.equal(request.request.inlineBase64.sha256, observation.inputPackageSha256);
  assert.equal(terminal.result.artifactSha256, checksum); assert.equal(terminal.causedBy[0], request.id);
  assert.equal(terminal.previousEventSha256, first.sha256);
  assert.equal(request.request.artwork.length, observation.artwork.length);
  let count = 0;
  for (const artwork of observation.artwork) {
    assert(footage.some(([name]) => name === artwork.file && /\.ai$/i.test(name)), 'Generated raster inputs must belong to the exact collected Illustrator file.');
    const recorded = z.array(z.object({ file: z.string(), source: z.string(), width: z.number(), height: z.number(),
      layers: z.array(z.object({ id: z.number(), name: z.string(), pixel: z.string() })) })).parse(request.request.artwork).find(value => value.file === artwork.file);
    assert(recorded); assert.equal(recorded.source, artwork.source); assert.equal(recorded.width, artwork.width); assert.equal(recorded.height, artwork.height);
    assert.equal(recorded.layers.length, artwork.layers.length);
    const folder = path.posix.join(path.posix.dirname(sourceAep[0]![0]), '(Footage)', 'ForgeArtwork', sha(`${sourceAep[0]![0]}:${artwork.file}`).slice(0, 16));
    for (const leaf of artwork.layers) {
      assert(recorded.layers.some(value => value.id === leaf.id && value.name === leaf.name && value.pixel === leaf.pixel));
      assert(leaf.pixel.startsWith('__forge_artwork_pixels/'));
      const output = path.posix.join(folder, `${leaf.id}.png`), pixel = files[output]; assert(pixel, 'Derived package must contain every actual supplied artwork pixel.');
      assert.equal(sha(pixel), leaf.sha256); assert.equal(pixel.length, leaf.bytes);
      assert.equal(Buffer.from(pixel.subarray(0, 8)).toString('hex'), '89504e470d0a1a0a');
      generatedPixels.set(output, { sha256: leaf.sha256, bytes: leaf.bytes, inputPixel: leaf.pixel, artwork: artwork.file, layerId: leaf.id });
      admittedRasters.add(leaf.sha256); count++;
    }
  }
  assert(count > 0, 'Changed artwork source requires independently observed real raster input bytes.');
  return { ...observation, immutableRequestSha256: first.sha256, immutableResponseSha256: last.sha256,
    qualification: 'Actual unchanged request/response transport observation joined by Forge response-header request ID to immutable request journal and registered artifact.' };
}
async function qualifyAdmittedSource(versionId: string | null, parse: TemplateParse) {
  assert(versionId && parse.structure);
  const original = await originalUploadProof();
  const admitted = await storedSourceVersion(versionId);
  const aeps = Object.entries(admitted.files).filter(([name]) => /\.aep$/i.test(name)); assert.equal(aeps.length, 1);
  assert.equal(parse.structure.sourcePackageChecksum, admitted.pin.checksum);
  assert.equal(parse.structure.sourceAepChecksum, sha(aeps[0]![1]));
  for (const [name, bytes] of footage) { assert(admitted.files[name]); assert.equal(sha(admitted.files[name]!), sha(bytes)); }
  if (versionId === originalVersionId) {
    assert.equal(admitted.pin.checksum, sourcePackageSha256); assert.equal(sha(aeps[0]![1]), sourceAepSha256);
    evidence.admission = { kind: 'original unchanged source', originalVersion: original, admittedVersion: admitted.pin };
    return;
  }
  assert.notEqual(admitted.pin.checksum, sourcePackageSha256); assert.notEqual(sha(aeps[0]![1]), sourceAepSha256);
  const lineage = await admin.schema('media').from('asset_lineage').select('source_asset_id,source_version_id,derived_asset_id,derived_version_id,operation,parameters')
    .eq('brand_id', config.brandId).eq('source_asset_id', templateId).eq('source_version_id', originalVersionId)
    .eq('derived_asset_id', templateId).eq('derived_version_id', versionId).eq('operation', 'forge_artwork_repair');
  assert.ifError(lineage.error);
  const links = z.array(z.object({ source_asset_id: z.string().uuid(), source_version_id: z.string().uuid(),
    derived_asset_id: z.string().uuid(), derived_version_id: z.string().uuid(), operation: z.literal('forge_artwork_repair'),
    parameters: z.object({ checksum: z.string(), layers: z.number().int().positive() }) })).parse(lineage.data);
  assert.equal(links.length, 1, 'A changed source requires the exact persisted original-to-derived repair relationship.');
  const link = links[0]!; assert.equal(link.parameters.checksum, admitted.pin.checksum);
  assert.equal(admitted.pin.storage_path, `${config.brandId}/${templateId}/revisions/artwork-${originalVersionId}-${admitted.pin.checksum}.zip`);
  const events = await admin.schema('media').from('template_source_events').select('id,at,stage,level,message')
    .eq('brand_id', config.brandId).eq('asset_id', templateId).order('at', { ascending: true }).limit(200);
  assert.ifError(events.error);
  const conversion = events.data?.find(event => event.message.startsWith(`Converted ${link.parameters.layers} linked artwork layer(s);`));
  assert(conversion, 'The exact conversion needs its actual source event, not inferred provenance.');
  const observedRepair = qualifyRepairObservation(admitted.files, admitted.pin.checksum, admitted.bytes.length, link.parameters.layers);
  admittedPackageSha256 = admitted.pin.checksum; admittedAepSha256 = sha(aeps[0]![1]);
  writeFileSync(path.join(run, 'admitted-derived.zip'), admitted.bytes, { flag: 'wx' });
  evidence.admission = { kind: 'registered linked-artwork repair', originalVersion: original, admittedVersion: admitted.pin,
    originalAepSha256: sourceAepSha256, admittedAepSha256, lineage: link, sourceEvent: conversion,
    actualRepairObservation: observedRepair, generatedPixels: [...generatedPixels].map(([name, pixel]) => ({ name, ...pixel })),
    qualification: 'Exact original upload and derived package/version verified independently; real generated input PNGs match derived file bytes. No visual fidelity claim.' };
}
async function ingest(actor: Actor) {
  assert.equal(sha(sourcePackage), sourcePackageSha256, 'Use unchanged real collected user bytes.');
  assert.equal(sourceAep.length, 1); assert.equal(sha(sourceAep[0]![1]), sourceAepSha256);
  assert.equal(footage.length, 4); assert.equal(rasters.size, 3);
  const ticket = z.object({ assetId: z.string().uuid(), bucket: z.string(), path: z.string(), token: z.string() }).parse((await request(actor, uploadUrl,
    { action: 'sign_upload', brandId: config.brandId, fileName: 'IMG+LOGO.zip', mimeType: 'application/zip', sizeBytes: sourcePackage.length })).body);
  const uploaded = await member.storage.from(ticket.bucket).uploadToSignedUrl(ticket.path, ticket.token, sourcePackage, { contentType: 'application/zip' });
  assert.ifError(uploaded.error);
  const readback = await admin.storage.from(ticket.bucket).download(ticket.path); assert.ifError(readback.error); assert(readback.data);
  assert.equal(sha(new Uint8Array(await readback.data.arrayBuffer())), sourcePackageSha256);
  const registered = z.object({ assetId: z.string().uuid(), versionId: z.string().uuid() }).parse((await request(actor, uploadUrl,
    { action: 'register', brandId: config.brandId, assetId: ticket.assetId, bucket: ticket.bucket, storagePath: ticket.path,
      fileName: 'IMG+LOGO.zip', mimeType: 'application/zip', sizeBytes: sourcePackage.length, checksum: sourcePackageSha256, integrityState: 'verified' })).body);
  assert.equal(registered.assetId, ticket.assetId); templateId = registered.assetId; originalVersionId = registered.versionId;
  evidence.fixture = { templateId, versionId: registered.versionId, packageSha256: sourcePackageSha256,
    innerAepSha256: sourceAepSha256, bytes: sourcePackage.length,
    originalFootage: footage.map(([name, bytes]) => ({ name, bytes: bytes.length, sha256: sha(bytes) })),
    setup: 'Actual member-authenticated Library sign/upload/register, real Storage readback and actual Backend parse. No fabricated source rows or direct save RPC.' };
  await api(actor, 'parse/retry', { brandId: config.brandId });
  let source = templateSourceSchema.parse((await api(actor, `?${query()}`)).body);
  const end = Date.now() + 120_000;
  while (source.parseState === 'pending' && Date.now() < end) {
    await new Promise(resolve => setTimeout(resolve, 500));
    source = templateSourceSchema.parse((await api(actor, `?${query()}`)).body);
  }
  assert.equal(source.parseState, 'parsed'); assert(source.parse); assert(source.parse.structure);
  await qualifyAdmittedSource(source.versionId, source.parse);
  assert(source.parse.slots.some(slot => slot.kind === 'image'), 'A real media-bearing source must exercise image-default extraction.');
  const variants = templateRevisionVariantsResponseSchema.parse((await api(actor, `revision-variants?${query()}`)).body).items;
  const original = variants.find(value => value.original); assert(original);
  const base = original.revisions.find(value => value.id === original.draftHeadRevisionId); assert(base);
  assert.equal(base.sourceAssetId, templateId); assert.equal(base.sourceVersionId, source.versionId);
  assert.equal(base.checksum, admittedPackageSha256, 'Registry base must pin the exact qualified original or derived source.');
  const inventoryQuery = new URLSearchParams({ brandId: config.brandId, versionId: base.sourceVersionId, revisionId: base.id });
  const inventory = templateLayerInventorySchema.parse((await api(actor, `layers?${inventoryQuery}`, undefined, base.sourceAssetId)).body);
  const editable = inventory.layers.find(value => {
    if (config.layer && (value.compId !== config.layer.compId || value.layerId !== config.layer.layerId)) return false;
    const native = source.parse!.structure!.comps.find(comp => comp.id === value.compId)?.layers.find(row => row.id === value.layerId)?.positionSource;
    return !value.transformLocks?.position && native?.kind === 'explicit' && native.value.length >= 2 &&
      typeof value.x === 'number' && typeof value.y === 'number' && value.x === native.value[0] && value.y === native.value[1];
  });
  assert(editable && typeof editable.x === 'number' && typeof editable.y === 'number', 'Actual source needs an admitted explicit editable position; never reuse another fixture’s IDs.');
  const native = source.parse.structure.comps.find(comp => comp.id === editable.compId)?.layers.find(row => row.id === editable.layerId)?.positionSource;
  assert(native?.kind === 'explicit'); assert.equal(editable.x, native.value[0]); assert.equal(editable.y, native.value[1]);
  layer = { compId: editable.compId, layerId: editable.layerId, x: editable.x, y: editable.y };
  evidence.layer = { ...layer, name: editable.name, selection: 'Rust identity joined to actual admitted layer inventory and position locks, never by name.' };
  await mediaProof(base, source.parse, 'original');
  return base;
}
async function branch(actor: Actor, base: TemplateRevision) {
  return templateVersionResultSchema.parse((await api(actor, 'branches', { brandId: config.brandId, parentRevisionId: base.id,
    name: `Media ${actor.label} ${runId.slice(0, 8)}`, idempotencyKey: randomUUID(), message: 'Branch exact collected source for real media merge qualification' })).body).revision;
}
async function save(actor: Actor, base: TemplateRevision, change: { x?: number; y?: number }) {
  const operation: TemplateOperationInput = { id: randomUUID(), workingCopyId: randomUUID(), sequence: 1,
    command: 'qualification_media_position_save', baseRevisionId: base.id, channel: 'api', outcome: 'requested',
    affectedObjects: [`aep:${layer.compId}:${layer.layerId}`], changes: { label: actor.label, change,
      qualification: 'Actual API save request, not an invented UI action or recovered upstream history' },
    causedBy: [], evidence: 'recorded', origin: { tool: 'Collected-media merge qualification' } };
  const appended = templateVersionHistoryAppendResponseSchema.parse((await api(actor, 'history', { brandId: config.brandId, operations: [operation] })).body).items;
  assert.equal(appended[0]?.id, operation.id); assert.equal(appended[0]?.principalId, actor.principalId);
  const body = saveTemplateRevisionRequestSchema.parse({ brandId: config.brandId, parentRevisionId: base.id,
    variantId: base.variantId, expectedHeadRevisionId: base.id, idempotencyKey: randomUUID(),
    edits: { layers: [{ compId: layer.compId, layerId: layer.layerId, ...change }], slots: [], orders: [] },
    operations: [operation], operationCoverage: { workingCopyId: operation.workingCopyId, throughSequence: 1 } });
  const result = await api(actor, 'revisions', body); assert.equal(result.status, 201);
  const revision = templateRevisionSchema.parse(result.body); assert.equal(revision.createdBy, actor.principalId);
  const link = await admin.schema('media').from('template_revision_operation_links').select('operation_id')
    .eq('brand_id', config.brandId).eq('template_id', templateId).eq('revision_id', revision.id).eq('operation_id', operation.id);
  assert.ifError(link.error); assert.equal(link.data?.length, 1);
  return revision;
}
async function mediaProof(revision: TemplateRevision, parse: TemplateParse, label: string) {
  const expectedPairs = parse.slots.filter(slot => slot.kind === 'image').flatMap(slot => slot.comps.map(comp => ({ slotKey: slot.key, comp })));
  assert.equal(expectedPairs.length, 5, 'This exact collected fixture retains all five admitted image-slot/comp pairs.');
  const source = await admin.schema('media').from('template_sources').select('version_id,parse_state,parse_error,parsed_at')
    .eq('brand_id', config.brandId).eq('asset_id', revision.sourceAssetId).eq('version_id', revision.sourceVersionId).single();
  assert.ifError(source.error); assert(source.data?.parsed_at); assert.equal(source.data.parse_state, 'parsed'); assert.equal(source.data.parse_error, null);
  const defaultsSchema = z.array(z.object({ comp: z.string(), slot_key: z.string(), media_asset_id: z.string().uuid(), media_version_id: z.string().uuid() }));
  const eventsSchema = z.array(z.object({ id: z.string().uuid(), at: z.string(), stage: z.string(), level: z.string(), message: z.string() }));
  const waitingAt = Date.now(), until = waitingAt + 120_000;
  let defaults: z.infer<typeof defaultsSchema> = [], events: z.infer<typeof eventsSchema> = [], polls = 0;
  for (;;) {
    const [result, observed] = await Promise.all([
      admin.schema('media').from('template_source_media').select('comp,slot_key,media_asset_id,media_version_id')
        .eq('brand_id', config.brandId).eq('asset_id', revision.sourceAssetId).eq('version_id', revision.sourceVersionId),
      admin.schema('media').from('template_source_events').select('id,at,stage,level,message')
        .eq('brand_id', config.brandId).eq('asset_id', revision.sourceAssetId).gte('at', source.data.parsed_at)
        .order('at', { ascending: true }).limit(200),
    ]);
    assert.ifError(result.error); assert.ifError(observed.error); polls++;
    defaults = defaultsSchema.parse(result.data); events = eventsSchema.parse(observed.data);
    const failed = events.find(event => event.stage === 'parse' && event.level === 'error');
    assert(!failed, `Actual image extraction failed: ${failed?.message ?? ''}`);
    const completion = events.find(event => event.stage === 'parse' && event.message.startsWith(`Saved ${expectedPairs.length} authored image default(s) to Library`));
    if (completion && expectedPairs.every(pair => defaults.some(row => row.comp === pair.comp && row.slot_key === pair.slotKey))) {
      rows('media').push({ completionWait: { label, sourceAssetId: revision.sourceAssetId, sourceVersionId: revision.sourceVersionId,
        parsedAt: source.data.parsed_at, waitingAt: new Date(waitingAt).toISOString(), observedAt: new Date().toISOString(),
        elapsedMs: Date.now() - waitingAt, polls, expectedPairs, denominator: expectedPairs.length, actualMatchedPairs: expectedPairs.length, completionEvent: completion } });
      break;
    }
    assert(Date.now() < until && !stop.signal.aborted, 'Actual extraction did not complete all five exact source/version pairs and its Saved event within the bounded wait.');
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert(defaults.length > 0, 'Actual raster defaults must be saved, not bypassed by a zero-media fixture.');
  const checked = new Map<string, string>();
  for (const row of defaults) {
    const key = `${row.media_asset_id}:${row.media_version_id}`;
    if (checked.has(key)) continue;
    const version = await admin.schema('media').from('asset_versions').select('bucket,storage_path,checksum,size_bytes,mime_type')
      .eq('brand_id', config.brandId).eq('asset_id', row.media_asset_id).eq('id', row.media_version_id).single();
    assert.ifError(version.error); assert(version.data);
    assert(['image/png', 'image/jpeg'].includes(version.data.mime_type), 'Collected raster defaults retain a verified raster MIME.');
    const stored = await admin.storage.from(version.data.bucket).download(version.data.storage_path); assert.ifError(stored.error); assert(stored.data);
    const bytes = new Uint8Array(await stored.data.arrayBuffer());
    assert.equal(bytes.length, version.data.size_bytes); assert.equal(sha(bytes), version.data.checksum);
    assert(admittedRasters.has(sha(bytes)), 'Raster default must match original collected bytes or separately observed real artwork-repair input pixels.');
    checked.set(key, sha(bytes));
  }
  const missingDefaults = parse.slots.filter(slot => slot.kind === 'image').flatMap(slot => slot.comps
    .filter(comp => !defaults.some(value => value.comp === comp && value.slot_key === slot.key)).map(comp => ({ slotKey: slot.key, comp })));
  assert.deepEqual(missingDefaults, [], 'All five actual defaults must remain present after completion.');
  rows('media').push({ label, revisionId: revision.id, sourceAssetId: revision.sourceAssetId, sourceVersionId: revision.sourceVersionId,
    defaults, verifiedRasterIdentities: [...checked].map(([identity, sha256]) => ({ identity, sha256,
      source: rasters.has(sha256) ? 'original collected raster bytes' : 'observed linked-artwork repair input pixels' })), missingDefaults });
  rows('warnings').push({ label, parseWarnings: parse.warnings, missingFootage: parse.missingFootage, fonts: parse.fonts,
    events, aiQualification: 'Original AI bytes retained; any generated raster is tied to actual observed repair input and registered derived version. Direct AI embedding and visual fidelity are not claimed.' });
}
async function verifyRevision(revision: TemplateRevision, expected: { x: number; y: number }, label: string, principalId: string, inputPackageSha256: string) {
  const immutable = await admin.schema('media').from('template_revisions').select('created_by,parent_revision_id,checksum,parse:source_snapshot->parse')
    .eq('brand_id', config.brandId).eq('template_id', templateId).eq('id', revision.id).single();
  assert.ifError(immutable.error); assert(immutable.data); assert.equal(immutable.data.created_by, principalId);
  const parse = templateParseSchema.parse(immutable.data.parse); assert(parse.structure);
  const pin = await admin.schema('media').from('asset_versions').select('bucket,storage_path,checksum,size_bytes')
    .eq('brand_id', config.brandId).eq('asset_id', revision.sourceAssetId).eq('id', revision.sourceVersionId).single();
  assert.ifError(pin.error); assert(pin.data);
  const stored = await admin.storage.from(pin.data.bucket).download(pin.data.storage_path); assert.ifError(stored.error); assert(stored.data);
  const bytes = new Uint8Array(await stored.data.arrayBuffer()); assert.equal(bytes.length, pin.data.size_bytes);
  assert.equal(sha(bytes), pin.data.checksum); assert.equal(sha(bytes), revision.checksum); assert.equal(sha(bytes), immutable.data.checksum);
  assert.equal(parse.structure.sourcePackageChecksum, sha(bytes));
  const files = entries(bytes), aeps = Object.entries(files).filter(([name]) => /\.aep$/i.test(name)); assert.equal(aeps.length, 1);
  assert.equal(sha(aeps[0]![1]), parse.structure.sourceAepChecksum); assert.notEqual(sha(aeps[0]![1]), admittedAepSha256);
  const carried = footage.map(([name, original]) => { const child = files[name]; assert(child, `Missing original collected path ${name}`);
    assert.equal(sha(child), sha(original)); return { name, bytes: child.length, sha256: sha(child) }; });
  const repairedPixels = [...generatedPixels].map(([name, expectedPixel]) => {
    const child = files[name]; assert(child, `Missing qualified generated artwork pixel ${name}`);
    assert.equal(child.length, expectedPixel.bytes); assert.equal(sha(child), expectedPixel.sha256);
    return { name, ...expectedPixel };
  });
  const position = parse.structure.comps.find(comp => comp.id === layer.compId)?.layers.find(value => value.id === layer.layerId)?.positionSource;
  assert.equal(position?.kind, 'explicit'); assert.deepEqual(position?.value.slice(0, 2), [expected.x, expected.y]);
  const mappings = await admin.schema('media').from('template_revision_derivations').select('receipt')
    .eq('brand_id', config.brandId).eq('template_id', templateId).eq('revision_id', revision.id);
  assert.ifError(mappings.error);
  const candidates = z.array(z.object({ receipt: templateVersioningCandidateSchema })).parse(mappings.data);
  assert.equal(candidates.length, 1); const receipt = candidates[0]!.receipt;
  assert.equal(receipt.qualification, 'verified-bytes'); assert.equal(receipt.artifact.sha256, sha(bytes));
  assert.equal(receipt.source.sha256, inputPackageSha256, 'Native candidate must pin the exact reviewed parent package.');
  assert.equal(receipt.artifact.size, bytes.length); assert.equal(receipt.checkout.artifact.sha256, sha(aeps[0]![1]));
  assert.equal(receipt.ref, `library/${config.brandId}/${templateId}/variants/${revision.variantId}`);
  const file = `${label}.zip`; writeFileSync(path.join(run, file), bytes, { flag: 'wx' });
  rows('packages').push({ label, file, revisionId: revision.id, principalId, sourceAssetId: revision.sourceAssetId,
    sourceVersionId: revision.sourceVersionId, packageSha256: sha(bytes), bytes: bytes.length,
    innerAepSha256: sha(aeps[0]![1]), nativePosition: position?.value, receipt, originalFootage: carried, generatedArtworkPixels: repairedPixels });
  await mediaProof(revision, parse, label);
}
function nativeRequests() {
  const directory = config.nativeRequestsPath ?? path.join(path.dirname(config.nativeWalPath), 'versioning/requests');
  const requests: { requestId: string; sha256: string; fileSha256: string; ref: string }[] = [];
  for (const requestId of readdirSync(directory).filter(name => /^[a-f0-9-]{36}$/.test(name)).sort()) {
    const file = path.join(directory, requestId, '1.json'); if (!existsSync(file)) continue;
    assert(statSync(file).size < 300 * 1024, 'Bounded immutable request event.');
    const bytes = readFileSync(file);
    const record = z.object({ sha256: z.string(), event: z.unknown() }).parse(JSON.parse(bytes.toString()));
    const event = z.object({ requestId: z.string(), command: z.string(), request: z.unknown() }).parse(record.event);
    if (event.command !== '/v1/aep/edit-layers') continue;
    const input = z.object({ checkpoint: z.object({ ref: z.string() }).optional() }).parse(event.request);
    if (!input.checkpoint?.ref.startsWith(`library/${config.brandId}/${templateId}/variants/`)) continue;
    assert.equal(event.requestId, requestId); assert.equal(record.sha256, sha(JSON.stringify(record.event)));
    requests.push({ requestId, sha256: record.sha256, fileSha256: sha(bytes), ref: input.checkpoint.ref });
  }
  return requests;
}
async function counts() {
  const tables = ['template_revisions', 'template_version_commits', 'template_operations', 'template_revision_derivations'] as const;
  const counted = await Promise.all(tables.map(async table => {
    const result = await admin.schema('media').from(table).select('*', { count: 'exact', head: true })
      .eq('brand_id', config.brandId).eq('template_id', templateId);
    assert.ifError(result.error); assert.equal(typeof result.count, 'number'); return [table, result.count] as const;
  }));
  const sourceIds = z.array(z.object({ sourceAssetId: z.string().uuid() })).parse(evidence.packages).map(value => value.sourceAssetId);
  const authored = await admin.schema('media').from('assets').select('*', { count: 'exact', head: true })
    .eq('brand_id', config.brandId).contains('origin_ref', { kind: 'template_variant' })
    .in('origin_ref->>parentAssetId', [templateId, ...sourceIds]);
  assert.ifError(authored.error);
  return { ...Object.fromEntries(counted), authoredAssets: authored.count, nativeWalSha256: sha(readFileSync(config.nativeWalPath)), nativeRequests: nativeRequests() };
}
async function operationSnapshot() {
  const [operations, linked] = await Promise.all([
    admin.schema('media').from('template_operations').select('id,working_copy_id,sequence,base_revision_id,principal_user_id,payload,received_at', { count: 'exact' })
      .eq('brand_id', config.brandId).eq('template_id', templateId).order('id').limit(256),
    admin.schema('media').from('template_revision_operation_links').select('revision_id,operation_id', { count: 'exact' })
      .eq('brand_id', config.brandId).eq('template_id', templateId).order('revision_id').order('operation_id').limit(512),
  ]);
  assert.ifError(operations.error); assert.ifError(linked.error);
  const rows = z.array(z.object({ id: z.string().uuid(), working_copy_id: z.string().uuid(), sequence: z.number().int().positive(),
    base_revision_id: z.string().uuid().nullable(), principal_user_id: z.string().uuid(), payload: z.record(z.string(), z.unknown()), received_at: z.string() })).parse(operations.data);
  const links = z.array(z.object({ revision_id: z.string().uuid(), operation_id: z.string().uuid() })).parse(linked.data);
  assert.equal(rows.length, operations.count, 'The snapshot must cover every operation in this new bounded family.');
  assert.equal(links.length, linked.count, 'The snapshot must cover every revision operation link.');
  return { rows, links };
}
try {
  const [a, b] = await Promise.all([identity('A', config.authSession.access_token), identity('B', config.authSessionB.access_token)]);
  assert.notEqual(a.principalId, b.principalId, 'Two actual GoTrue principals are required.');
  evidence.actors = [a, b].map(({ label, principalId }) => ({ label, principalId }));
  rec.record('Two distinct real GoTrue principals verified', 'PASS');
  const original = await ingest(a);
  await api(b, `?${query()}`);
  rec.record('Real collected AEP/AI/JPEG/PNG ingested through Library and parsed with actual raster defaults', 'PASS');
  const first = await branch(a, original), second = await branch(b, original);
  const x = layer.x + 37, y = layer.y + 53;
  const ours = await save(a, first, { x }); await verifyRevision(ours, { x, y: layer.y }, 'ours', a.principalId, first.checksum);
  const theirs = await save(b, second, { y }); await verifyRevision(theirs, { x: layer.x, y }, 'theirs', b.principalId, second.checksum);
  rec.record('Both users saved independent supported coordinates in actual native packages with original footage retained', 'PASS');
  const mergeInput = { brandId: config.brandId, variantId: ours.variantId, sourceVariantId: theirs.variantId,
    expectedHeadRevisionId: ours.id, expectedSourceHeadRevisionId: theirs.id };
  const preview = templateVersionMergePreviewSchema.parse((await api(a, 'merges/preview', mergeInput)).body);
  assert.deepEqual(preview.conflicts, []);
  assert(preview.edits.layers.some(value => value.compId === layer.compId && value.layerId === layer.layerId && value.x === x && value.y === y));
  const mergeBody = { ...mergeInput, previewToken: preview.previewToken, resolutions: [], idempotencyKey: randomUUID(),
    message: 'Actual collected-media independent merge', origin: { tool: 'Collected-media merge qualification' } };
  const accepted = templateVersionResultSchema.parse((await api(a, 'merges', mergeBody)).body);
  assert.equal(accepted.replayed, false); const merged = accepted.revision;
  assert.notEqual(merged.id, ours.id); assert.equal(merged.parentRevisionId, ours.id); assert.equal(merged.variantId, ours.variantId);
  assert.notEqual(merged.sourceVersionId, ours.sourceVersionId); assert.notEqual(merged.sourceVersionId, theirs.sourceVersionId);
  const ancestry = await admin.schema('media').from('template_version_commits').select('merge_parent_revision_id')
    .eq('brand_id', config.brandId).eq('template_id', templateId).eq('revision_id', merged.id).single();
  assert.ifError(ancestry.error); assert.equal(ancestry.data?.merge_parent_revision_id, theirs.id);
  await verifyRevision(merged, { x, y }, 'merged', a.principalId, ours.checksum);
  evidence.merge = { revisionId: merged.id, parentRevisionId: ours.id, mergeParentRevisionId: theirs.id,
    request: mergeBody, reviewedPreviewToken: preview.previewToken };
  rec.record('Independent merge appended both parents and a new verified native package with every original footage checksum', 'PASS');
  const before = await counts(), operationsBefore = await operationSnapshot();
  assert.equal(before.nativeRequests.length, 3, 'Exactly two saves and one merge native request.');
  assert.equal(before.authoredAssets, 3, 'All three actual native package assets must be counted through their recorded parent asset identities.');
  const replayStartedAt = new Date().toISOString();
  const replay = templateVersionResultSchema.parse((await api(a, 'merges', mergeBody)).body);
  const replayFinishedAt = new Date().toISOString();
  evidence.replay = { request: mergeBody, actualResponse: replay, before, operationsBefore, replayStartedAt, replayFinishedAt };
  assert.equal(replay.replayed, true); assert.equal(replay.revision.id, merged.id);
  const after = await counts(), operationsAfter = await operationSnapshot();
  evidence.replay = { request: mergeBody, actualResponse: replay, before, after, operationsBefore, operationsAfter, replayStartedAt, replayFinishedAt,
    requestSha256: sha(JSON.stringify(mergeBody)) };
  for (const row of operationsBefore.rows) assert.deepEqual(operationsAfter.rows.find(value => value.id === row.id), row, 'Every pre-existing operation remains byte-equivalent.');
  assert.deepEqual(operationsAfter.links, operationsBefore.links, 'Creative execution and revision operation links must not duplicate on replay.');
  const previousIds = new Set(operationsBefore.rows.map(row => row.id));
  const added = operationsAfter.rows.filter(row => !previousIds.has(row.id)).sort((left, right) => left.sequence - right.sequence);
  assert.equal(added.length, 2, 'Retain exactly the actual requested/succeeded replay audit pair, never extra creative operations.');
  const [requestedRow, terminalRow] = added; assert(requestedRow && terminalRow);
  const requested = templateOperationInputSchema.parse(requestedRow.payload), terminal = templateOperationInputSchema.parse(terminalRow.payload);
  assert.equal(requestedRow.working_copy_id, terminalRow.working_copy_id);
  assert(!operationsBefore.rows.some(row => row.working_copy_id === requestedRow.working_copy_id), 'The replay is a fresh recorded API attempt stream.');
  for (const [row, operation] of [[requestedRow, requested], [terminalRow, terminal]] as const) {
    assert.equal(operation.id, row.id); assert.equal(operation.workingCopyId, row.working_copy_id); assert.equal(operation.sequence, row.sequence);
    assert.equal(row.principal_user_id, a.principalId); assert.equal(row.base_revision_id, ours.id);
    assert.equal(operation.command, 'edit_merge_commit'); assert.equal(operation.channel, 'api'); assert.equal(operation.evidence, 'recorded');
    assert.deepEqual(operation.origin, mergeBody.origin);
    assert.equal(operation.changes?.representation, 'authenticated_api_attempt'); assert.equal(operation.changes?.outcomeScope, 'api_response');
    assert.equal(operation.changes?.idempotencyKey, mergeBody.idempotencyKey);
    assert(Date.parse(row.received_at) >= Date.parse(replayStartedAt) && Date.parse(row.received_at) <= Date.parse(replayFinishedAt));
    assert(!operationsAfter.links.some(link => link.operation_id === row.id), 'API response evidence stays distinct from committed creative execution.');
  }
  assert.equal(requested.sequence, 1); assert.equal(requested.outcome, 'requested'); assert.deepEqual(requested.causedBy, []);
  assert.equal(terminal.sequence, 2); assert.equal(terminal.outcome, 'succeeded'); assert.deepEqual(terminal.causedBy, [requested.id]);
  assert.equal(terminal.changes?.accepted, true); assert.equal(terminal.changes?.replayed, true); assert.equal(terminal.changes?.revisionId, merged.id);
  assert.deepEqual(after, { ...before, template_operations: operationsBefore.rows.length + 2 }, 'Only the two proved API attempt records may change the full counts.');
  await originalUploadProof();
  evidence.sourceEventsAtFinish = await Promise.all([original, ours, theirs, merged].map(async revision => {
    const result = await admin.schema('media').from('template_source_events').select('id,at,stage,level,message')
      .eq('brand_id', config.brandId).eq('asset_id', revision.sourceAssetId).order('at', { ascending: true }).limit(200);
    assert.ifError(result.error);
    return { revisionId: revision.id, sourceAssetId: revision.sourceAssetId, sourceVersionId: revision.sourceVersionId,
      events: result.data, scope: 'Retain downstream build/refusal facts separately; these do not qualify a production release or rendered pixels.' };
  }));
  rec.record('Exact merge replay retained its two authenticated attempt events without duplicating creative operations/links, native requests/WAL, revisions, derivations or authored assets', 'PASS');
} catch (cause) {
  evidence.failure = { message: cause instanceof Error ? cause.message : String(cause) };
  rec.record('Actual collected-media independent merge', 'FAIL', cause instanceof Error ? cause.message : String(cause));
} finally {
  clearTimeout(deadline); clearInterval(monitor);
  evidence.finishedAt = new Date().toISOString(); evidence.counts = rec.summary();
  writeFileSync(path.join(run, 'observed.json'), `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
  rec.note('Real local user-file/native/dependency proof only; original uploads and qualified linked-artwork repair inputs stay distinct, with actual font/parse warnings retained. No visual fidelity, publication, rendered pixels, hosted or production qualification.');
  console.log(JSON.stringify({ run, sourceSha256: sha(sourceText), observed: path.join(run, 'observed.json') }));
  rec.finish({ json: true });
}

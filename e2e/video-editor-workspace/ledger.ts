import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { readBackendEnv } from '../support/prodEnv';

// What the bench wrote, and the proof it took it all back — with the project service-role
// client only, so it runs on any client with the bench's service key. Uploads go through the
// real Library path (library-upload register → media.assets + a version + a receipt + a
// poster), so the run's storage is derived from the rows of the asset ids it registered,
// captured while those rows exist, and checked object by object through the storage API.
// The brand is shared with other writers, so no raw brand count is ever the proof.

const uuid = z.string().uuid();

export type OwnedObject = { bucket: string; path: string };
/** Every path this run owns, and every asset folder whose late contents it also owns. */
export type StorageLedger = { objects: OwnedObject[]; folders: OwnedObject[] };

/** The Backend's AI_STUDIO_BUCKET: kept transcripts and exports land here. */
export const AI_STUDIO_BUCKET = readBackendEnv('AI_STUDIO_BUCKET') ?? 'brand-profile-assets';

/** Where the Backend keeps a version's word-level transcript (sourceMedia keptTranscriptPath). */
export const keptTranscript = (brandId: string, versionId: string): OwnedObject => ({
  bucket: AI_STUDIO_BUCKET,
  path: `${uuid.parse(brandId)}/video-editor/transcripts/${uuid.parse(versionId)}.json`,
});

const key = (object: OwnedObject) => `${object.bucket}\n${object.path}`;
const unique = (objects: OwnedObject[]) => [
  ...new Map(objects.map((object) => [key(object), object])).values(),
];

/**
 * The storage these assets own, read from their asset, version and rendition rows — including
 * the transcript a Brief keeps per version, which is named by version and so never sits in the
 * asset's folder.
 */
export async function ownedStorage(
  admin: SupabaseClient,
  brandId: string,
  assets: readonly { id: string; storagePath: string }[],
): Promise<StorageLedger> {
  const brand = uuid.parse(brandId);
  const ids = assets.map((asset) => uuid.parse(asset.id));
  if (ids.length === 0) return { objects: [], folders: [] };
  const media = admin.schema('media');
  const read = async <T>(table: string, columns: string, column: string) => {
    const { data, error } = await media.from(table).select(columns).in(column, ids);
    if (error) throw new Error(`storage ledger read ${table}: ${error.message}`);
    return (data ?? []) as T[];
  };
  type PathRow = { bucket: string | null; storage_path: string | null };
  const assetRows = await read<PathRow & { id: string; thumbnail_path: string | null }>(
    'assets',
    'id,bucket,storage_path,thumbnail_path',
    'id',
  );
  const versions = await read<PathRow & { id: string }>(
    'asset_versions',
    'id,bucket,storage_path',
    'asset_id',
  );
  const renditions = await read<PathRow>('asset_renditions', 'bucket,storage_path', 'asset_id');
  const objects: OwnedObject[] = [];
  for (const row of [...assetRows, ...versions, ...renditions])
    if (row.bucket && row.storage_path)
      objects.push({ bucket: row.bucket, path: row.storage_path });
  for (const row of assetRows)
    if (row.bucket && row.thumbnail_path)
      objects.push({ bucket: row.bucket, path: row.thumbnail_path });
  for (const asset of assets) {
    const bucket = assetRows.find((row) => row.id === asset.id)?.bucket;
    if (bucket && asset.storagePath) objects.push({ bucket, path: asset.storagePath });
  }
  const buckets = [...new Set(objects.map((object) => object.bucket))];
  for (const version of versions) objects.push(keptTranscript(brand, version.id));
  return {
    // Never anything outside this brand's prefix.
    objects: unique(objects.filter((object) => object.path.startsWith(`${brand}/`))),
    folders: buckets.flatMap((bucket) => ids.map((id) => ({ bucket, path: `${brand}/${id}` }))),
  };
}

async function exists(admin: SupabaseClient, object: OwnedObject): Promise<boolean> {
  const cut = object.path.lastIndexOf('/');
  const name = object.path.slice(cut + 1);
  const { data, error } = await admin.storage
    .from(object.bucket)
    .list(object.path.slice(0, cut), { search: name, limit: 100 });
  if (error) throw new Error(`storage ledger list ${object.bucket}: ${error.message}`);
  return (data ?? []).some((entry) => entry.name === name && entry.id !== null);
}

async function folderObjects(
  admin: SupabaseClient,
  folder: OwnedObject,
  depth = 3,
): Promise<OwnedObject[]> {
  const { data, error } = await admin.storage
    .from(folder.bucket)
    .list(folder.path, { limit: 1000 });
  if (error) throw new Error(`storage ledger list ${folder.bucket}: ${error.message}`);
  const found: OwnedObject[] = [];
  for (const entry of data ?? []) {
    const path = `${folder.path}/${entry.name}`;
    if (entry.id !== null) found.push({ bucket: folder.bucket, path });
    else if (depth > 0)
      found.push(...(await folderObjects(admin, { bucket: folder.bucket, path }, depth - 1)));
  }
  return found;
}

/** The owned objects that exist right now: each owned path, and anything in an owned folder. */
export async function presentObjects(
  admin: SupabaseClient,
  ledger: StorageLedger,
): Promise<OwnedObject[]> {
  const present: OwnedObject[] = [];
  for (const object of ledger.objects) if (await exists(admin, object)) present.push(object);
  for (const folder of ledger.folders) present.push(...(await folderObjects(admin, folder)));
  return unique(present);
}

/**
 * The kept transcripts of read-only source versions that do not exist yet. A Brief or a bed that
 * hears one of those versions during the run keeps its words, so the run owns what is there at
 * exit; a transcript kept before the run is someone else's and is never touched.
 * ponytail: another writer that first hears the same version mid-run has its copy removed too —
 * a cache miss for it, never a wrong word.
 */
export async function unkeptTranscripts(
  admin: SupabaseClient,
  brandId: string,
  versionIds: readonly string[],
): Promise<OwnedObject[]> {
  const unkept: OwnedObject[] = [];
  for (const versionId of versionIds) {
    const transcript = keptTranscript(brandId, versionId);
    if (!(await exists(admin, transcript))) unkept.push(transcript);
  }
  return unkept;
}

/** The Library assets these projects made: sound generated for one (filed under it), its exports. */
export async function projectAssets(
  admin: SupabaseClient,
  brandId: string,
  projectIds: readonly string[],
): Promise<{ id: string; storagePath: string }[]> {
  const brand = uuid.parse(brandId);
  const ids = projectIds.map((id) => uuid.parse(id));
  if (ids.length === 0) return [];
  const assets = () =>
    admin.schema('media').from('assets').select('id,storage_path').eq('brand_id', brand);
  const reads = [
    ...ids.map((id) => assets().contains('origin_ref', { nodeId: `video-project:${id}` })),
    assets().in('origin_ref->>projectId', ids),
  ];
  const found = new Map<string, string>();
  for (const { data, error } of await Promise.all(reads)) {
    if (error) throw new Error(`project asset read: ${error.message}`);
    for (const row of (data ?? []) as { id: string; storage_path: string }[])
      found.set(row.id, row.storage_path);
  }
  return [...found].map(([id, storagePath]) => ({ id, storagePath }));
}

/**
 * The positive control: one tiny owned object planted where the run's own objects live, so a
 * ledger that sees nothing cannot pass the net-zero check vacuously.
 */
export async function plantControl(
  admin: SupabaseClient,
  brandId: string,
  ledger: StorageLedger,
  run: string,
): Promise<OwnedObject> {
  const home = ledger.folders[0] ?? {
    bucket: 'media-library',
    path: `${uuid.parse(brandId)}/ledger-control-${run}`,
  };
  const control = { bucket: home.bucket, path: `${home.path}/ledger-control-${run}.txt` };
  const { error } = await admin.storage
    .from(control.bucket)
    .upload(control.path, new Blob([`storage ledger control ${run}`]), {
      contentType: 'text/plain',
    });
  if (error) throw new Error(`storage ledger control upload: ${error.message}`);
  ledger.objects.push(control);
  if (!ledger.folders.some((folder) => key(folder) === key(home))) ledger.folders.push(home);
  return control;
}

/** Whether the ledger, as it reads storage now, sees the planted control. */
export async function controlSeen(
  admin: SupabaseClient,
  ledger: StorageLedger,
  control: OwnedObject,
): Promise<boolean> {
  return (await presentObjects(admin, ledger)).some((object) => key(object) === key(control));
}

export async function removeObjects(admin: SupabaseClient, objects: readonly OwnedObject[]) {
  for (const bucket of new Set(objects.map((object) => object.bucket))) {
    const paths = objects.filter((object) => object.bucket === bucket).map((object) => object.path);
    const { error } = await admin.storage.from(bucket).remove(paths);
    if (error) throw new Error(`storage cleanup failed: ${error.message}`);
  }
}

/**
 * Remove the owned objects that exist, then the asset rows. Register receipts
 * (library_internal.operation_receipts) are not reachable with the service role — the schema
 * is not exposed and no RPC deletes them — so they are returned for the caller to report.
 */
export async function removeAssets(
  admin: SupabaseClient,
  brandId: string,
  assets: readonly { id: string; storagePath: string }[],
  ledger: StorageLedger,
): Promise<{ objects: number; rows: number; receiptsLeftFor: string[] }> {
  const objects = await presentObjects(admin, ledger);
  await removeObjects(admin, objects);
  if (assets.length === 0) return { objects: objects.length, rows: 0, receiptsLeftFor: [] };
  const ids = assets.map((asset) => uuid.parse(asset.id));
  const { error, count } = await admin
    .schema('media')
    .from('assets')
    .delete({ count: 'exact' })
    .eq('brand_id', uuid.parse(brandId))
    .in('id', ids);
  if (error) throw new Error(`asset cleanup failed: ${error.message}`);
  return { objects: objects.length, rows: count ?? 0, receiptsLeftFor: ids };
}

export async function removeProjects(
  admin: SupabaseClient,
  brandId: string,
  projectIds: readonly string[],
) {
  if (projectIds.length === 0) return 0;
  const { error, count } = await admin
    .schema('media')
    .from('editor_projects')
    .delete({ count: 'exact' })
    .eq('brand_id', brandId)
    .in(
      'id',
      projectIds.map((id) => uuid.parse(id)),
    );
  if (error) throw new Error(`project cleanup failed: ${error.message}`);
  return count ?? 0;
}

export type GradedStep = { step: string; grade: 'PASS' | 'FAIL' | 'SKIP'; detail: string };

const where = (object: OwnedObject) => `${object.bucket}/${object.path}`;

async function countLeft(admin: SupabaseClient, table: string, ids: readonly string[]) {
  if (ids.length === 0) return 0;
  const { count, error } = await admin
    .schema('media')
    .from(table)
    .select('id', { count: 'exact', head: true })
    .in('id', ids);
  if (error) throw new Error(`net zero read ${table}: ${error.message}`);
  return count ?? 0;
}

/**
 * Takes back everything the ledger owns and grades the proof, by owned id only: a planted control
 * the ledger must see before cleanup, then no owned object (the control included), asset row or
 * project left. A ledger that never saw its control proves nothing, so its zero is graded FAIL,
 * never PASS. Register receipts are an honest SKIP that names the asset ids to sweep.
 */
export async function proveNetZero(
  admin: SupabaseClient,
  brandId: string,
  run: {
    id: string;
    ledger: StorageLedger;
    assets: readonly { id: string; storagePath: string }[];
    projects?: readonly string[];
    /** Late writes (a poster, an analysis artefact) land after the rows go. */
    settleMs?: number;
  },
): Promise<{ steps: GradedStep[]; notes: string[] }> {
  const { ledger, assets, projects = [], settleMs = 5_000 } = run;
  const brand = uuid.parse(brandId);
  const projectIds = projects.map((id) => uuid.parse(id));
  // An export is stored under its project before it is registered.
  for (const id of projectIds) {
    const folder = { bucket: AI_STUDIO_BUCKET, path: `${brand}/video-exports/${id}` };
    if (!ledger.folders.some((owned) => key(owned) === key(folder))) ledger.folders.push(folder);
  }
  const control = await plantControl(admin, brand, ledger, run.id);
  const seen = await controlSeen(admin, ledger, control);
  const removedProjects = await removeProjects(admin, brand, projectIds);
  const removed = await removeAssets(admin, brand, assets, ledger);
  if (settleMs > 0) await new Promise((done) => setTimeout(done, settleMs));
  const late = await presentObjects(admin, ledger);
  if (late.length > 0) await removeObjects(admin, late);
  const left = await presentObjects(admin, ledger);
  const ids = assets.map((asset) => uuid.parse(asset.id));
  const leftRows = await countLeft(admin, 'assets', ids);
  const leftProjects = await countLeft(admin, 'editor_projects', projectIds);
  const vacuous = seen ? '' : ' — VACUOUS: the ledger never saw its planted control';
  const grade = (ok: boolean) => (seen && ok ? 'PASS' : 'FAIL');
  return {
    steps: [
      {
        step: 'storage ledger positive control: a planted owned object is detected',
        grade: seen ? 'PASS' : 'FAIL',
        detail: where(control),
      },
      {
        step: 'storage ledger positive control: cleanup removed the planted object and the ledger sees zero',
        grade: grade(left.length === 0),
        detail: `owned objects left ${left.length}${left.length > 0 ? ` [${left.slice(0, 4).map(where).join(', ')}]` : ''}${vacuous}`,
      },
      {
        step: 'net zero: no media.assets rows, storage objects or projects left from this run',
        grade: grade(leftRows === 0 && left.length === 0 && leftProjects === 0),
        detail: `rows ${leftRows} of ${ids.length}, objects ${left.length}, projects ${leftProjects} of ${projectIds.length}${vacuous}`,
      },
      {
        step: 'net zero: register receipts',
        grade: 'SKIP',
        detail: `NOT EXERCISED: register receipts (service role cannot read library_internal); left by asset id: ${ids.join(', ') || 'none'}`,
      },
    ],
    notes: [
      `cleanup: ${removedProjects} project(s), ${removed.rows} asset row(s), ${removed.objects + late.length} storage object(s) of ${ledger.objects.length} owned paths and ${ledger.folders.length} owned folders`,
      ...(ids.length > 0
        ? [
            `register receipts to sweep (library_internal.operation_receipts, by response assetId): ${ids.join(', ')}`,
          ]
        : []),
    ],
  };
}

const JOB_ID = /^job_[0-9a-f]{32}$/;

/**
 * The run's plugin_mcp.jobs rows, an honest SKIP: the table is not granted to the service role and
 * nothing it may call deletes a job, so they stay. Each id is read through get_job, so the step
 * names exactly the rows left to sweep.
 */
export async function jobRows(
  admin: SupabaseClient,
  userId: string,
  jobIds: readonly string[],
): Promise<GradedStep> {
  const left: string[] = [];
  for (const jobId of jobIds) {
    if (!JOB_ID.test(jobId)) throw new Error(`not a job id: ${jobId}`);
    const { error } = await admin
      .schema('plugin_mcp')
      .rpc('get_job', { p_job_id: jobId, p_user_id: uuid.parse(userId) });
    if (!error) left.push(jobId);
    else if (error.code !== 'P0002') throw new Error(`job ledger read ${jobId}: ${error.message}`);
  }
  return {
    step: 'net zero: job rows',
    grade: 'SKIP',
    detail: `NOT EXERCISED: job rows (service role cannot delete plugin_mcp.jobs); left by job id: ${left.join(', ') || 'none'} (${left.length} of ${jobIds.length} this run started)`,
  };
}

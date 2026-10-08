import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

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

const key = (object: OwnedObject) => `${object.bucket}\n${object.path}`;
const unique = (objects: OwnedObject[]) => [
  ...new Map(objects.map((object) => [key(object), object])).values(),
];

/** The storage these assets own, read from their asset, version and rendition rows. */
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
  const versions = await read<PathRow>('asset_versions', 'bucket,storage_path', 'asset_id');
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

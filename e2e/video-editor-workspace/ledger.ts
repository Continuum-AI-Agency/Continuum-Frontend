import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { prodSql } from '../../../Continuum-Backend/scripts/_bench/managementSql';

// What the bench wrote, and the proof it took it all back. Uploads go through the real
// Library path (library-upload register → media.assets + a version + a receipt + a
// poster), so cleanup is by the asset ids this run registered — never by time window —
// and the net-zero check counts what is still there afterwards.

const uuid = z.string().uuid();
const quote = (id: string) => `'${uuid.parse(id)}'`;

export type StorageRow = { bucket_id: string; name: string };

/** Every storage object whose path names one of these assets or sits at their original path. */
export async function objectsFor(
  brandId: string,
  assets: readonly { id: string; storagePath: string }[],
) {
  if (assets.length === 0) return [];
  const byId = assets.map((asset) => `name like '%${uuid.parse(asset.id)}%'`).join(' or ');
  const byPath = assets
    .map((asset) => `name = '${asset.storagePath.replaceAll("'", "''")}'`)
    .join(' or ');
  const rows = await prodSql<StorageRow>(
    `select bucket_id, name from storage.objects where name like '${uuid.parse(brandId)}/%' and (${byId} or ${byPath})`,
  );
  if (rows === null) throw new Error('storage ledger needs the Supabase management token');
  return rows;
}

export async function brandObjectCount(brandId: string): Promise<number> {
  const rows = await prodSql<{ count: number }>(
    `select count(*)::int as count from storage.objects where name like '${uuid.parse(brandId)}/%'`,
  );
  if (rows === null) throw new Error('storage ledger needs the Supabase management token');
  return rows[0]?.count ?? 0;
}

export async function removeAssets(
  admin: SupabaseClient,
  brandId: string,
  assets: readonly { id: string; storagePath: string }[],
): Promise<{ objects: number; rows: number }> {
  if (assets.length === 0) return { objects: 0, rows: 0 };
  const objects = await objectsFor(brandId, assets);
  for (const bucket of new Set(objects.map((object) => object.bucket_id))) {
    const names = objects
      .filter((object) => object.bucket_id === bucket)
      .map((object) => object.name);
    const { error } = await admin.storage.from(bucket).remove(names);
    if (error) throw new Error(`storage cleanup failed: ${error.message}`);
  }
  const ids = assets.map((asset) => asset.id);
  const { error, count } = await admin
    .schema('media')
    .from('assets')
    .delete({ count: 'exact' })
    .eq('brand_id', brandId)
    .in('id', ids);
  if (error) throw new Error(`asset cleanup failed: ${error.message}`);
  // A registered upload leaves a receipt keyed by bucket+path; a later registration of the
  // same path would be handed this dead asset id back.
  const receipts = await prodSql(
    `delete from library_internal.operation_receipts where brand_id = ${quote(brandId)} and response->>'assetId' in (${ids.map(quote).join(',')}) returning 1`,
  );
  if (receipts === null) throw new Error('receipt cleanup needs the Supabase management token');
  return { objects: objects.length, rows: count ?? 0 };
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

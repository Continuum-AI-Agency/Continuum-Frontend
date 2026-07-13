import {
  listVersionsResponseSchema,
  type MediaAssetVersion,
  registerVersionRequestSchema,
  registerVersionResponseSchema,
  rollbackVersionRequestSchema,
} from '@continuum/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureHeadVersion, loadAssetHead, loadVersionRows } from '@/lib/library/ensureHeadVersion';
import { normalizeReviewStatus } from '@/lib/library/reviewStatus';
import { resetReviewForNewVersion } from '@/lib/library/reviewTransition.server';
import {
  type AssetVersionRow,
  buildRegisterRow,
  buildRollbackRow,
  headUpdateFromRegister,
  headUpdateFromVersion,
  isHeadVersion,
  isOwnedVersionLocation,
  nextVersionNumber,
  versionRowToContract,
} from '@/lib/library/versionMapping';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
import { mintSignedUrls } from '@/lib/media/signed-urls';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const UNIQUE_VIOLATION = '23505';

const listQuerySchema = z.object({
  brandId: z.string().uuid(),
  assetId: z.string().uuid(),
});

async function authorizeCaller(brandId: string): Promise<{ userId: string } | NextResponse> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!(await callerHasBrandAccess(supabase, brandId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return { userId: user.id };
}

// Names are cosmetic — a failed lookup degrades to null authors, never a 500.
async function loadMemberEmailMap(
  admin: SupabaseClient,
  brandId: string,
): Promise<Map<string, string>> {
  const { data, error } = await admin
    .schema('brand_profiles')
    .from('permissions')
    .select('user_id, email')
    .eq('brand_profile_id', brandId);
  const map = new Map<string, string>();
  if (error) {
    console.warn('[library/versions] member email lookup failed', error);
    return map;
  }
  for (const row of (data ?? []) as { user_id: string | null; email: string | null }[]) {
    if (row.user_id && row.email) map.set(row.user_id, row.email);
  }
  return map;
}

async function toVersionContracts(
  admin: SupabaseClient,
  brandId: string,
  head: { bucket: string; storage_path: string },
  rows: AssetVersionRow[],
): Promise<MediaAssetVersion[]> {
  const [signedUrlMap, emailMap] = await Promise.all([
    mintSignedUrls(rows.map((row) => ({ path: row.storage_path, bucket: row.bucket }))),
    loadMemberEmailMap(admin, brandId),
  ]);
  // A rollback copies the promoted file's bucket+path into a new row, so more
  // than one row can match the head object — only the newest (rows are ordered
  // version_number desc) is the head version.
  const headRowId = rows.find((row) => isHeadVersion(row, head))?.id ?? null;
  return rows.map((row) =>
    versionRowToContract(row, {
      signedUrl: signedUrlMap.get(row.storage_path) ?? null,
      authorName: row.created_by ? (emailMap.get(row.created_by) ?? null) : null,
      isHead: row.id === headRowId,
    }),
  );
}

// GET /api/library/versions?brandId&assetId — ordered version history (newest
// first) with fresh signed URLs; the row matching the head's bucket+path is
// flagged isHead. An asset that was never re-uploaded has no rows yet.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = listQuerySchema.safeParse({
    brandId: url.searchParams.get('brandId'),
    assetId: url.searchParams.get('assetId'),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const { brandId, assetId } = parsed.data;

  const caller = await authorizeCaller(brandId);
  if (caller instanceof NextResponse) return caller;

  const admin = createSupabaseAdminClient();
  try {
    const head = await loadAssetHead(admin, brandId, assetId);
    if (!head) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }
    const rows = await loadVersionRows(admin, brandId, assetId);
    const versions = await toVersionContracts(admin, brandId, head, rows);
    return NextResponse.json(listVersionsResponseSchema.parse({ versions }));
  } catch {
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}

// POST /api/library/versions — registers an uploaded file as the new head
// version: materializes v1 from the head row on first use, appends the new
// version row, promotes the head's file columns, then retires a review verdict
// that was cast on the file this upload just replaced.
export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = registerVersionRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const input = parsed.data;

  const caller = await authorizeCaller(input.brandId);
  if (caller instanceof NextResponse) return caller;

  const admin = createSupabaseAdminClient();
  try {
    const head = await loadAssetHead(admin, input.brandId, input.assetId);
    if (!head) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    if (
      !isOwnedVersionLocation(
        { bucket: input.bucket, storagePath: input.storagePath },
        { brandId: input.brandId, assetId: input.assetId, bucket: head.bucket },
      )
    ) {
      return NextResponse.json({ error: 'Invalid storage location' }, { status: 422 });
    }

    const { maxVersionNumber } = await ensureHeadVersion(admin, head);
    const versionNumber = nextVersionNumber(maxVersionNumber);

    const { error: insertError } = await mediaSchema(admin)
      .from('asset_versions')
      .insert(buildRegisterRow(input, { versionNumber, createdBy: caller.userId }));
    if (insertError) {
      if (insertError.code === UNIQUE_VIOLATION) {
        return NextResponse.json({ error: 'Version conflict — retry the upload' }, { status: 409 });
      }
      console.error('[library/versions] version insert failed', insertError);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    const { error: updateError } = await mediaSchema(admin)
      .from('assets')
      .update(headUpdateFromRegister(input))
      .eq('id', input.assetId)
      .eq('brand_id', input.brandId);
    if (updateError) {
      console.error('[library/versions] head update failed', updateError);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    // The verdict on record was cast on the file we just superseded. Resetting it
    // is best-effort: it must not cost the user the version they just uploaded.
    await resetReviewForNewVersion(admin, {
      brandId: input.brandId,
      assetId: input.assetId,
      currentStatus: normalizeReviewStatus(head.review_status),
      versionNumber,
      actor: caller.userId,
    });

    const rows = await loadVersionRows(admin, input.brandId, input.assetId);
    const versions = await toVersionContracts(
      admin,
      input.brandId,
      { bucket: input.bucket, storage_path: input.storagePath },
      rows,
    );
    return NextResponse.json(
      registerVersionResponseSchema.parse({ assetId: input.assetId, versionNumber, versions }),
    );
  } catch {
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}

// PATCH /api/library/versions — rollback: promotes an archived version by
// appending a new version row that copies its file columns (history stays
// append-only), then pointing the head at that file.
export async function PATCH(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = rollbackVersionRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const { brandId, assetId, versionId } = parsed.data;

  const caller = await authorizeCaller(brandId);
  if (caller instanceof NextResponse) return caller;

  const admin = createSupabaseAdminClient();
  try {
    const head = await loadAssetHead(admin, brandId, assetId);
    if (!head) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    const existingRows = await loadVersionRows(admin, brandId, assetId);
    const target = existingRows.find((row) => row.id === versionId);
    if (!target) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }

    if (isHeadVersion(target, head)) {
      const versions = await toVersionContracts(admin, brandId, head, existingRows);
      return NextResponse.json(
        registerVersionResponseSchema.parse({
          assetId,
          versionNumber: target.version_number,
          versions,
        }),
      );
    }

    const versionNumber = nextVersionNumber(existingRows[0]?.version_number ?? null);
    const { error: insertError } = await mediaSchema(admin)
      .from('asset_versions')
      .insert(buildRollbackRow(target, { versionNumber, createdBy: caller.userId }));
    if (insertError) {
      if (insertError.code === UNIQUE_VIOLATION) {
        return NextResponse.json(
          { error: 'Version conflict — retry the rollback' },
          { status: 409 },
        );
      }
      console.error('[library/versions] rollback insert failed', insertError);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    const { error: updateError } = await mediaSchema(admin)
      .from('assets')
      .update(headUpdateFromVersion(target))
      .eq('id', assetId)
      .eq('brand_id', brandId);
    if (updateError) {
      console.error('[library/versions] rollback head update failed', updateError);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    const rows = await loadVersionRows(admin, brandId, assetId);
    const versions = await toVersionContracts(
      admin,
      brandId,
      { bucket: target.bucket, storage_path: target.storage_path },
      rows,
    );
    return NextResponse.json(
      registerVersionResponseSchema.parse({ assetId, versionNumber, versions }),
    );
  } catch {
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}

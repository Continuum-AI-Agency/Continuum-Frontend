import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fetchBrandAuthors } from '@/lib/library/commentAuthors';
import {
  COMMENT_EXPORT_FILES,
  COMMENT_EXPORT_FORMATS,
  exportCommentsForVersion,
} from '@/lib/library/commentExport';
import {
  commentRowToMediaComment,
  displayNameFromEmail,
  type MediaCommentRow,
} from '@/lib/library/comments';
import { measureFrameRate } from '@/lib/library/frameRate';
import { requireBrandCaller } from '@/lib/library/libraryOperation.server';
import { mintSignedUrl } from '@/lib/media/signed-urls';
import { mediaSchema } from '@/lib/media/supabase-media';

// GET /api/library/comments/export?brandId&assetId&format[&versionId] — the
// timed comments of one version as editing-app markers (CSV, Resolve EDL,
// FCPXML, Premiere XML). The frame rate is measured from the version's own bytes
// on every export: nothing stores it, and a guessed rate lands markers on the
// wrong frames. Everything is read on the caller's RLS-scoped client.

const querySchema = z.object({
  brandId: z.string().uuid(),
  assetId: z.string().uuid(),
  versionId: z.string().uuid().optional(),
  format: z.enum(COMMENT_EXPORT_FORMATS),
});

type MediaFile = {
  bucket: string;
  storage_path: string;
  duration_ms: number | null;
  mime_type: string | null;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    brandId: url.searchParams.get('brandId'),
    assetId: url.searchParams.get('assetId'),
    versionId: url.searchParams.get('versionId') ?? undefined,
    format: url.searchParams.get('format'),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const query = parsed.data;
  const caller = await requireBrandCaller(query.brandId);
  if (caller instanceof NextResponse) return caller;
  const media = mediaSchema(caller.supabase);

  const { data: assetData } = await media
    .from('assets')
    .select('title, file_name, kind, bucket, storage_path, duration_ms, mime_type, head_version_id')
    .eq('id', query.assetId)
    .eq('brand_id', query.brandId)
    .is('deleted_at', null)
    .maybeSingle();
  const asset = assetData as
    | (MediaFile & {
        title: string | null;
        file_name: string | null;
        kind: string;
        head_version_id: string | null;
      })
    | null;
  if (!asset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  if (asset.kind !== 'video') {
    return NextResponse.json({ error: 'Markers export needs a video asset' }, { status: 422 });
  }

  let file: MediaFile = asset;
  const versionId = query.versionId ?? asset.head_version_id;
  if (query.versionId && query.versionId !== asset.head_version_id) {
    const { data: version } = await media
      .from('asset_versions')
      .select('bucket, storage_path, duration_ms, mime_type')
      .eq('id', query.versionId)
      .eq('asset_id', query.assetId)
      .eq('brand_id', query.brandId)
      .maybeSingle();
    if (!version) return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    file = version as MediaFile;
  }

  const signedUrl = await mintSignedUrl(file.storage_path, file.bucket);
  const rate = signedUrl ? await measureFrameRate(signedUrl).catch(() => null) : null;
  if (!rate) {
    return NextResponse.json(
      { error: 'Could not read the video frame rate to place markers' },
      { status: 422 },
    );
  }

  const { data: rows, error } = await media
    .from('comments')
    .select(
      'id, brand_id, asset_id, version_id, parent_comment_id, body, mentions, annotation, attachments, visibility, resolved_at, resolved_by, created_by, created_at, updated_at, deleted_at',
    )
    .eq('brand_id', query.brandId)
    .eq('asset_id', query.assetId)
    .is('deleted_at', null);
  if (error) {
    console.error('[library/comments/export] list failed', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
  const authors = await fetchBrandAuthors(caller.supabase, query.brandId);
  const comments = ((rows ?? []) as unknown as MediaCommentRow[]).map((row) =>
    commentRowToMediaComment(row, authors),
  );
  const exported = exportCommentsForVersion(comments, {
    versionId,
    headVersionId: asset.head_version_id,
    authorOf: (comment) =>
      comment.authorName ?? displayNameFromEmail(comment.authorEmail) ?? 'Member',
  });

  const assetName = asset.title || asset.file_name || 'Asset';
  const durationMs =
    file.duration_ms ?? Math.max(1000, ...exported.map((c) => (c.endMs ?? c.timeMs) + 1000));
  const target = COMMENT_EXPORT_FILES[query.format];
  const fileName = `${assetName.replace(/[^\w.-]+/g, '_').slice(0, 80)}-comments.${target.extension}`;
  return new Response(target.build(exported, { assetName, rate, durationMs }), {
    headers: {
      'content-type': target.contentType,
      'content-disposition': `attachment; filename="${fileName}"`,
      'x-frame-rate': `${rate.num}/${rate.den}`,
    },
  });
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { loadAssetTiming } from '@/lib/library/assetTiming.server';
import { fetchBrandAuthors } from '@/lib/library/commentAuthors';
import {
  COMMENT_EXPORT_FILES,
  COMMENT_EXPORT_FORMATS,
  exportCommentsForVersion,
  TIMELINE_STARTS,
} from '@/lib/library/commentExport';
import {
  commentRowToMediaComment,
  displayNameFromEmail,
  type MediaCommentRow,
} from '@/lib/library/comments';
import { requireBrandCaller } from '@/lib/library/libraryOperation.server';
import { mediaSchema } from '@/lib/media/supabase-media';

// GET /api/library/comments/export?brandId&assetId&format[&versionId][&timeline] — the
// timed comments of one version as editing-app markers (CSV, Resolve EDL,
// FCPXML, Premiere XML), at the version's measured frame rate and from its own
// start timecode (lib/library/assetTiming.server), on a timeline that starts at
// 01:00:00:00 (timeline=hour, the default) or at the clip's timecode (source). Everything is read on the
// caller's RLS-scoped client.

const querySchema = z.object({
  brandId: z.string().uuid(),
  assetId: z.string().uuid(),
  versionId: z.string().uuid().optional(),
  format: z.enum(COMMENT_EXPORT_FORMATS),
  timeline: z.enum(TIMELINE_STARTS).default('hour'),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    brandId: url.searchParams.get('brandId'),
    assetId: url.searchParams.get('assetId'),
    versionId: url.searchParams.get('versionId') ?? undefined,
    format: url.searchParams.get('format'),
    timeline: url.searchParams.get('timeline') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const query = parsed.data;
  const caller = await requireBrandCaller(query.brandId);
  if (caller instanceof NextResponse) return caller;
  const loaded = await loadAssetTiming(caller.supabase, query);
  if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  const { timing } = loaded;
  const media = mediaSchema(caller.supabase);

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
    versionId: timing.versionId,
    headVersionId: loaded.headVersionId,
    authorOf: (comment) =>
      comment.authorName ?? displayNameFromEmail(comment.authorEmail) ?? 'Member',
  });

  const { assetName, frameRate: rate } = timing;
  const durationMs =
    timing.durationMs || Math.max(1000, ...exported.map((c) => (c.endMs ?? c.timeMs) + 1000));
  const target = COMMENT_EXPORT_FILES[query.format];
  const fileName = `${assetName.replace(/[^\w.-]+/g, '_').slice(0, 80)}-comments.${target.extension}`;
  const context = {
    assetName,
    fileName: timing.fileName,
    rate,
    durationMs,
    source: { startFrame: timing.startFrame, dropFrame: timing.dropFrame },
    timelineStart: query.timeline,
  };
  return new Response(target.build(exported, context), {
    headers: {
      'content-type': target.contentType,
      'content-disposition': `attachment; filename="${fileName}"`,
      'x-frame-rate': `${rate.num}/${rate.den}`,
      'x-start-timecode': timing.startTimecode,
      'x-timeline-start': query.timeline,
    },
  });
}

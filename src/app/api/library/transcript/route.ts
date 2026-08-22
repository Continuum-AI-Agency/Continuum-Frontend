import { type TranscriptSegment, transcriptSegmentSchema } from '@continuum/contracts';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const querySchema = z.object({
  brandId: z.string().uuid(),
  assetId: z.string().uuid(),
});

type TranscriptRow = {
  transcript: string | null;
  transcript_segments: unknown;
  transcript_source: string | null;
};

// A malformed line is dropped, never fatal — same rule the contracts row mapper
// applies to every other jsonb column.
function parseSegments(raw: unknown): TranscriptSegment[] | null {
  if (raw === null || raw === undefined) return null;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const parsed = transcriptSegmentSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

// GET /api/library/transcript?brandId&assetId — one video's spoken track.
//
// Deliberately NOT part of the grid's asset payload: a long-form transcript is by
// far the heaviest column on the row, and a page of 48 cards has no use for it.
// The detail modal reads it when it opens.
//
// `transcript: null` (never transcribed) and `transcript: ''` (analyzed, no
// speech) are distinct answers and are passed through verbatim — the viewer
// renders different sentences for them.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    brandId: url.searchParams.get('brandId'),
    assetId: url.searchParams.get('assetId'),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const { brandId, assetId } = parsed.data;

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

  // User-scoped client: media.assets RLS (has_brand_access) already fences rows
  // to the caller's brands, so no service-role bypass is warranted for a read.
  const { data, error } = await mediaSchema(supabase)
    .from('assets')
    .select('transcript, transcript_segments, transcript_source')
    .eq('id', assetId)
    .eq('brand_id', brandId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) {
    console.error('[library/transcript] asset lookup failed', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  }
  const row = data as unknown as TranscriptRow;

  return NextResponse.json({
    assetId,
    transcript: row.transcript,
    transcriptSegments: parseSegments(row.transcript_segments),
    transcriptSource: row.transcript_source,
  });
}

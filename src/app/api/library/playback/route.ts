import {
  LIBRARY_PROXY_LADDER,
  LIBRARY_VIDEO_PLAYBACK_ROLES,
  type LibraryPlayback,
  type LibraryPlaybackRung,
} from '@continuum/contracts';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
import { mintSignedUrls } from '@/lib/media/signed-urls';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const querySchema = z.object({
  brandId: z.string().uuid(),
  assetId: z.string().uuid(),
  // Omitted plays the head: a grid card scrubs whatever the asset currently is.
  versionId: z.string().uuid().optional(),
});

type PlaybackRow = {
  role: string;
  bucket: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
};

const PLAYBACK_ROLES = [...LIBRARY_VIDEO_PLAYBACK_ROLES, 'audio_proxy'];

// The ready playback renditions of one version, signed. Every read goes through the
// caller's own client, so media.asset_renditions RLS and Storage policies decide what
// comes back: Vercel holds no service-role key, and this route must not need one.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    brandId: url.searchParams.get('brandId'),
    assetId: url.searchParams.get('assetId'),
    versionId: url.searchParams.get('versionId') ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  const { brandId, assetId } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await callerHasBrandAccess(supabase, brandId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // The head read is the soft-delete gate even for an exact version: asset_versions has
  // no deleted_at, so a version id alone would still play a trashed asset.
  const { data: asset } = await mediaSchema(supabase)
    .from('assets')
    .select('head_version_id')
    .eq('id', assetId)
    .eq('brand_id', brandId)
    .is('deleted_at', null)
    .maybeSingle();
  const assetVersionId =
    parsed.data.versionId ?? (asset as { head_version_id: string | null } | null)?.head_version_id;
  if (!asset || !assetVersionId) {
    return NextResponse.json({ error: 'Asset version not found' }, { status: 404 });
  }

  // asset_id and brand_id ride along so a version id from another asset reads nothing.
  const [{ data, error }, { data: version }] = await Promise.all([
    mediaSchema(supabase)
      .from('asset_renditions')
      .select('role, bucket, storage_path, mime_type, size_bytes, width, height, duration_ms')
      .eq('asset_version_id', assetVersionId)
      .eq('asset_id', assetId)
      .eq('brand_id', brandId)
      .eq('state', 'ready')
      .in('role', PLAYBACK_ROLES),
    mediaSchema(supabase)
      .from('asset_versions')
      .select('file_name')
      .eq('id', assetVersionId)
      .eq('asset_id', assetId)
      .maybeSingle(),
  ]);
  if (error) {
    console.error('[library/playback] rendition read failed', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 502 });
  }
  const rows = (data ?? []) as PlaybackRow[];
  const signed = await mintSignedUrls(
    rows.map((row) => ({ bucket: row.bucket, path: row.storage_path })),
  );
  // A row whose URL did not sign is left out rather than offered as a dead source.
  const ready = (role: string) => {
    const row = rows.find((candidate) => candidate.role === role);
    const signedUrl = row ? signed.get(row.storage_path) : undefined;
    return row && signedUrl ? { row, signedUrl } : null;
  };

  const rung = (role: LibraryPlaybackRung['role'], label: string): LibraryPlaybackRung[] => {
    const found = ready(role);
    if (!found) return [];
    const { row, signedUrl } = found;
    return [
      {
        role,
        label,
        width: row.width,
        height: row.height,
        sizeBytes: row.size_bytes,
        mimeType: row.mime_type,
        hdr: role === 'hdr_proxy',
        signedUrl,
      },
    ];
  };

  const sprite = ready('scrub_sprite');
  const audio = ready('audio_proxy');
  const fileName = (version as { file_name: string | null } | null)?.file_name;
  const body: LibraryPlayback = {
    assetId,
    assetVersionId,
    ...(fileName ? { fileName } : {}),
    rungs: [
      ...LIBRARY_PROXY_LADDER.flatMap((step) => rung(step.role, step.label)),
      ...rung('hdr_proxy', 'HDR'),
    ],
    // The sheet's own size is its whole layout (a fixed GRID×GRID of tiles), so a
    // sprite row without one is unusable.
    sprite:
      sprite?.row.width && sprite.row.height
        ? {
            signedUrl: sprite.signedUrl,
            width: sprite.row.width,
            height: sprite.row.height,
            durationMs: sprite.row.duration_ms,
          }
        : null,
    audioProxy: audio
      ? {
          signedUrl: audio.signedUrl,
          mimeType: audio.row.mime_type,
          sizeBytes: audio.row.size_bytes,
        }
      : null,
  };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
}

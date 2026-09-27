import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { CommentAttachmentPreview } from '@/lib/library/comments';
import { requireBrandCaller } from '@/lib/library/libraryOperation.server';
import { mintSignedUrl } from '@/lib/media/signed-urls';
import { mediaSchema } from '@/lib/media/supabase-media';

// GET /api/library/comments/attachments?brandId&ids=a,b — what the thread needs to
// preview a comment's attachments inline: kind, name and signed URLs. Attachments
// are ordinary Library assets, read on the caller's RLS-scoped client, so a
// member only ever previews what they could open in the Library anyway.

const querySchema = z.object({
  brandId: z.string().uuid(),
  ids: z.array(z.string().uuid()).min(1).max(50),
});

type AttachmentRow = {
  id: string;
  kind: CommentAttachmentPreview['kind'];
  title: string | null;
  file_name: string | null;
  mime_type: string | null;
  bucket: string;
  storage_path: string;
  thumbnail_path: string | null;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    brandId: url.searchParams.get('brandId'),
    ids: (url.searchParams.get('ids') ?? '').split(',').filter(Boolean),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const caller = await requireBrandCaller(parsed.data.brandId);
  if (caller instanceof NextResponse) return caller;

  const { data, error } = await mediaSchema(caller.supabase)
    .from('assets')
    .select('id, kind, title, file_name, mime_type, bucket, storage_path, thumbnail_path')
    .eq('brand_id', parsed.data.brandId)
    .in('id', parsed.data.ids)
    .is('deleted_at', null);
  if (error) {
    console.error('[library/comments/attachments] lookup failed', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  const attachments: CommentAttachmentPreview[] = await Promise.all(
    ((data ?? []) as AttachmentRow[]).map(async (row) => ({
      assetId: row.id,
      kind: row.kind,
      name: row.title || row.file_name || 'Attachment',
      mimeType: row.mime_type,
      url: await mintSignedUrl(row.storage_path, row.bucket),
      thumbnailUrl: row.thumbnail_path ? await mintSignedUrl(row.thumbnail_path, row.bucket) : null,
    })),
  );
  return NextResponse.json({ attachments });
}

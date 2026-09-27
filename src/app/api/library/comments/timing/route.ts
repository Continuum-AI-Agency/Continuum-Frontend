import { assetTimingSchema } from '@continuum/contracts';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { loadAssetTiming } from '@/lib/library/assetTiming.server';
import { requireBrandCaller } from '@/lib/library/libraryOperation.server';

// GET /api/library/comments/timing?brandId&assetId[&versionId] — the frame rate and
// source start timecode of a video version, for SMPTE comment labels (the comment
// list, the editor view) that are not sitting next to the playing file.

const querySchema = z.object({
  brandId: z.string().uuid(),
  assetId: z.string().uuid(),
  versionId: z.string().uuid().optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    brandId: url.searchParams.get('brandId'),
    assetId: url.searchParams.get('assetId'),
    versionId: url.searchParams.get('versionId') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const caller = await requireBrandCaller(parsed.data.brandId);
  if (caller instanceof NextResponse) return caller;
  const result = await loadAssetTiming(caller.supabase, parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(assetTimingSchema.parse(result.timing));
}

import {
  listReviewStateLabelsResponseSchema,
  type ReviewStateLabel,
  resolveReviewStateLabels,
} from '@continuum/contracts';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBrandCaller } from '@/lib/library/libraryOperation.server';
import { mediaSchema } from '@/lib/media/supabase-media';

// A brand's names and colours for the five fixed review states
// (media.review_state_labels) and its custom states (media.review_custom_states),
// read on the caller's RLS-scoped client. Always answers all five labels — a
// state the brand never customized reads as its default.
// Writes go through the library-review edge function (admin-only in SQL).

const querySchema = z.object({ brandId: z.string().uuid() });

export async function GET(request: Request) {
  const parsed = querySchema.safeParse({
    brandId: new URL(request.url).searchParams.get('brandId'),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const caller = await requireBrandCaller(parsed.data.brandId);
  if (caller instanceof NextResponse) return caller;

  const media = mediaSchema(caller.supabase);
  const [labelsResult, statesResult] = await Promise.all([
    media
      .from('review_state_labels')
      .select('state, label, color, position')
      .eq('brand_id', parsed.data.brandId),
    media
      .from('review_custom_states')
      .select('id, base_status, label, color, position')
      .eq('brand_id', parsed.data.brandId)
      .order('position'),
  ]);
  const error = labelsResult.error ?? statesResult.error;
  if (error) {
    console.error('[library/review/labels] read failed', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
  const resolved = resolveReviewStateLabels((labelsResult.data ?? []) as ReviewStateLabel[]);
  const customStates = (
    (statesResult.data ?? []) as {
      id: string;
      base_status: string;
      label: string;
      color: string;
      position: number;
    }[]
  ).map((row) => ({
    id: row.id,
    baseStatus: row.base_status,
    label: row.label,
    color: row.color,
    position: row.position,
  }));
  return NextResponse.json(
    listReviewStateLabelsResponseSchema.parse({
      labels: Object.values(resolved).sort((a, b) => a.position - b.position),
      customStates,
    }),
  );
}

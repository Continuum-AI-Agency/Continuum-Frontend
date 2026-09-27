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
// (media.review_state_labels), read on the caller's RLS-scoped client. Always
// answers all five — a state the brand never customized reads as its default.
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

  const { data, error } = await mediaSchema(caller.supabase)
    .from('review_state_labels')
    .select('state, label, color, position')
    .eq('brand_id', parsed.data.brandId);
  if (error) {
    console.error('[library/review/labels] read failed', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
  const resolved = resolveReviewStateLabels((data ?? []) as ReviewStateLabel[]);
  return NextResponse.json(
    listReviewStateLabelsResponseSchema.parse({
      labels: Object.values(resolved).sort((a, b) => a.position - b.position),
    }),
  );
}

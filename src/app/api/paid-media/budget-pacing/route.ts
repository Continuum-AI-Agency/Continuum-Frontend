import { NextResponse } from 'next/server';
import { z } from 'zod';
import { BudgetPacingResponseSchema } from '@/lib/schemas/budgetPacing';
import { readEdgeError } from '@/lib/supabase/edgeErrorMessage';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const requestSchema = z.object({
  brandId: z.string(),
  adAccountId: z.string(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  try {
    const { data, error } = await supabase.functions.invoke('paid-media-reporting/budget-pacing', {
      body: parsed.data,
    });

    if (error) {
      console.error('Error invoking paid-media-reporting/budget-pacing:', error);
      // A refusal the edge answered (Meta's #200 → 403 PERMISSIONS_MISSING) keeps its status
      // and its typed code, so the page can say what to reconnect; anything without a status
      // of its own is the edge failing us, a gateway error rather than this route's 500.
      const failure = await readEdgeError(
        error,
        'Failed to fetch budget pacing from edge function',
      );
      const refused = failure.status !== null && failure.status >= 400 && failure.status < 500;
      return NextResponse.json(
        {
          error: refused ? failure.message : 'Failed to fetch budget pacing from edge function',
          ...(failure.code ? { errorCode: failure.code } : {}),
        },
        { status: refused ? (failure.status as number) : 502 },
      );
    }

    const validated = BudgetPacingResponseSchema.safeParse(data);
    if (!validated.success) {
      console.error('Invalid response from paid-media-reporting/budget-pacing:', validated.error);
      return NextResponse.json({ error: 'Invalid response format from backend' }, { status: 502 });
    }

    return NextResponse.json(validated.data);
  } catch (error) {
    console.error('Unexpected error in budget-pacing proxy:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

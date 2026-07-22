import { NextResponse } from 'next/server';
import { z } from 'zod';
import { BudgetPacingResponseSchema } from '@/lib/schemas/budgetPacing';
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
      return NextResponse.json(
        { error: 'Failed to fetch budget pacing from edge function' },
        { status: 500 },
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

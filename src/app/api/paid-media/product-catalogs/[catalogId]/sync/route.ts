import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { createSupabaseServerClient } from '@/lib/supabase/server';

const paramsSchema = z.object({
  catalogId: z.string().uuid(),
});

const bodySchema = z.object({
  brandId: z.string().uuid(),
  adAccountId: z.string().min(1),
  pageSize: z.number().int().min(1).max(200).optional(),
  maxPages: z.number().int().min(1).max(20).optional(),
  maxActivityRows: z.number().int().min(1).max(50_000).optional(),
  source: z.string().trim().min(1).max(64).optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ catalogId: string }> },
) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: 'Invalid catalog id' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return NextResponse.json({ error: 'Supabase URL is not configured' }, { status: 500 });
  }

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/catalog-sync-meta`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        ...parsed.data,
        catalogId: params.data.catalogId,
      }),
      cache: 'no-store',
    });

    const responseBody = await response
      .json()
      .catch(() => ({ error: 'Invalid edge function response' }));
    return NextResponse.json(responseBody, { status: response.status });
  } catch (error) {
    console.error('Failed to invoke catalog-sync-meta', error);
    return NextResponse.json({ error: 'Failed to invoke catalog sync' }, { status: 500 });
  }
}

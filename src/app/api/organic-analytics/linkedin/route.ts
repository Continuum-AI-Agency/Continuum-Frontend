import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  organicAnalyticsScopeSchema,
  organicDateRangePresetSchema,
  organicMetricsResponseSchema,
} from '@/lib/schemas/organicMetrics';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const requestSchema = z.object({
  brandId: z.string(),
  integrationAccountId: z.string(),
  range: z.object({
    preset: organicDateRangePresetSchema,
    custom: z
      .object({
        from: z.string(),
        to: z.string(),
      })
      .optional(),
  }),
  forceRefresh: z.boolean().optional(),
  scope: organicAnalyticsScopeSchema.optional(),
  selectedPostId: z.string().optional(),
  postsLimit: z.number().int().min(1).max(25).optional(),
  commentsLimit: z.number().int().min(1).max(50).optional(),
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
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.access_token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data, error } = await supabase.functions.invoke('organic-reporting/analytics', {
      body: {
        brandId: parsed.data.brandId,
        integrationAccountId: parsed.data.integrationAccountId,
        platform: 'linkedin',
        range: parsed.data.range,
        forceRefresh: parsed.data.forceRefresh ?? false,
        scope: parsed.data.scope ?? 'all',
        selectedPostId: parsed.data.selectedPostId,
        postsLimit: parsed.data.postsLimit,
        commentsLimit: parsed.data.commentsLimit,
      },
    });

    if (error) {
      const edgeBody = (await (error as { context?: { json?: () => Promise<unknown> } }).context
        ?.json?.()
        .catch(() => null)) as { error?: string; errorCode?: string; retryAfter?: number } | null;
      if (edgeBody?.errorCode) {
        return NextResponse.json(edgeBody, { status: 502 });
      }
      return NextResponse.json(
        { error: edgeBody?.error ?? 'Failed to fetch LinkedIn organic analytics' },
        { status: 500 },
      );
    }

    return NextResponse.json(organicMetricsResponseSchema.parse(data));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to load LinkedIn organic analytics';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

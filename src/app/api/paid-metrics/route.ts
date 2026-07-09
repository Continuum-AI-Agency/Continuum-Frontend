import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  PaidCampaignDailyTrendsResponseSchema,
  PaidMetricsResponseSchema,
} from '@/lib/schemas/paidMetrics';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const isoDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must use YYYY-MM-DD format.');

const rangeSchema = z
  .discriminatedUnion('preset', [
    z.object({
      preset: z.enum(['last_7d', 'last_14d', 'last_30d']),
    }),
    z.object({
      preset: z.literal('custom'),
      since: isoDaySchema,
      until: isoDaySchema,
    }),
  ])
  .superRefine((range, ctx) => {
    if (range.preset === 'custom' && range.since > range.until) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['since'],
        message: 'Custom range start date must be on or before end date.',
      });
    }
  });

const requestSchema = z.object({
  brandId: z.string(),
  platform: z.enum(['meta', 'google-ads', 'dv360', 'linkedin']).optional().default('meta'),
  scope: z
    .enum([
      'campaign',
      'account_overview',
      'top_campaigns',
      'top_adsets',
      'top_ads',
      'campaign_daily_trends',
    ])
    .optional(),
  accountId: z.string().optional(),
  campaignId: z.string().optional(),
  adsetId: z.string().optional(),
  range: rangeSchema,
  forceRefresh: z.boolean().optional(),
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
    const { data, error } = await supabase.functions.invoke('paid-media-reporting/metrics', {
      body: parsed.data,
    });

    if (error) {
      console.error('Error invoking paid-media-reporting/metrics:', error);
      return NextResponse.json(
        { error: 'Failed to fetch paid metrics from edge function' },
        { status: 500 },
      );
    }

    // The batch scope answers with `campaigns[]`, not a single entity's `metrics`/`trends`.
    // An edge that predates the scope falls through to an inferred account_overview, whose
    // payload would otherwise validate here and be rendered as every campaign's row.
    const responseSchema =
      parsed.data.scope === 'campaign_daily_trends'
        ? PaidCampaignDailyTrendsResponseSchema
        : PaidMetricsResponseSchema;

    const validated = responseSchema.safeParse(data);
    if (!validated.success) {
      console.error('Invalid response from paid-media-reporting/metrics:', validated.error);
      return NextResponse.json({ error: 'Invalid response format from backend' }, { status: 502 });
    }

    return NextResponse.json(validated.data);
  } catch (error) {
    console.error('Unexpected error in paid-metrics proxy:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

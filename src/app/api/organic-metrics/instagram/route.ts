import { NextResponse } from "next/server";
import { z } from "zod";

import { getApiUrl } from "@/lib/api/config";
import { ApiError, assertOk } from "@/lib/api/errors";
import { normalizeInstagramOrganicMetricsResponse } from "@/lib/organic-metrics/normalize";
import { organicDateRangePresetSchema } from "@/lib/schemas/organicMetrics";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const insightsRequestSchema = z.object({
  metrics: z.array(z.string()),
  metric_type: z.enum(["total_value", "time_series"]).optional(),
  period: z.enum(["day", "lifetime"]).optional(),
  breakdown: z.union([z.string(), z.array(z.string())]).optional(),
  timeframe: z.string().optional(),
  since: z.string().optional(),
  until: z.string().optional(),
});

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
  insightsRequests: z.array(insightsRequestSchema).optional(),
  forceRefresh: z.boolean().optional(),
});

async function getServerAccessToken(): Promise<string | undefined> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? undefined;
  } catch {
    return undefined;
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const token = await getServerAccessToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const response = await fetch(getApiUrl("/reporting/organic/metrics"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        brandId: parsed.data.brandId,
        integrationAccountId: parsed.data.integrationAccountId,
        range: parsed.data.range,
        ...(parsed.data.insightsRequests && { insightsRequests: parsed.data.insightsRequests }),
        ...(parsed.data.forceRefresh && { forceRefresh: parsed.data.forceRefresh }),
      }),
      cache: "no-store",
    });

    await assertOk(response);
    const json = (await response.json()) as unknown;
    const normalized = normalizeInstagramOrganicMetricsResponse(json);
    return NextResponse.json(normalized);
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to load organic metrics";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

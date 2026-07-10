import { NextResponse } from "next/server";
import { z } from "zod";

import {
  organicAnalyticsScopeSchema,
  organicDateRangePresetSchema,
  organicMetricsResponseSchema,
} from "@/lib/schemas/organicMetrics";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
});

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

  const supabase = await createSupabaseServerClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data, error } = await supabase.functions.invoke("organic-reporting/analytics", {
      body: {
        brandId: parsed.data.brandId,
        integrationAccountId: parsed.data.integrationAccountId,
        platform: "youtube",
        range: parsed.data.range,
        forceRefresh: parsed.data.forceRefresh ?? false,
        scope: parsed.data.scope ?? "all",
        selectedPostId: parsed.data.selectedPostId,
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
        { error: edgeBody?.error ?? "Failed to fetch YouTube organic analytics" },
        { status: 500 }
      );
    }

    // YouTube edge payloads are already in the shared organic response shape
    // (platform: "youtube", all-optional metrics bag). Do not run them through
    // the Instagram normalizer — that path is Instagram-shaped and surfaces
    // misleading Zod issues (expected platform "instagram", IG metric fields).
    //
    // Stamp the *request* preset onto the response: the shared cache is keyed
    // by date window, not preset string, so a poisoned row written under an
    // alias like `last_30_days` can be served for a later `last_7d` request
    // that happens to share the same since/until.
    const stamped =
      data && typeof data === "object"
        ? {
            ...(data as Record<string, unknown>),
            range: {
              ...((data as { range?: Record<string, unknown> }).range ?? {}),
              preset: parsed.data.range.preset,
            },
          }
        : data;
    return NextResponse.json(organicMetricsResponseSchema.parse(stamped));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load YouTube organic analytics";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AccountInsightsResponseSchema } from "@/lib/paid-media/account-insights.types";

const isoDaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must use YYYY-MM-DD format.");

const rangeSchema = z
  .discriminatedUnion("preset", [
    z.object({
      preset: z.enum(["last_7d", "last_14d", "last_30d"]),
    }),
    z.object({
      preset: z.literal("custom"),
      since: isoDaySchema,
      until: isoDaySchema,
    }),
  ])
  .superRefine((range, ctx) => {
    if (range.preset === "custom" && range.since > range.until) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["since"],
        message: "Custom range start date must be on or before end date.",
      });
    }
  });

const requestSchema = z.object({
  brandId: z.string(),
  adAccountId: z.string(),
  campaignId: z.string(),
  campaignName: z.string().optional(),
  campaignObjective: z.string().optional(),
  range: rangeSchema,
  forceRefresh: z.boolean().optional(),
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

  try {
    const { data, error } = await supabase.functions.invoke(
      "get-campaign-insights",
      { body: parsed.data }
    );

    if (error) {
      console.error("Error invoking get-campaign-insights:", error);
      return NextResponse.json(
        { error: "Failed to fetch campaign insights from edge function" },
        { status: 500 }
      );
    }

    const validated = AccountInsightsResponseSchema.safeParse(data);
    if (!validated.success) {
      console.error(
        "Invalid response from get-campaign-insights:",
        validated.error
      );
      return NextResponse.json(
        { error: "Invalid response format from backend" },
        { status: 502 }
      );
    }

    return NextResponse.json(validated.data);
  } catch (error) {
    console.error("Unexpected error in campaign-insights proxy:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

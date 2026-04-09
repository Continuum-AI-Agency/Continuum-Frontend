import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { OrganicInsightsResponseSchema } from "@/lib/organic/organic-insights.types";

const requestSchema = z.object({
  brandId: z.string(),
  integrationAccountId: z.string(),
  platform: z.enum(["instagram", "facebook"]),
  range: z.object({
    preset: z.enum(["yesterday", "last_7d", "last_14d", "last_30d", "last_month"]),
  }),
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
      "get-organic-insights",
      { body: parsed.data }
    );

    if (error) {
      console.error("Error invoking get-organic-insights:", error);
      return NextResponse.json(
        { error: "Failed to fetch organic insights from edge function" },
        { status: 500 }
      );
    }

    const validated = OrganicInsightsResponseSchema.safeParse(data);
    if (!validated.success) {
      console.error("Invalid response from get-organic-insights:", validated.error);
      return NextResponse.json(
        { error: "Invalid response format from backend" },
        { status: 502 }
      );
    }

    return NextResponse.json(validated.data);
  } catch (error) {
    console.error("Unexpected error in organic insights proxy:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

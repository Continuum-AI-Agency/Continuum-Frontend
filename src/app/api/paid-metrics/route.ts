import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PaidMetricsResponseSchema } from "@/lib/schemas/paidMetrics";

const requestSchema = z.object({
  brandId: z.string(),
  adAccountId: z.string().optional(),
  range: z.object({
    preset: z.string(),
    since: z.string().optional(),
    until: z.string().optional(),
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
    const { data, error } = await supabase.functions.invoke("paid-media-metrics", {
      body: parsed.data,
    });

    if (error) {
      console.error("Error invoking paid-media-metrics:", error);
      return NextResponse.json(
        { error: "Failed to fetch paid metrics from edge function" },
        { status: 500 }
      );
    }

    // Validate response against shared schema
    const validated = PaidMetricsResponseSchema.safeParse(data);
    if (!validated.success) {
      console.error("Invalid response from paid-media-metrics:", validated.error);
       // Return data anyway but log error, or fail? Let's fail safe or return partial?
       // For now, let's return data but warn in logs. 
       // Actually, stricter is better.
      return NextResponse.json(
          { error: "Invalid response format from backend" }, 
          { status: 502 }
      );
    }

    return NextResponse.json(validated.data);
  } catch (error) {
    console.error("Unexpected error in paid-metrics proxy:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

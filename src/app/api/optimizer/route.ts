import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { runCycle, type CycleResult } from "@continuum/optimization-engine";
import { AdSetSnapshotSchema } from "@continuum/optimization-engine/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const audienceTypeSchema = z.enum(["prospecting", "retargeting", "remarketing", "unknown"]);

// The engine's snapshot schema strips `audienceType` / `frequency7d`; re-add them
// so the full snapshot survives validation and reaches the engine.
const snapshotSchema = AdSetSnapshotSchema.extend({
  audienceType: audienceTypeSchema.optional(),
  frequency7d: z.number().nonnegative().optional(),
});

const pacingSchema = z.object({
  periodBudget: z.number().nonnegative(),
  periodDays: z.number().positive(),
  dayIndex: z.number().positive(),
  actualSpendToDate: z.number().nonnegative(),
});

// Only the overrides the UI exposes — keeps an arbitrary (conservation-breaking)
// full engine config out of the public contract.
const configSchema = z
  .object({
    cpaTarget: z.number().positive(),
    velocityCapPct: z.number().min(0).max(5),
  })
  .partial();

const bodySchema = z
  .object({
    snapshots: z.array(snapshotSchema).min(1, "At least one ad set snapshot is required."),
    mode: z.enum(["balanced", "efficiency", "scale"]).default("balanced"),
    total: z.number().positive().optional(),
    maxBudget: z.number().positive().optional(),
    weeklyGrowthPct: z.number().min(0).max(1).optional(),
    pacing: pacingSchema.optional(),
    config: configSchema.optional(),
  })
  .refine((body) => body.total !== undefined || body.pacing !== undefined, {
    message: "Provide either `total` or `pacing` to size the daily budget.",
  });

export async function POST(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  // Authenticated users only — consistent with the rest of the app surface.
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { snapshots, mode, total, maxBudget, weeklyGrowthPct, pacing, config } = parsed.data;

  try {
    // Pure compute — no external calls. Engine guarantees Σ proposed budgets == total.
    const result: CycleResult = runCycle(snapshots, {
      mode,
      total,
      maxBudget,
      weeklyGrowthPct,
      pacing,
      config,
    });

    return NextResponse.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Optimizer cycle failed", error);
    return NextResponse.json({ error: "Optimizer computation failed" }, { status: 500 });
  }
}

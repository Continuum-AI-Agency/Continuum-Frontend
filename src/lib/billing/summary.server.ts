import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { billingSchema } from "@/lib/billing/supabase-billing";

export interface CreditSummary {
  balanceUsd: number;
  lastMonthRolloverUsd: number;
  lifetimeTopupUsd: number;
  autoRefillMode: "off" | "notify" | "auto_topup";
  autoRefillThresholdUsd: number | null;
  autoRefillAmountUsd: number | null;
}

// Reads the brand's prepaid credit balance (RLS lets members read their own brand).
// Returns null when no credit row exists yet (free / unprovisioned brand).
export async function fetchCreditSummary(brandId: string): Promise<CreditSummary | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await billingSchema(supabase)
      .from("brand_credit_balance")
      .select(
        "balance_usd, last_month_rollover_usd, lifetime_topup_usd, auto_refill_mode, auto_refill_threshold_usd, auto_refill_amount_usd",
      )
      .eq("brand_id", brandId)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as Record<string, unknown>;
    const mode = row.auto_refill_mode;
    return {
      balanceUsd: Number(row.balance_usd ?? 0),
      lastMonthRolloverUsd: Number(row.last_month_rollover_usd ?? 0),
      lifetimeTopupUsd: Number(row.lifetime_topup_usd ?? 0),
      autoRefillMode: mode === "off" || mode === "auto_topup" ? mode : "notify",
      autoRefillThresholdUsd:
        row.auto_refill_threshold_usd == null ? null : Number(row.auto_refill_threshold_usd),
      autoRefillAmountUsd: row.auto_refill_amount_usd == null ? null : Number(row.auto_refill_amount_usd),
    };
  } catch {
    return null;
  }
}

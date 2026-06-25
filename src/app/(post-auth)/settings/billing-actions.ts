"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { billingSchema } from "@/lib/billing/supabase-billing";
import { getFunctionsInvokeErrorMessage } from "@/lib/supabase/functions-errors";
import { getClaimsIdentity } from "@/lib/auth/claims";

async function authHeader(): Promise<Record<string, string> | undefined> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined;
}

async function assertBrandAccess(brandId: string): Promise<string> {
  const user = await getClaimsIdentity();
  if (!user?.id) throw new Error("Not authenticated");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .schema("brand_profiles")
    .from("permissions")
    .select("role")
    .eq("user_id", user.id)
    .eq("brand_profile_id", brandId)
    .maybeSingle();
  if (!data) throw new Error("You do not have access to this brand");
  return user.id;
}

export async function startStripeCheckoutAction(input: {
  brandId: string;
  mode: "subscription" | "topup";
  planCodes?: string[];
  amountUsd?: number;
}): Promise<{ url: string }> {
  await assertBrandAccess(input.brandId);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.functions.invoke<{ url?: string; error?: string }>(
    "stripe-checkout",
    {
      body: {
        brandProfileId: input.brandId,
        mode: input.mode,
        planCodes: input.planCodes,
        amountUsd: input.amountUsd,
      },
      headers: await authHeader(),
    },
  );
  if (error) {
    const message = await getFunctionsInvokeErrorMessage(error);
    throw new Error(message ?? error.message ?? "Unable to start checkout");
  }
  if (!data?.url) throw new Error(data?.error ?? "No checkout URL returned");
  return { url: data.url };
}

export async function openBillingPortalAction(brandId: string): Promise<{ url: string }> {
  await assertBrandAccess(brandId);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.functions.invoke<{ url?: string; error?: string }>(
    "stripe-portal",
    { body: { brandProfileId: brandId }, headers: await authHeader() },
  );
  if (error) {
    const message = await getFunctionsInvokeErrorMessage(error);
    throw new Error(message ?? error.message ?? "Unable to open billing portal");
  }
  if (!data?.url) throw new Error(data?.error ?? "No portal URL returned");
  return { url: data.url };
}

export async function setAutoRefillAction(input: {
  brandId: string;
  mode: "off" | "notify" | "auto_topup";
  thresholdUsd: number | null;
  amountUsd: number | null;
}): Promise<void> {
  await assertBrandAccess(input.brandId);
  // RLS allows only service_role to write the credit row; access already verified above.
  const admin = createSupabaseAdminClient();
  await billingSchema(admin)
    .from("brand_credit_balance")
    .upsert(
      {
        brand_id: input.brandId,
        auto_refill_mode: input.mode,
        auto_refill_threshold_usd: input.thresholdUsd,
        auto_refill_amount_usd: input.amountUsd,
      },
      { onConflict: "brand_id" },
    );
}

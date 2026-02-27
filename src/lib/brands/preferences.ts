import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseLikeError = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

function toDetailedError(context: string, error: unknown): Error {
  if (error instanceof Error) {
    return new Error(`${context}: ${error.message}`);
  }

  if (error && typeof error === "object") {
    const details = error as SupabaseLikeError;
    const parts = [
      details.message,
      details.code ? `code=${details.code}` : null,
      details.details ? `details=${details.details}` : null,
      details.hint ? `hint=${details.hint}` : null,
    ].filter(Boolean);

    if (parts.length > 0) {
      return new Error(`${context}: ${parts.join(" | ")}`);
    }
  }

  return new Error(context);
}

async function getAuthenticatedUserId() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Not authenticated");
  }

  return { supabase, userId: user.id };
}

export async function setActiveBrandPreference(brandId: string): Promise<void> {
  if (!brandId) {
    throw new Error("Brand id is required");
  }

  const { supabase, userId } = await getAuthenticatedUserId();

  const { data: membership, error: membershipError } = await supabase
    .schema("brand_profiles")
    .from("permissions")
    .select("brand_profile_id")
    .eq("brand_profile_id", brandId)
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipError) {
    throw toDetailedError("Active brand membership lookup failed", membershipError);
  }

  if (!membership) {
    throw new Error("You do not have access to this brand");
  }

  const { error: preferenceError } = await supabase
    .schema("brand_profiles")
    .from("user_brand_preferences" as any)
    .upsert(
      {
        user_id: userId,
        active_brand_id: brandId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" } as any
    );

  if (preferenceError) {
    throw toDetailedError(
      "Active brand preference upsert failed (ensure migration 20260226113000_create_user_brand_preferences.sql is applied)",
      preferenceError
    );
  }

  const { error: updateUserError } = await supabase.auth.updateUser({
    data: {
      onboarding: {
        activeBrandId: brandId,
      },
    },
  });

  if (updateUserError) {
    throw toDetailedError("Active brand metadata update failed", updateUserError);
  }
}

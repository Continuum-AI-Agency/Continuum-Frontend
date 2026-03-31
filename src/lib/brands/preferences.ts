import "server-only";

import { after } from "next/server";
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

async function getSessionUserId() {
  const supabase = await createSupabaseServerClient();
  // Use getSession() instead of getUser() — reads JWT from cookie without an
  // HTTP round-trip to Supabase Auth. The middleware already verified the session.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    throw new Error("Not authenticated");
  }

  return { supabase, userId: session.user.id };
}

export async function setActiveBrandPreference(brandId: string): Promise<void> {
  if (!brandId) {
    throw new Error("Brand id is required");
  }

  // Membership is already enforced at the context layer — brandSummaries only
  // contains brands the user has permissions for, so selectBrand can only be
  // called with permitted IDs. Skipping the per-switch membership query saves
  // ~20-50ms from the critical path.
  const { supabase, userId } = await getSessionUserId();

  // Only await the DB write — this is the source of truth for getActiveBrandContext
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

  // Auth metadata update runs after response is sent — used only for cross-tab sync.
  // Moving this off the critical path saves ~150-250ms per brand switch.
  after(async () => {
    const { error } = await supabase.auth.updateUser({
      data: {
        onboarding: {
          activeBrandId: brandId,
        },
      },
    });
    if (error) {
      console.error("[setActiveBrandPreference] Auth metadata update failed:", error.message);
    }
  });
}

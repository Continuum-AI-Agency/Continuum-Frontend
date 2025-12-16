// deno-lint-ignore-file no-explicit-any
// Edge function: update_brand_integration_accounts
// Sets the integration account assignments for a brand profile.
//
// Input (JSON):
//   {
//     brandProfileId: string (uuid),
//     assetPks: string[] (uuid[]) // integration_accounts_assets IDs to assign
//   }
//
// Output:
//   { linked: number, unlinked: number }
//
// Notes:
// - Uses caller JWT (Authorization header) for RLS; no service role key.
// - Performs minimal diff: inserts missing, deletes removed.
//

import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const InputSchema = z.object({
  brandProfileId: z.string().uuid(),
  assetPks: z.array(z.string().uuid()),
});

function createSupabaseForRequest(req: Request) {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  }
  const authHeader = req.headers.get("Authorization") ?? "";
  return createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  });
}

function json(body: Record<string, unknown>, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    ...init,
  });
}

function corsNoContent() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return corsNoContent();
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  let input: z.infer<typeof InputSchema>;
  try {
    const payload = await req.json();
    const parsed = InputSchema.safeParse(payload);
    if (!parsed.success) {
      return json({ error: parsed.error.message }, { status: 400 });
    }
    input = parsed.data;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { brandProfileId, assetPks } = input;
  const supabase = createSupabaseForRequest(req);

  const { data: existing, error: existingError } = await supabase
    .schema("brand_profiles")
    .from("brand_profile_integration_accounts")
    .select("id, integration_account_id")
    .eq("brand_profile_id", brandProfileId);

  if (existingError) {
    console.error("[update_brand_integration_accounts] existing query failed", {
      message: existingError.message,
      code: existingError.code,
      details: existingError.details,
      hint: existingError.hint,
      brandProfileId,
    });
    return json(
      { error: `Assignments query failed: ${existingError.message}` },
      { status: 500 }
    );
  }

  type ExistingRow = {
    id: string;
    integration_account_id: string;
  };

  const existingRows = (existing ?? []) as ExistingRow[];
  const existingIds = new Set(existingRows.map(r => r.integration_account_id));
  const desiredIds = new Set(assetPks);

  const toInsert = assetPks.filter(id => !existingIds.has(id));
  const toDeleteIds = existingRows
    .filter(r => !desiredIds.has(r.integration_account_id))
    .map(r => r.id);

  if (toInsert.length) {
    const { error: insertError } = await supabase
      .schema("brand_profiles")
      .from("brand_profile_integration_accounts")
      .insert(
        toInsert.map(integrationAccountId => ({
          brand_profile_id: brandProfileId,
          integration_account_id: integrationAccountId,
        }))
      );
    if (insertError) {
      console.error("[update_brand_integration_accounts] insert failed", {
        message: insertError.message,
        code: insertError.code,
        details: insertError.details,
        hint: insertError.hint,
        brandProfileId,
        count: toInsert.length,
      });
      return json(
        { error: `Insert failed: ${insertError.message}` },
        { status: 500 }
      );
    }
  }

  if (toDeleteIds.length) {
    const { error: deleteError } = await supabase
      .schema("brand_profiles")
      .from("brand_profile_integration_accounts")
      .delete()
      .in("id", toDeleteIds);
    if (deleteError) {
      console.error("[update_brand_integration_accounts] delete failed", {
        message: deleteError.message,
        code: deleteError.code,
        details: deleteError.details,
        hint: deleteError.hint,
        brandProfileId,
        count: toDeleteIds.length,
      });
      return json(
        { error: `Delete failed: ${deleteError.message}` },
        { status: 500 }
      );
    }
  }

  return json({
    linked: toInsert.length,
    unlinked: toDeleteIds.length,
  });
}

Deno.serve((req: Request) => handler(req));


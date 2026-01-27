import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const InputSchema = z.object({
  brandProfileId: z.string().uuid(),
  assetPks: z.array(z.string().uuid()),
});

function json(body: Record<string, unknown>, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
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
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
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
  
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
  );

  const { data: existing, error: existingError } = await supabase
    .schema("brand_profiles")
    .from("brand_profile_integration_accounts")
    .select("id, integration_account_id")
    .eq("brand_profile_id", brandProfileId);

  if (existingError) {
    return json({ error: `Assignments query failed: ${existingError.message}` }, { status: 500 });
  }

  const existingRows = (existing ?? []) as any[];
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
        toInsert.map(id => ({
          brand_profile_id: brandProfileId,
          integration_account_id: id,
        }))
      );
      
    if (insertError) {
      return json({ error: `Insert failed: ${insertError.message}` }, { status: 500 });
    }
  }

  if (toDeleteIds.length) {
    const { error: deleteError } = await supabase
      .schema("brand_profiles")
      .from("brand_profile_integration_accounts")
      .delete()
      .in("id", toDeleteIds);
      
    if (deleteError) {
      return json({ error: `Delete failed: ${deleteError.message}` }, { status: 500 });
    }
  }

  return json({
    linked: toInsert.length,
    unlinked: toDeleteIds.length,
  });
}

Deno.serve((req: Request) => handler(req));

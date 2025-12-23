// deno-lint-ignore-file no-explicit-any
// Edge function: update_integration_account_assets
// Updates selected flags on integration account assets using service role,
// after verifying the caller owns the integration.
//
// Input (JSON):
// {
//   assetIds: string[]; // integration_accounts_assets ids to update
//   selectedAssetIds: string[]; // subset flagged as selected
// }
//
// Output: { updated: number }

import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const InputSchema = z.object({
  assetIds: z.array(z.string().uuid()).min(1),
  selectedAssetIds: z.array(z.string().uuid()),
});

type JsonRecord = Record<string, unknown>;

type IntegrationAssetRow = {
  id: string;
  integration_id: string;
  raw_payload: unknown;
};

type UserIntegrationRow = {
  id: string;
  user_id: string;
};

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

function createServiceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
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
      "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
    },
  });
}

async function runInBatches<T>(items: T[], batchSize: number, handler: (item: T) => Promise<void>) {
  if (items.length === 0) return;
  const safeBatchSize = Math.max(1, Math.floor(batchSize));

  for (let index = 0; index < items.length; index += safeBatchSize) {
    const batch = items.slice(index, index + safeBatchSize);
    await Promise.all(batch.map(handler));
  }
}

async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return corsNoContent();
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

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

  const supabaseAuth = createSupabaseForRequest(req);
  const { data: authData, error: authError } = await supabaseAuth.auth.getUser();
  if (authError || !authData?.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const { assetIds, selectedAssetIds } = input;
  const service = createServiceClient();

  const { data: assets, error: assetsError } = await service
    .schema("brand_profiles")
    .from("integration_accounts_assets")
    .select("id, integration_id, raw_payload")
    .in("id", assetIds);

  if (assetsError) {
    console.error("[update_integration_account_assets] assets query failed", {
      message: assetsError.message,
      code: assetsError.code,
      details: assetsError.details,
      hint: assetsError.hint,
    });
    return json({ error: `Assets query failed: ${assetsError.message}` }, { status: 500 });
  }

  const assetRows = (assets ?? []) as IntegrationAssetRow[];
  const foundIds = new Set(assetRows.map(row => row.id));
  const missingIds = assetIds.filter(id => !foundIds.has(id));
  if (missingIds.length > 0) {
    return json({ error: "One or more assets were not found" }, { status: 404 });
  }

  const integrationIds = Array.from(new Set(assetRows.map(row => row.integration_id)));
  if (integrationIds.length === 0) {
    return json({ updated: 0 });
  }

  const { data: integrationRows, error: integrationError } = await service
    .schema("brand_profiles")
    .from("user_integrations")
    .select("id, user_id")
    .in("id", integrationIds);

  if (integrationError) {
    console.error("[update_integration_account_assets] integrations query failed", {
      message: integrationError.message,
      code: integrationError.code,
      details: integrationError.details,
      hint: integrationError.hint,
    });
    return json({ error: `Integrations query failed: ${integrationError.message}` }, { status: 500 });
  }

  const integrationRowsTyped = (integrationRows ?? []) as UserIntegrationRow[];
  const ownedIntegrationIds = new Set(
    integrationRowsTyped.filter(row => row.user_id === authData.user.id).map(row => row.id)
  );
  const unauthorized = integrationIds.filter(id => !ownedIntegrationIds.has(id));
  if (unauthorized.length > 0) {
    return json({ error: "Forbidden" }, { status: 403 });
  }

  const selectedSet = new Set(selectedAssetIds);
  const updates = assetRows.map(row => {
    const rawPayload = row.raw_payload && typeof row.raw_payload === "object"
      ? (row.raw_payload as JsonRecord)
      : {};
    return {
      id: row.id,
      raw_payload: { ...rawPayload, selected: selectedSet.has(row.id) },
      updated_at: new Date().toISOString(),
    };
  });

  await runInBatches(updates, 10, async update => {
    const { error } = await service
      .schema("brand_profiles")
      .from("integration_accounts_assets")
      .update(update)
      .eq("id", update.id);

    if (error) {
      console.error("[update_integration_account_assets] update failed", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        id: update.id,
      });
      throw new Error(error.message || `Failed to update asset ${update.id}`);
    }
  });

  return json({ updated: updates.length });
}

Deno.serve((req: Request) => handler(req));

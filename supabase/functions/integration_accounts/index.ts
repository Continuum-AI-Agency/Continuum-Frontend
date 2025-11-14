// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
// Edge function: integration_accounts
// Fetch integration accounts grouped by Continuum platform keys after OAuth.
//
// Input (JSON):
//   { groups: ('google' | 'meta')[] }
//   // Legacy support:
//   { group: 'google' | 'meta' | 'facebook' }
//
// Output:
//   {
//     syncedAt: string,
//     accountsByPlatform: {
//       youtube: Array<Account>,
//       googleAds: Array<Account>,
//       dv360: Array<Account>,
//       instagram: Array<Account>,
//       facebook: Array<Account>,
//       threads: Array<Account>
//     }
//   }
//
// Notes:
// - Uses caller JWT (Authorization header) for RLS; no service role key.
// - Queries brand_profiles.user_integrations (by provider) and
//   brand_profiles.integration_accounts (by integration_id).
//

import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type PlatformKey =
  | "youtube"
  | "googleAds"
  | "dv360"
  | "instagram"
  | "facebook"
  | "threads";

type Account = {
  id: string; // brand_profiles.integration_accounts.id
  externalAccountId: string | null;
  name: string | null;
  status: string | null;
  type: string | null;
};

const InputSchema = z
  .object({
    groups: z.array(z.enum(["google", "meta"])).optional(),
    group: z.enum(["google", "meta", "facebook"]).optional(),
  })
  .refine((v) => Boolean(v.groups?.length || v.group), "group(s) required");

function normalizeGroups(input: z.infer<typeof InputSchema>): Array<"google" | "meta"> {
  const set = new Set<"google" | "meta">();
  if (input.groups && input.groups.length) {
    for (const g of input.groups) set.add(g);
  }
  if (input.group) {
    const g = input.group === "facebook" ? "meta" : input.group;
    set.add(g);
  }
  return Array.from(set);
}

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

function emptyAccountsByPlatform(): Record<PlatformKey, Account[]> {
  return {
    youtube: [],
    googleAds: [],
    dv360: [],
    instagram: [],
    facebook: [],
    threads: [],
  };
}

function mapTypeToPlatformKey(type: string | null | undefined): PlatformKey | null {
  if (!type) return null;
  const t = type.toLowerCase();
  if (t === "youtube_channel") return "youtube";
  if (t === "google_ads_account" || t === "googleads_account") return "googleAds";
  if (t === "dv360_advertiser" || t === "display_video_360_advertiser") return "dv360";
  if (t === "instagram_business_account" || t === "instagram_account") return "instagram";
  if (t === "facebook_page" || t === "facebook_account") return "facebook";
  if (t === "threads_profile" || t === "threads_account") return "threads";
  return null;
}

function json(body: Record<string, any>, init?: ResponseInit) {
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

  const groups = normalizeGroups(input);
  if (!groups.length) {
    return json({ error: "No groups provided" }, { status: 400 });
  }

  const supabase = createSupabaseForRequest(req);
  const authProvided = Boolean(req.headers.get("Authorization"));

  // Fetch user integrations by provider
  const { data: integrations, error: integrationsError } = await supabase
    .schema("brand_profiles")
    .from("user_integrations")
    .select("id, provider")
    .in("provider", groups);

  if (integrationsError) {
    console.error("[integration_accounts] user_integrations query failed", {
      message: integrationsError.message,
      code: integrationsError.code,
      details: integrationsError.details,
      hint: integrationsError.hint,
      groups,
      authProvided,
    });
    return json({ error: `Integrations query failed: ${integrationsError.message}` }, { status: 500 });
  }

  if (!integrations || integrations.length === 0) {
    return json({
      syncedAt: new Date().toISOString(),
      accountsByPlatform: emptyAccountsByPlatform(),
    });
  }

  const integrationIds = integrations.map((i) => i.id);
  // Read assets with caller JWT; RLS must allow access scoped by user-owned integration_ids
  const { data: accounts, error: accountsError } = await supabase
    .schema("brand_profiles")
    .from("integration_accounts_assets")
    .select("id, integration_id, external_account_id, type, name, status, created_at")
    .in("integration_id", integrationIds);

  if (accountsError) {
    console.error("[integration_accounts] accounts query failed", {
      message: accountsError.message,
      code: accountsError.code,
      details: accountsError.details,
      hint: accountsError.hint,
      integrationIdsCount: integrationIds.length,
      authProvided,
    });
    return json({ error: `Accounts query failed: ${accountsError.message}` }, { status: 500 });
  }

  const out = emptyAccountsByPlatform();
  for (const acc of accounts ?? []) {
    const key = mapTypeToPlatformKey(acc.type);
    if (!key) continue;
    const item: Account = {
      id: acc.id as string,
      externalAccountId: (acc as any).external_account_id ?? null,
      name: (acc as any).name ?? null,
      status: (acc as any).status ?? "active",
      type: (acc as any).type ?? null,
    };
    out[key].push(item);
  }

  return json({
    syncedAt: new Date().toISOString(),
    accountsByPlatform: out,
  });
}

// Deno entrypoint
Deno.serve((req: Request) => handler(req));



// deno-lint-ignore-file no-explicit-any
// Edge function: brand_invite
// Actions:
// - create: owners/admins create an invite, store in brand_profiles.invites, send auth admin invite email with magic link
// - accept: authenticated user redeems token, gains permissions, marks invite accepted
//
// Env vars required:
// SUPABASE_URL
// SUPABASE_ANON_KEY
// SUPABASE_SERVICE_ROLE_KEY
// SITE_URL (fallback to NEXT_PUBLIC_SITE_URL if desired)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const InputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    brandId: z.string().uuid(),
    email: z.string().email(),
    role: z.enum(["owner", "admin", "operator", "viewer"]),
    siteUrl: z.string().min(1).optional(),
  }),
  z.object({
    action: z.literal("accept"),
    token: z.string().min(10),
    brandId: z.string().uuid(),
  }),
]);

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createSupabaseForRequest(req: Request) {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  const authHeader = req.headers.get("Authorization") ?? "";
  return createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
}

function createServiceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function assertOwnerOrAdmin(supabase: ReturnType<typeof createSupabaseForRequest>, brandId: string) {
  const { data, error } = await supabase
    .schema("brand_profiles")
    .from("permissions")
    .select("role")
    .eq("brand_profile_id", brandId)
    .eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .maybeSingle();

  if (error) throw error;
  const role = data?.role;
  if (!role || !["owner", "admin"].includes(role)) {
    throw new Response("Forbidden", { status: 403 });
  }
}

function buildMagicLink(siteUrl: string, token: string, brandId: string) {
  const base = siteUrl.replace(/\/$/, "");
  const url = new URL("/invite", base);
  url.searchParams.set("token", token);
  url.searchParams.set("brand", brandId);
  return url.toString();
}

async function handleCreate(req: Request, input: z.infer<typeof InputSchema>) {
  const authed = createSupabaseForRequest(req);
  const service = createServiceClient();

  // Authorization
  await assertOwnerOrAdmin(authed, input.brandId);
  const { data: userData } = await authed.auth.getUser();
  const inviterId = userData?.user?.id;
  if (!inviterId) return json({ error: "Not authenticated" }, 401);

  const token = crypto.randomUUID() + crypto.randomUUID();
  const siteUrl = input.siteUrl ?? Deno.env.get("SITE_URL") ?? Deno.env.get("NEXT_PUBLIC_SITE_URL") ?? "http://localhost:3000";
  const magicLink = buildMagicLink(siteUrl, token, input.brandId);

  // Insert invite row
  const { error: insertError, data: inviteRows } = await service
    .schema("brand_profiles")
    .from("invites")
    .insert({
      brand_profile_id: input.brandId,
      email: input.email.toLowerCase(),
      role: input.role,
      token_hash: token,
      created_by: inviterId,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("id")
    .single();
  if (insertError) {
    console.error("Invite insert failed", insertError);
    return json({ error: insertError.message }, 500);
  }

  // Send auth invite email with redirect to magic link
  try {
    await service.auth.admin.inviteUserByEmail(input.email, { redirectTo: magicLink });
  } catch (err) {
    console.error("Auth invite failed", err);
    // Soft-fail but keep invite record
  }

  return json({ link: magicLink, inviteId: inviteRows.id });
}

async function handleAccept(req: Request, input: z.infer<typeof InputSchema>) {
  const authed = createSupabaseForRequest(req);
  const service = createServiceClient();

  const { data: userData } = await authed.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: "Not authenticated" }, 401);

  const { data: invite, error: inviteError } = await service
    .schema("brand_profiles")
    .from("invites")
    .select("*")
    .eq("token_hash", input.token)
    .eq("brand_profile_id", input.brandId)
    .is("revoked_at", null)
    .is("accepted_at", null)
    .maybeSingle();

  if (inviteError || !invite) return json({ error: "Invalid or used invite" }, 400);
  if (invite.email && invite.email.toLowerCase() !== (user.email ?? "").toLowerCase()) {
    return json({ error: "Invite email mismatch" }, 403);
  }

  // Upsert permissions
  const { error: permError } = await service
    .schema("brand_profiles")
    .from("permissions")
    .upsert(
      {
        user_id: user.id,
        brand_profile_id: invite.brand_profile_id,
        role: invite.role,
      },
      { onConflict: "user_id,brand_profile_id" }
    );
  if (permError) {
    console.error("Permissions upsert failed", permError);
    return json({ error: permError.message }, 500);
  }

  // Mark invite accepted
  await service
    .schema("brand_profiles")
    .from("invites")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invite.id);

  return json({ brandId: invite.brand_profile_id });
}

async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*" } });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let parsed: z.infer<typeof InputSchema>;
  try {
    parsed = InputSchema.parse(await req.json());
  } catch (err) {
    return json({ error: "Invalid request", details: (err as Error).message }, 400);
  }

  if (parsed.action === "create") {
    return await handleCreate(req, parsed);
  }
  return await handleAccept(req, parsed);
}

Deno.serve(handler);


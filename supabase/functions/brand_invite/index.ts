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

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const InputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    brandId: z.string().uuid(),
    email: z.string().email(),
    role: z.enum(["owner", "admin", "operator", "viewer"]),
    siteUrl: z.string().min(1).optional(),
    forceResend: z.boolean().optional(),
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
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
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

function createAnonClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  return createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function assertOwnerOrAdmin(
  supabase: ReturnType<typeof createSupabaseForRequest>,
  brandId: string,
  userId: string,
): Promise<Response | null> {
  const { data, error } = await supabase
    .schema("brand_profiles")
    .from("permissions")
    .select("role")
    .eq("brand_profile_id", brandId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Permission lookup failed", error);
    return json({ error: "Permission check failed" }, 500);
  }
  const role = data?.role;
  if (!role || !["owner", "admin"].includes(role)) {
    return json({ error: "Forbidden" }, 403);
  }
  return null;
}

function buildMagicLink(siteUrl: string, token: string, brandId: string) {
  const base = siteUrl.replace(/\/$/, "");
  const url = new URL("/invite", base);
  url.searchParams.set("token", token);
  url.searchParams.set("brand", brandId);
  return url.toString();
}

async function hashToken(token: string) {
  const data = new TextEncoder().encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

type GeneratedLinkData = {
  properties?: {
    action_link?: string;
  };
};

type AuthApiErrorShape = {
  code?: string;
  message?: string;
};

type AdminAuthClient = ReturnType<typeof createServiceClient>["auth"]["admin"];

async function getExistingUserIdByEmail(admin: AdminAuthClient, email: string): Promise<string | null> {
  const getUserByEmail = (admin as unknown as { getUserByEmail?: (email: string) => Promise<{ data: { user: { id: string } | null } | null; error: { message: string } | null }> }).getUserByEmail;
  if (typeof getUserByEmail === "function") {
    const { data, error } = await getUserByEmail(email);
    if (error) {
      console.error("Existing user lookup failed", error);
      return null;
    }
    return data?.user?.id ?? null;
  }

  console.warn("Auth admin getUserByEmail is unavailable; skipping existing member check.");
  return null;
}

async function resendInviteMagicLink(email: string, redirectTo: string) {
  const supabase = createAnonClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo,
      shouldCreateUser: false,
    },
  });
  if (error) {
    console.error("Magic link resend failed", error);
    return { ok: false, message: error.message };
  }
  return { ok: true };
}

async function handleCreate(req: Request, input: z.infer<typeof InputSchema>) {
  if (input.action !== "create") return json({ error: "Invalid action" }, 400);

  const authed = createSupabaseForRequest(req);
  const service = createServiceClient();

  const { data: userData, error: userError } = await authed.auth.getUser();
  if (userError) {
    console.error("Auth user lookup failed", userError);
    return json({ error: "Not authenticated" }, 401);
  }
  const inviterId = userData?.user?.id ?? "";
  if (!inviterId) return json({ error: "Not authenticated" }, 401);

  const permissionError = await assertOwnerOrAdmin(authed, input.brandId, inviterId);
  if (permissionError) return permissionError;

  const email = input.email.toLowerCase();
  const existingUserId = await getExistingUserIdByEmail(service.auth.admin, email);
  if (existingUserId) {
    const { data: member, error: memberError } = await service
      .schema("brand_profiles")
      .from("permissions")
      .select("id")
      .eq("user_id", existingUserId)
      .eq("brand_profile_id", input.brandId)
      .maybeSingle();
    if (memberError) {
      console.error("Membership lookup failed", memberError);
      return json({ error: "Failed to validate invitee" }, 500);
    }
    if (member) return json({ error: "User is already a member of this brand" }, 400);
  }

  const token = crypto.randomUUID();
  const tokenHash = await hashToken(token);
  const siteUrl = input.siteUrl ?? Deno.env.get("SITE_URL") ?? Deno.env.get("NEXT_PUBLIC_SITE_URL");
  if (!siteUrl) return json({ error: "Missing site URL configuration" }, 500);

  const destination = buildMagicLink(siteUrl, token, input.brandId);

  const { error: upsertError, data: inviteRow } = await service
    .schema("brand_profiles")
    .from("invites")
    .upsert({
      brand_profile_id: input.brandId,
      email,
      role: input.role,
      token_hash: tokenHash,
      created_by: inviterId,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: "brand_profile_id,email" })
    .select("id")
    .single<{ id: string }>();

  if (upsertError) {
    console.error("Invite upsert failed", upsertError);
    return json({ error: upsertError.message }, 500);
  }

  const { data: linkData, error: linkError } = await service.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo: destination },
  });

  if (linkError) {
    const authError = linkError as AuthApiErrorShape;
    if (authError.code === "email_exists") {
      console.warn("Invite link blocked for existing user", authError);
      if (input.forceResend) {
        const resend = await resendInviteMagicLink(email, destination);
        return json(
          {
            ...(resend.ok
              ? { info: "Existing user. Magic link resent." }
              : { warning: "User already has an account. Share the invite link manually." }),
            code: "email_exists",
            link: destination,
            inviteId: inviteRow?.id ?? null,
            emailSent: resend.ok,
            existingUser: true,
            resent: true,
            resendError: resend.ok ? null : resend.message ?? "Unable to resend magic link.",
          },
          200,
        );
      }
      return json(
        {
          warning: "User already has an account. Share the invite link manually.",
          code: "email_exists",
          link: destination,
          inviteId: inviteRow?.id ?? null,
          emailSent: false,
          existingUser: true,
        },
        200,
      );
    }
    console.error("Link generation failed", linkError);
    return json({ error: authError.message ?? "Invite link generation failed" }, 500);
  }

  const actionLink = (linkData as GeneratedLinkData | null)?.properties?.action_link;

  const { error: inviteError } = await service.auth.admin.inviteUserByEmail(email, { redirectTo: destination });
  if (inviteError) {
    console.error("Auth invite email failed", inviteError);
  }

  return json({
    link: actionLink || destination,
    inviteId: inviteRow?.id ?? null,
    emailSent: !inviteError,
  });
}

async function handleAccept(req: Request, input: z.infer<typeof InputSchema>) {
  const authed = createSupabaseForRequest(req);
  const service = createServiceClient();

  const { data: userData } = await authed.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: "Not authenticated" }, 401);

  const tokenHash = await hashToken(input.token);
  const nowIso = new Date().toISOString();
  const { data: invite, error: inviteError } = await service
    .schema("brand_profiles")
    .from("invites")
    .select("*")
    .eq("token_hash", tokenHash)
    .eq("brand_profile_id", input.brandId)
    .is("revoked_at", null)
    .is("accepted_at", null)
    .gt("expires_at", nowIso)
    .maybeSingle();

  if (inviteError || !invite) return json({ error: "Invalid or used invite" }, 400);
  if (!invite.expires_at || new Date(invite.expires_at).getTime() <= Date.now()) {
    return json({ error: "Invite expired" }, 400);
  }
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
  const { error: acceptError } = await service
    .schema("brand_profiles")
    .from("invites")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invite.id);
  if (acceptError) {
    console.error("Invite accept update failed", acceptError);
    return json({ error: acceptError.message }, 500);
  }

  return json({ brandId: invite.brand_profile_id });
}

async function handler(req: Request): Promise<Response> {
  try {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
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
  } catch (err) {
    console.error("Unhandled error", err);
    return json({ error: "Internal server error" }, 500);
  }
}

Deno.serve(handler);

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
// RESEND_API_KEY
// RESEND_REPLY_TO (optional, defaults to product@trycontinuum.ai)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLATFORM_KEYS = [
  "youtube",
  "instagram",
  "facebook",
  "tiktok",
  "linkedin",
  "googleAds",
  "amazonAds",
  "dv360",
  "threads",
] as const;

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

function buildDefaultConnections() {
  return PLATFORM_KEYS.reduce((acc, key) => {
    acc[key] = {
      connected: false,
      accountId: null,
      accounts: [],
      integrationIds: [],
      lastSyncedAt: null,
    };
    return acc;
  }, {} as Record<(typeof PLATFORM_KEYS)[number], {
    connected: boolean;
    accountId: string | null;
    accounts: unknown[];
    integrationIds: string[];
    lastSyncedAt: string | null;
  }>);
}

function buildDefaultOnboardingState(options: {
  userId: string;
  email: string;
  role: string;
  brandName?: string | null;
}) {
  const nameSeed = options.email.split("@")[0] ?? "Brand";
  return {
    step: 0,
    brand: {
      name: options.brandName ?? `${nameSeed}'s Brand`,
      industry: "",
      brandVoice: null,
      brandVoiceTags: [],
      targetAudience: null,
      timezone: "UTC",
      website: null,
      logoPath: null,
    },
    documents: [],
    connections: buildDefaultConnections(),
    members: [
      {
        id: options.userId,
        email: options.email,
        role: options.role,
      },
    ],
    invites: [],
    completedAt: null,
    preview: null,
  };
}

type GeneratedLinkData = {
  properties?: {
    action_link?: string;
  };
  user?: {
    id?: string;
  };
};

type AuthApiErrorShape = {
  code?: string;
  message?: string;
};

type ResendResponse = {
  id?: string;
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

const RESEND_FROM = "Continuum <product@trycontinuum.ai>";

async function sendResendEmail(options: {
  to: string;
  subject: string;
  html: string;
  idempotencyKey?: string;
}) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const replyTo = Deno.env.get("RESEND_REPLY_TO") ?? "product@trycontinuum.ai";
  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [options.to],
      subject: options.subject,
      html: options.html,
      replyTo,
    }),
  });

  const data = (await response.json().catch(() => ({}))) as ResendResponse;
  if (!response.ok) {
    return { ok: false, message: data.message ?? "Resend email failed" };
  }

  return { ok: true, id: data.id ?? null };
}

async function ensureActiveBrandForUser(options: {
  service: ReturnType<typeof createServiceClient>;
  userId: string;
  email: string;
  role: string;
  brandId: string;
  brandName: string | null;
  existingMetadata: Record<string, unknown>;
}) {
  const { service, userId, brandId, role, email, brandName, existingMetadata } = options;
  const now = new Date().toISOString();

  const { data: existingState, error: stateError } = await service
    .schema("brand_profiles")
    .from("user_onboarding_states")
    .select("state")
    .eq("user_id", userId)
    .eq("brand_id", brandId)
    .maybeSingle();

  if (stateError) {
    throw stateError;
  }

  const state = existingState?.state ?? buildDefaultOnboardingState({
    userId,
    email,
    role,
    brandName,
  });

  const { error: deactivateError } = await service
    .schema("brand_profiles")
    .from("user_onboarding_states")
    .update({ is_active: false, updated_at: now })
    .eq("user_id", userId)
    .eq("is_active", true)
    .neq("brand_id", brandId);
  if (deactivateError && deactivateError.code !== "PGRST116") {
    throw deactivateError;
  }

  const { error: upsertError } = await service
    .schema("brand_profiles")
    .from("user_onboarding_states")
    .upsert(
      {
        user_id: userId,
        brand_id: brandId,
        state,
        is_active: true,
        updated_at: now,
      },
      { onConflict: "user_id,brand_id" }
    );
  if (upsertError) {
    throw upsertError;
  }

  const nextMetadata = {
    ...existingMetadata,
    onboarding: {
      ...(typeof (existingMetadata as { onboarding?: Record<string, unknown> }).onboarding === "object"
        ? (existingMetadata as { onboarding?: Record<string, unknown> }).onboarding
        : {}),
      activeBrandId: brandId,
    },
  };

  const { error: metadataError } = await service.auth.admin.updateUserById(userId, {
    user_metadata: nextMetadata,
  });
  if (metadataError) {
    throw metadataError;
  }
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
  const token = crypto.randomUUID();
  const tokenHash = await hashToken(token);
  const siteUrl = input.siteUrl ?? Deno.env.get("SITE_URL") ?? Deno.env.get("NEXT_PUBLIC_SITE_URL");
  if (!siteUrl) return json({ error: "Missing site URL configuration" }, 500);

  const destination = buildMagicLink(siteUrl, token, input.brandId);

  let linkType: "invite" | "magiclink" = "invite";
  let linkData: GeneratedLinkData | null = null;

  const inviteLink = await service.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo: destination },
  });

  if (inviteLink.error) {
    const authError = inviteLink.error as AuthApiErrorShape;
    if (authError.code === "email_exists") {
      linkType = "magiclink";
      const magicLink = await service.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo: destination },
      });
      if (magicLink.error) {
        console.error("Magic link generation failed", magicLink.error);
        return json({ error: magicLink.error.message ?? "Magic link generation failed" }, 500);
      }
      linkData = magicLink.data as GeneratedLinkData | null;
    } else {
      console.error("Invite link generation failed", inviteLink.error);
      return json({ error: authError.message ?? "Invite link generation failed" }, 500);
    }
  } else {
    linkData = inviteLink.data as GeneratedLinkData | null;
  }

  const actionLink = linkData?.properties?.action_link ?? destination;
  const linkUserId =
    linkData?.user?.id ?? (linkType === "magiclink" ? await getExistingUserIdByEmail(service.auth.admin, email) : null);

  if (linkUserId) {
    const { data: member, error: memberError } = await service
      .schema("brand_profiles")
      .from("permissions")
      .select("id")
      .eq("user_id", linkUserId)
      .eq("brand_profile_id", input.brandId)
      .maybeSingle();
    if (memberError) {
      console.error("Membership lookup failed", memberError);
      return json({ error: "Failed to validate invitee" }, 500);
    }
    if (member) return json({ error: "User is already a member of this brand" }, 400);
  }

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

  if (linkType === "magiclink" && linkUserId) {
    const { error: permError } = await service
      .schema("brand_profiles")
      .from("permissions")
      .upsert(
        {
          user_id: linkUserId,
          brand_profile_id: input.brandId,
          role: input.role,
        },
        { onConflict: "user_id,brand_profile_id" }
      );
    if (permError) {
      console.error("Permissions upsert failed", permError);
      return json({ error: permError.message }, 500);
    }
  }

  const { data: brandRow, error: brandError } = await service
    .schema("brand_profiles")
    .from("brand_profiles")
    .select("brand_name")
    .eq("id", input.brandId)
    .maybeSingle();
  if (brandError) {
    console.error("Brand lookup failed", brandError);
    return json({ error: "Unable to resolve brand details" }, 500);
  }

  const inviterEmail = userData?.user?.email ?? "a teammate";
  const brandName = brandRow?.brand_name ?? "Continuum";
  const subject = `${inviterEmail} invited you to ${brandName}`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <p>${inviterEmail} invited you to join <strong>${brandName}</strong> on Continuum.</p>
      <p>Role: <strong>${input.role}</strong></p>
      <p><a href="${actionLink}" style="display:inline-block;padding:12px 20px;background:#111;color:#fff;text-decoration:none;border-radius:6px;">Accept invite</a></p>
      <p>If the button does not work, copy and paste this link:</p>
      <p><a href="${actionLink}">${actionLink}</a></p>
    </div>
  `;

  let emailSent = false;
  let warning: string | undefined;
  try {
    const idempotencyKey = input.forceResend ? undefined : `brand-invite:${inviteRow?.id ?? "unknown"}:${tokenHash}`;
    const emailResult = await sendResendEmail({
      to: email,
      subject,
      html,
      idempotencyKey,
    });
    emailSent = emailResult.ok;
    if (!emailResult.ok) {
      warning = emailResult.message ?? "Invite link created but email failed to send.";
    }
  } catch (err) {
    console.error("Resend email failed", err);
    warning = "Invite link created but email failed to send.";
  }

  return json({
    link: actionLink,
    inviteId: inviteRow?.id ?? null,
    emailSent,
    existingUser: linkType === "magiclink",
    resent: Boolean(input.forceResend && linkType === "magiclink"),
    ...(warning ? { warning } : {}),
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

  const { data: brandRow, error: brandError } = await service
    .schema("brand_profiles")
    .from("brand_profiles")
    .select("brand_name")
    .eq("id", invite.brand_profile_id)
    .maybeSingle();
  if (brandError) {
    console.error("Brand lookup failed", brandError);
    return json({ error: "Unable to resolve brand details" }, 500);
  }

  try {
    await ensureActiveBrandForUser({
      service,
      userId: user.id,
      email: user.email ?? invite.email ?? "",
      role: invite.role,
      brandId: invite.brand_profile_id,
      brandName: brandRow?.brand_name ?? null,
      existingMetadata: (user.user_metadata ?? {}) as Record<string, unknown>,
    });
  } catch (error) {
    console.error("Active brand update failed", error);
    return json({ error: "Failed to set active brand" }, 500);
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

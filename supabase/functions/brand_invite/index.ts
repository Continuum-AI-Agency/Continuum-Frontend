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
import { extractBearerToken } from "../_shared/supabase-edge-auth.ts";

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
  z.object({
    action: z.literal("remove_member"),
    brandId: z.string().uuid(),
    userId: z.string().uuid().optional(),
    email: z.string().email().optional(),
  }),
  z.object({
    action: z.literal("change_role"),
    brandId: z.string().uuid(),
    userId: z.string().uuid(),
    role: z.enum(["admin", "operator", "viewer"]),
  }),
]);

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

type Logger = {
  info: (message: string, details?: Record<string, unknown>) => void;
  error: (message: string, details?: Record<string, unknown>) => void;
};

function createLogger(requestId: string): Logger {
  const prefix = `[brand_invite:${requestId}]`;
  return {
    info: (message, details) => {
      if (details) {
        console.log(prefix, message, details);
        return;
      }
      console.log(prefix, message);
    },
    error: (message, details) => {
      if (details) {
        console.error(prefix, message, details);
        return;
      }
      console.error(prefix, message);
    },
  };
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
  logger: Logger,
): Promise<Response | null> {
  const { data, error } = await supabase
    .schema("brand_profiles")
    .from("permissions")
    .select("role")
    .eq("brand_profile_id", brandId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    logger.error("Permission lookup failed", { error });
    return json({ error: "Permission check failed" }, 500);
  }
  const role = data?.role;
  if (!role || !["owner", "admin"].includes(role)) {
    logger.info("Permission denied", { brandId, userId, role });
    return json({ error: "Forbidden" }, 403);
  }
  return null;
}

function buildMagicLink(siteUrl: string, token: string, brandId: string) {
  const base = siteUrl.replace(/\/$/, "");
  const url = new URL("/invite/callback", base);
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

async function setActiveBrandPreference(options: {
  service: ReturnType<typeof createServiceClient>;
  userId: string;
  brandId: string;
  logger: Logger;
}) {
  const { service, userId, brandId, logger } = options;
  const { error: upsertPreferenceError } = await service
    .schema("brand_profiles")
    .from("user_brand_preferences")
    .upsert(
      {
        user_id: userId,
        active_brand_id: brandId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (upsertPreferenceError) {
    logger.error("Failed to upsert active brand preference", {
      error: upsertPreferenceError,
      userId,
      brandId,
    });
  }
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

async function updateActiveBrandMetadata(options: {
  service: ReturnType<typeof createServiceClient>;
  userId: string;
  brandId: string;
  existingMetadata: Record<string, unknown>;
}) {
  const { service, userId, brandId, existingMetadata } = options;

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

async function handleCreate(req: Request, input: z.infer<typeof InputSchema>, logger: Logger) {
  if (input.action !== "create") return json({ error: "Invalid action" }, 400);

  const authed = createSupabaseForRequest(req);
  const service = createServiceClient();

  const { data: userData, error: userError } = await authed.auth.getClaims(
    extractBearerToken(req.headers.get("Authorization")),
  );
  if (userError) {
    logger.error("Auth user lookup failed", { error: userError });
    return json({ error: "Not authenticated" }, 401);
  }
  const inviterId = userData?.claims?.sub ?? "";
  if (!inviterId) return json({ error: "Not authenticated" }, 401);

  logger.info("Invite create requested", {
    brandId: input.brandId,
    email: input.email,
    role: input.role,
    inviterId,
    forceResend: Boolean(input.forceResend),
  });

  const permissionError = await assertOwnerOrAdmin(authed, input.brandId, inviterId, logger);
  if (permissionError) return permissionError;

  const email = input.email.toLowerCase();
  const token = crypto.randomUUID();
  const tokenHash = await hashToken(token);
  const siteUrl = input.siteUrl ?? Deno.env.get("SITE_URL") ?? Deno.env.get("NEXT_PUBLIC_SITE_URL");
  if (!siteUrl) return json({ error: "Missing site URL configuration" }, 500);

  const destination = buildMagicLink(siteUrl, token, input.brandId);

  let linkType: "invite" | "magiclink" = "invite";
  let linkData: GeneratedLinkData | null = null;

  const generatedInviteLink = await service.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo: destination },
  });

  if (generatedInviteLink.error) {
    const authError = generatedInviteLink.error as AuthApiErrorShape;
    if (authError.code === "email_exists") {
      linkType = "magiclink";
      const magicLink = await service.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo: destination },
      });
      if (magicLink.error) {
        logger.error("Magic link generation failed", { error: magicLink.error });
        return json({ error: magicLink.error.message ?? "Magic link generation failed" }, 500);
      }
      linkData = magicLink.data as GeneratedLinkData | null;
    } else {
      logger.error("Invite link generation failed", { error: generatedInviteLink.error });
      return json({ error: authError.message ?? "Invite link generation failed" }, 500);
    }
  } else {
    linkData = generatedInviteLink.data as GeneratedLinkData | null;
  }

  const generatedActionLink = linkData?.properties?.action_link ?? destination;
  const inviteLink = destination;
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
      logger.error("Membership lookup failed", { error: memberError });
      return json({ error: "Failed to validate invitee" }, 500);
    }
    if (member) {
      logger.info("Invite rejected: already a member", { brandId: input.brandId, userId: linkUserId });
      return json({ error: "User is already a member of this brand" }, 400);
    }
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
      accepted_at: null,
      revoked_at: null,
    }, { onConflict: "brand_profile_id,email" })
    .select("id")
    .single<{ id: string }>();

  if (upsertError) {
    logger.error("Invite upsert failed", { error: upsertError });
    return json({ error: upsertError.message }, 500);
  }

  const { data: brandRow, error: brandError } = await service
    .schema("brand_profiles")
    .from("brand_profiles")
    .select("brand_name")
    .eq("id", input.brandId)
    .maybeSingle();
  if (brandError) {
    logger.error("Brand lookup failed", { error: brandError });
    return json({ error: "Unable to resolve brand details" }, 500);
  }

  const inviterEmail = userData?.user?.email ?? "a teammate";
  const brandName = brandRow?.brand_name ?? "Continuum";
  const subject = `${inviterEmail} invited you to ${brandName}`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <p>${inviterEmail} invited you to join <strong>${brandName}</strong> on Continuum.</p>
      <p>Role: <strong>${input.role}</strong></p>
      <p><a href="${inviteLink}" style="display:inline-block;padding:12px 20px;background:#111;color:#fff;text-decoration:none;border-radius:6px;">Accept invite</a></p>
      ${
        generatedActionLink !== inviteLink
          ? `<p>Optional one-click sign-in link: <a href="${generatedActionLink}">${generatedActionLink}</a></p>`
          : ""
      }
      <p>If the button does not work, copy and paste this link:</p>
      <p><a href="${inviteLink}">${inviteLink}</a></p>
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
      logger.error("Resend email failed", { message: warning });
    }
  } catch (err) {
    logger.error("Resend email failed", { error: err });
    warning = "Invite link created but email failed to send.";
  }

  return json({
    link: inviteLink,
    inviteId: inviteRow?.id ?? null,
    emailSent,
    existingUser: linkType === "magiclink",
    resent: Boolean(input.forceResend && linkType === "magiclink"),
    ...(warning ? { warning } : {}),
  });
}

async function handleAccept(req: Request, input: z.infer<typeof InputSchema>, logger: Logger) {
  const authed = createSupabaseForRequest(req);
  const service = createServiceClient();

  const { data: userData } = await authed.auth.getClaims(
    extractBearerToken(req.headers.get("Authorization")),
  );
  const user = {
    id: userData?.claims?.sub ?? "",
    email: typeof userData?.claims?.email === "string" ? userData.claims.email : undefined,
    user_metadata: (userData?.claims?.user_metadata ?? {}) as Record<string, unknown>,
  };
  if (!user.id) return json({ error: "Not authenticated" }, 401);

  logger.info("Invite accept requested", {
    brandId: input.brandId,
    userId: user.id,
    userEmail: user.email,
  });

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

  const { error: permError } = await service
    .schema("brand_profiles")
    .from("permissions")
    .upsert(
      {
        user_id: user.id,
        brand_profile_id: invite.brand_profile_id,
        email: user.email ?? invite.email,
        role: invite.role,
      },
      { onConflict: "user_id,brand_profile_id" }
    );
  if (permError) {
    logger.error("Permissions upsert failed", { error: permError });
    return json({ error: permError.message }, 500);
  }

  await setActiveBrandPreference({
    service,
    userId: user.id,
    brandId: invite.brand_profile_id,
    logger,
  });

  try {
    await updateActiveBrandMetadata({
      service,
      userId: user.id,
      brandId: invite.brand_profile_id,
      existingMetadata: (user.user_metadata ?? {}) as Record<string, unknown>,
    });
  } catch (error) {
    logger.error("Active brand metadata update failed", { error });
  }

  const { error: acceptError } = await service
    .schema("brand_profiles")
    .from("invites")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invite.id);
  if (acceptError) {
    logger.error("Invite accept update failed", { error: acceptError });
    return json({ error: acceptError.message }, 500);
  }

  return json({ brandId: invite.brand_profile_id });
}

async function handleRemoveMember(req: Request, input: z.infer<typeof InputSchema>, logger: Logger) {
  if (input.action !== "remove_member") return json({ error: "Invalid action" }, 400);
  if (!input.userId && !input.email) {
    return json({ error: "userId or email is required" }, 400);
  }

  const authed = createSupabaseForRequest(req);
  const service = createServiceClient();

  const { data: userData, error: userError } = await authed.auth.getClaims(
    extractBearerToken(req.headers.get("Authorization")),
  );
  if (userError) {
    logger.error("Auth user lookup failed", { error: userError });
    return json({ error: "Not authenticated" }, 401);
  }

  const actorId = userData?.claims?.sub ?? "";
  if (!actorId) return json({ error: "Not authenticated" }, 401);

  const permissionError = await assertOwnerOrAdmin(authed, input.brandId, actorId, logger);
  if (permissionError) return permissionError;

  const email = input.email?.toLowerCase();
  const nowIso = new Date().toISOString();

  if (input.userId) {
    const { error: deleteError } = await service
      .schema("brand_profiles")
      .from("permissions")
      .delete()
      .eq("brand_profile_id", input.brandId)
      .eq("user_id", input.userId);

    if (deleteError) {
      logger.error("Permission delete failed", { error: deleteError });
      return json({ error: deleteError.message }, 500);
    }

    // Cascade: soft-revoke any active brand_integration_grants where the
    // removed user was the granter. Other granters' grants survive.
    const { error: cascadeError } = await service
      .schema("brand_profiles")
      .from("brand_integration_grants")
      .update({ revoked_at: nowIso, revoked_by: actorId })
      .eq("brand_profile_id", input.brandId)
      .eq("granted_by", input.userId)
      .is("revoked_at", null);

    if (cascadeError) {
      logger.error("Brand integration grant cascade revoke failed", { error: cascadeError });
      // Non-fatal: member is removed, grants will surface in audit.
    }
  }

  if (email) {
    const { error: deleteError } = await service
      .schema("brand_profiles")
      .from("permissions")
      .delete()
      .eq("brand_profile_id", input.brandId)
      .eq("email", email);

    if (deleteError) {
      logger.error("Permission delete by email failed", { error: deleteError });
      return json({ error: deleteError.message }, 500);
    }

    const { error: inviteError } = await service
      .schema("brand_profiles")
      .from("invites")
      .update({ revoked_at: nowIso })
      .eq("brand_profile_id", input.brandId)
      .eq("email", email)
      .is("accepted_at", null)
      .is("revoked_at", null);

    if (inviteError) {
      logger.error("Invite revoke failed", { error: inviteError });
      return json({ error: inviteError.message }, 500);
    }
  }

  logger.info("Member removed", {
    brandId: input.brandId,
    userId: input.userId ?? null,
    email: email ?? null,
    actorId,
  });

  return json({ ok: true });
}

async function handleChangeRole(req: Request, input: z.infer<typeof InputSchema>, logger: Logger) {
  if (input.action !== "change_role") return json({ error: "Invalid action" }, 400);

  const authed = createSupabaseForRequest(req);
  const service = createServiceClient();

  const { data: userData, error: userError } = await authed.auth.getClaims(
    extractBearerToken(req.headers.get("Authorization")),
  );
  if (userError) {
    logger.error("Auth user lookup failed", { error: userError });
    return json({ error: "Not authenticated" }, 401);
  }
  const actorId = userData?.claims?.sub ?? "";
  if (!actorId) return json({ error: "Not authenticated" }, 401);

  const permissionError = await assertOwnerOrAdmin(authed, input.brandId, actorId, logger);
  if (permissionError) return permissionError;

  // Guard: cannot demote the last owner. We only allow change_role to non-owner
  // roles (admin|operator|viewer), but the target may currently be `owner`.
  const { data: currentRow, error: currentRowError } = await service
    .schema("brand_profiles")
    .from("permissions")
    .select("role")
    .eq("brand_profile_id", input.brandId)
    .eq("user_id", input.userId)
    .single();

  if (currentRowError || !currentRow) {
    logger.error("Target permission row not found", { error: currentRowError });
    return json({ error: "Member not found" }, 404);
  }

  if (currentRow.role === "owner") {
    const { count, error: countError } = await service
      .schema("brand_profiles")
      .from("permissions")
      .select("user_id", { count: "exact", head: true })
      .eq("brand_profile_id", input.brandId)
      .eq("role", "owner");

    if (countError) {
      logger.error("Owner count failed", { error: countError });
      return json({ error: countError.message }, 500);
    }
    if ((count ?? 0) <= 1) {
      return json({ error: "Cannot demote the last owner of this brand" }, 400);
    }
  }

  const { error: updateError } = await service
    .schema("brand_profiles")
    .from("permissions")
    .update({ role: input.role })
    .eq("brand_profile_id", input.brandId)
    .eq("user_id", input.userId);

  if (updateError) {
    logger.error("Role update failed", { error: updateError });
    return json({ error: updateError.message }, 500);
  }

  logger.info("Role changed", {
    brandId: input.brandId,
    targetUserId: input.userId,
    newRole: input.role,
    actorId,
  });

  return json({ ok: true });
}

async function handler(req: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const logger = createLogger(requestId);
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
      return await handleCreate(req, parsed, logger);
    }
    if (parsed.action === "accept") {
      return await handleAccept(req, parsed, logger);
    }
    if (parsed.action === "change_role") {
      return await handleChangeRole(req, parsed, logger);
    }
    return await handleRemoveMember(req, parsed, logger);
  } catch (err) {
    logger.error("Unhandled error", { error: err });
    return json({ error: "Internal server error" }, 500);
  }
}

Deno.serve(handler);

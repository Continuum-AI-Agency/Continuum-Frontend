// Edge function: rule-actions
//
// Authenticated proxy for the DCO rule-actions queue at dco.api.trycontinuum.ai.
// The upstream API has no auth and trusts a client-supplied actorId. This edge
// function verifies the Supabase JWT, derives actorId from claims.email, and
// mirrors every decision to brand_profiles.rule_action_decisions so the
// Continuum side has its own audit trail without coordinating with the dco team.
//
// Env vars:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//   DCO_API_BASE_URL (optional, defaults to https://dco.api.trycontinuum.ai/api)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { extractBearerToken } from "../_shared/supabase-edge-auth.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_DCO_BASE = "https://dco.api.trycontinuum.ai/api";

const InputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("list"),
    brandId: z.string().uuid(),
    status: z.enum(["PENDING", "EXECUTED", "FAILED", "REJECTED", "EXPIRED"]).optional(),
    limit: z.number().int().min(1).max(200).optional(),
    offset: z.number().int().min(0).optional(),
  }),
  z.object({
    action: z.literal("get"),
    brandId: z.string().uuid(),
    ruleActionId: z.string().min(1),
  }),
  z.object({
    action: z.literal("approve"),
    brandId: z.string().uuid(),
    ruleActionId: z.string().min(1),
    note: z.string().max(2000).optional(),
  }),
  z.object({
    action: z.literal("reject"),
    brandId: z.string().uuid(),
    ruleActionId: z.string().min(1),
    reason: z.string().min(1).max(2000),
  }),
  z.object({
    action: z.literal("dryRun"),
  }),
]);

type Input = z.infer<typeof InputSchema>;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function getDcoBase() {
  return (Deno.env.get("DCO_API_BASE_URL") ?? DEFAULT_DCO_BASE).replace(/\/$/, "");
}

type Claims = {
  sub: string;
  email: string;
};

function authedClient(req: Request) {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  const authHeader = req.headers.get("Authorization") ?? "";
  return createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
}

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function getClaims(req: Request): Promise<Claims | null> {
  const supabase = authedClient(req);
  const token = extractBearerToken(req.headers.get("Authorization"));
  if (!token) return null;
  const { data, error } = await supabase.auth.getClaims(token);
  const sub = typeof data?.claims?.sub === "string" ? data.claims.sub : "";
  const email = typeof data?.claims?.email === "string" ? data.claims.email : "";
  if (error || !sub || !email) return null;
  return { sub, email };
}

async function assertBrandAccess(brandId: string, userId: string): Promise<boolean> {
  const supabase = serviceClient();
  const { data, error } = await supabase
    .schema("brand_profiles")
    .from("permissions")
    .select("role")
    .eq("brand_profile_id", brandId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return false;
  return Boolean(data?.role);
}

type DcoResponse = { status: number; body: unknown };

async function dcoFetch(path: string, init?: RequestInit): Promise<DcoResponse> {
  const res = await fetch(`${getDcoBase()}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

type ActionRowSummary = {
  action_type?: string;
  scope_type?: string | null;
  scope_id?: string | null;
  result?: Record<string, unknown> | null;
  is_dry_run?: boolean;
};

function summarizeAction(body: unknown): ActionRowSummary {
  if (!body || typeof body !== "object") return {};
  const row = body as Record<string, unknown>;
  // If the response is { status: 'ALREADY_EXECUTED', action: {...} } unwrap.
  const candidate = (row.action && typeof row.action === "object" ? row.action : row) as Record<string, unknown>;
  return {
    action_type: typeof candidate.action_type === "string" ? candidate.action_type : undefined,
    scope_type: typeof candidate.scope_type === "string" ? candidate.scope_type : null,
    scope_id: typeof candidate.scope_id === "string" ? candidate.scope_id : null,
    result: candidate.result && typeof candidate.result === "object"
      ? candidate.result as Record<string, unknown>
      : null,
    is_dry_run: typeof candidate.is_dry_run === "boolean" ? candidate.is_dry_run : false,
  };
}

async function mirrorDecision(args: {
  brandId: string;
  ruleActionId: string;
  decision: "APPROVED" | "REJECTED" | "FAILED";
  claims: Claims;
  note?: string | null;
  reason?: string | null;
  error?: string | null;
  summary: ActionRowSummary;
}) {
  const supabase = serviceClient();
  const { error } = await supabase
    .from("rule_action_decisions")
    .insert({
      brand_id: args.brandId,
      rule_action_id: args.ruleActionId,
      decision: args.decision,
      action_type: args.summary.action_type ?? "UNKNOWN",
      scope_type: args.summary.scope_type ?? null,
      scope_id: args.summary.scope_id ?? null,
      actor_id: args.claims.email,
      actor_user_id: args.claims.sub,
      note: args.note ?? null,
      reason: args.reason ?? null,
      error: args.error ?? null,
      is_dry_run: args.summary.is_dry_run ?? false,
      upstream_result: args.summary.result ?? null,
    });
  if (error) {
    console.error("[rule-actions] mirror failed", { ruleActionId: args.ruleActionId, error });
  }
}

async function handleList(input: Extract<Input, { action: "list" }>) {
  const params = new URLSearchParams();
  if (input.status) params.set("status", input.status);
  params.set("limit", String(input.limit ?? 50));
  params.set("offset", String(input.offset ?? 0));
  const { status, body } = await dcoFetch(`/rules/actions?${params.toString()}`);
  return json(body && typeof body === "object" ? body as Record<string, unknown> : { error: "Bad upstream response" }, status);
}

async function handleGet(input: Extract<Input, { action: "get" }>) {
  // The dco list endpoint does not expose a get-by-id, so re-list the same status
  // filter and pick by id. Sufficient for the just-in-time re-fetch before approve.
  const { status, body } = await dcoFetch(`/rules/actions?status=PENDING&limit=200&offset=0`);
  if (status !== 200 || !body || typeof body !== "object") {
    return json({ error: "Failed to refresh action" }, status);
  }
  const data = (body as { data?: unknown[] }).data ?? [];
  const row = data.find((r) => (r as { id?: string })?.id === input.ruleActionId) ?? null;
  return json({ action: row });
}

async function handleApprove(input: Extract<Input, { action: "approve" }>, claims: Claims) {
  const { status, body } = await dcoFetch(`/rules/actions/${encodeURIComponent(input.ruleActionId)}/approve`, {
    method: "POST",
    body: JSON.stringify({ actorId: claims.email, note: input.note ?? "Approved via Continuum" }),
  });

  const summary = summarizeAction(body);
  const errorMessage = typeof (body as { error?: unknown })?.error === "string"
    ? (body as { error: string }).error
    : null;

  // Per APPROVALS_API.md §5.2 — 500 means upstream execution failed and the row
  // is now FAILED; treat it as a business outcome and mirror, then surface to caller.
  if (status >= 200 && status < 300) {
    const isAlreadyExecuted = (body as { status?: string })?.status === "ALREADY_EXECUTED";
    await mirrorDecision({
      brandId: input.brandId,
      ruleActionId: input.ruleActionId,
      decision: "APPROVED",
      claims,
      note: input.note ?? null,
      summary,
    });
    return json({
      ok: true,
      alreadyExecuted: isAlreadyExecuted,
      action: (body as { action?: unknown })?.action ?? body,
    }, 200);
  }

  await mirrorDecision({
    brandId: input.brandId,
    ruleActionId: input.ruleActionId,
    decision: "FAILED",
    claims,
    note: input.note ?? null,
    error: errorMessage ?? `Upstream HTTP ${status}`,
    summary,
  });
  return json({ ok: false, error: errorMessage ?? `Upstream HTTP ${status}` }, 200);
}

async function handleReject(input: Extract<Input, { action: "reject" }>, claims: Claims) {
  const { status, body } = await dcoFetch(`/rules/actions/${encodeURIComponent(input.ruleActionId)}/reject`, {
    method: "POST",
    body: JSON.stringify({ actorId: claims.email, reason: input.reason }),
  });

  const summary = summarizeAction(body);
  const errorMessage = typeof (body as { error?: unknown })?.error === "string"
    ? (body as { error: string }).error
    : null;

  if (status >= 200 && status < 300) {
    await mirrorDecision({
      brandId: input.brandId,
      ruleActionId: input.ruleActionId,
      decision: "REJECTED",
      claims,
      reason: input.reason,
      summary,
    });
    return json({ ok: true, action: body });
  }
  return json({ ok: false, error: errorMessage ?? `Upstream HTTP ${status}` }, 200);
}

async function handleDryRun() {
  const { status, body } = await dcoFetch(`/settings/rules_dry_run_mode`);
  if (status !== 200 || !body || typeof body !== "object") {
    return json({ enabled: false }, 200);
  }
  const raw = (body as { value?: unknown }).value;
  const enabled = raw === true || raw === "true";
  return json({ enabled });
}

async function handler(req: Request): Promise<Response> {
  try {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    let parsed: Input;
    try {
      parsed = InputSchema.parse(await req.json());
    } catch (err) {
      return json({ error: "Invalid request", details: (err as Error).message }, 400);
    }

    if (parsed.action === "dryRun") {
      return await handleDryRun();
    }

    const claims = await getClaims(req);
    if (!claims) return json({ error: "Not authenticated" }, 401);

    const hasAccess = await assertBrandAccess(parsed.brandId, claims.sub);
    if (!hasAccess) return json({ error: "Forbidden" }, 403);

    if (parsed.action === "list") return await handleList(parsed);
    if (parsed.action === "get") return await handleGet(parsed);
    if (parsed.action === "approve") return await handleApprove(parsed, claims);
    return await handleReject(parsed, claims);
  } catch (err) {
    console.error("[rule-actions] unhandled", err);
    return json({ error: "Internal server error" }, 500);
  }
}

Deno.serve(handler);

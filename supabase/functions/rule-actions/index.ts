// Edge function: rule-actions
//
// Authenticated proxy for the DCO rule-actions queue at dco.api.trycontinuum.ai.
// The upstream API has no auth and trusts a client-supplied actorId. This edge
// function verifies the Supabase JWT, derives actorId from claims.email, and
// mirrors every decision to public.rule_action_decisions so the Continuum side
// has its own audit trail without coordinating with the dco team.
//
// Logging contract: every request gets a `reqId`. Every line is prefixed
// `[rule-actions:<reqId>]`. Sensitive material (JWT bearer, full payloads of
// unknown size) is NEVER logged; claims.email + claims.sub are considered
// internal-safe identifiers and are logged for traceability.
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

// ── Structured logger ────────────────────────────────────────────────────────

type LogDetails = Record<string, unknown>;

type Logger = {
  reqId: string;
  info: (event: string, details?: LogDetails) => void;
  warn: (event: string, details?: LogDetails) => void;
  error: (event: string, details?: LogDetails) => void;
  child: (extra: LogDetails) => Logger;
};

function createLogger(reqId: string, base: LogDetails = {}): Logger {
  const prefix = `[rule-actions:${reqId}]`;
  const emit = (level: "info" | "warn" | "error", event: string, details?: LogDetails) => {
    const payload = { ...base, ...(details ?? {}) };
    const out = Object.keys(payload).length > 0
      ? `${prefix} ${event} ${safeStringify(payload)}`
      : `${prefix} ${event}`;
    if (level === "error") console.error(out);
    else if (level === "warn") console.warn(out);
    else console.log(out);
  };
  return {
    reqId,
    info: (event, details) => emit("info", event, details),
    warn: (event, details) => emit("warn", event, details),
    error: (event, details) => emit("error", event, details),
    child: (extra) => createLogger(reqId, { ...base, ...extra }),
  };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, val) => {
      // Defensive: never let an Error slip through as `{}`.
      if (val instanceof Error) {
        return { name: val.name, message: val.message, stack: val.stack };
      }
      return val;
    });
  } catch {
    return "[unserializable]";
  }
}

function shortId(id: string | null | undefined): string | null {
  if (!id) return null;
  return id.length > 12 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id;
}

function actionSummary(parsed: Input): LogDetails {
  switch (parsed.action) {
    case "list":
      return { action: "list", brandId: parsed.brandId, status: parsed.status ?? "ALL", limit: parsed.limit ?? 50, offset: parsed.offset ?? 0 };
    case "get":
      return { action: "get", brandId: parsed.brandId, ruleActionId: shortId(parsed.ruleActionId) };
    case "approve":
      return { action: "approve", brandId: parsed.brandId, ruleActionId: shortId(parsed.ruleActionId), hasNote: Boolean(parsed.note) };
    case "reject":
      return { action: "reject", brandId: parsed.brandId, ruleActionId: shortId(parsed.ruleActionId), reasonLen: parsed.reason.length };
    case "dryRun":
      return { action: "dryRun" };
    default:
      return { action: (parsed as { action?: string }).action ?? "unknown" };
  }
}

// ── HTTP plumbing ────────────────────────────────────────────────────────────

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function getDcoBase() {
  return (Deno.env.get("DCO_API_BASE_URL") ?? DEFAULT_DCO_BASE).replace(/\/$/, "");
}

type Claims = { sub: string; email: string };

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

async function getClaims(req: Request, logger: Logger): Promise<Claims | null> {
  const t0 = performance.now();
  const supabase = authedClient(req);
  const token = extractBearerToken(req.headers.get("Authorization"));
  if (!token) {
    logger.warn("auth.missing_bearer");
    return null;
  }
  const { data, error } = await supabase.auth.getClaims(token);
  const ms = Math.round(performance.now() - t0);
  const sub = typeof data?.claims?.sub === "string" ? data.claims.sub : "";
  const email = typeof data?.claims?.email === "string" ? data.claims.email : "";
  if (error) {
    logger.warn("auth.get_claims_error", { ms, error: (error as Error).message ?? String(error) });
    return null;
  }
  if (!sub || !email) {
    logger.warn("auth.claims_incomplete", { ms, hasSub: Boolean(sub), hasEmail: Boolean(email) });
    return null;
  }
  logger.info("auth.ok", { ms, sub, email });
  return { sub, email };
}

async function assertBrandAccess(brandId: string, userId: string, logger: Logger): Promise<boolean> {
  const t0 = performance.now();
  const supabase = serviceClient();
  const { data, error } = await supabase
    .schema("brand_profiles")
    .from("permissions")
    .select("role")
    .eq("brand_profile_id", brandId)
    .eq("user_id", userId)
    .maybeSingle();
  const ms = Math.round(performance.now() - t0);
  if (error) {
    logger.error("brand_access.query_error", { ms, brandId, userId, error: (error as Error).message ?? String(error) });
    return false;
  }
  const role = data?.role ?? null;
  if (!role) {
    logger.warn("brand_access.denied", { ms, brandId, userId });
    return false;
  }
  logger.info("brand_access.ok", { ms, brandId, userId, role });
  return true;
}

type DcoResponse = { status: number; body: unknown; ms: number };

async function dcoFetch(path: string, init: RequestInit | undefined, logger: Logger): Promise<DcoResponse> {
  const url = `${getDcoBase()}${path}`;
  const method = init?.method ?? "GET";
  logger.info("dco.request", { method, path });
  const t0 = performance.now();
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch (err) {
    const ms = Math.round(performance.now() - t0);
    logger.error("dco.fetch_threw", { method, path, ms, error: (err as Error).message ?? String(err) });
    return { status: 599, body: { error: "Upstream fetch failed" }, ms };
  }
  const ms = Math.round(performance.now() - t0);
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const level: "info" | "warn" | "error" = res.status >= 500 ? "error" : res.status >= 400 ? "warn" : "info";
  const bodyKeys = body && typeof body === "object" ? Object.keys(body as Record<string, unknown>).slice(0, 12) : null;
  const dataLen = body && typeof body === "object" && Array.isArray((body as { data?: unknown[] }).data)
    ? ((body as { data: unknown[] }).data).length
    : null;
  logger[level]("dco.response", { method, path, status: res.status, ms, bodyKeys, dataLen });
  return { status: res.status, body, ms };
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
  logger: Logger;
}) {
  const t0 = performance.now();
  const supabase = serviceClient();
  const { data, error } = await supabase
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
    })
    .select("id")
    .maybeSingle();
  const ms = Math.round(performance.now() - t0);
  if (error) {
    args.logger.error("mirror.failed", {
      ms,
      ruleActionId: shortId(args.ruleActionId),
      decision: args.decision,
      brandId: args.brandId,
      pgCode: (error as { code?: string }).code,
      pgMessage: (error as Error).message ?? String(error),
    });
    return;
  }
  args.logger.info("mirror.ok", {
    ms,
    decisionRowId: shortId((data as { id?: string } | null)?.id ?? null),
    ruleActionId: shortId(args.ruleActionId),
    decision: args.decision,
    actionType: args.summary.action_type ?? "UNKNOWN",
    isDryRun: args.summary.is_dry_run ?? false,
  });
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async function handleList(input: Extract<Input, { action: "list" }>, logger: Logger) {
  const params = new URLSearchParams();
  if (input.status) params.set("status", input.status);
  params.set("limit", String(input.limit ?? 50));
  params.set("offset", String(input.offset ?? 0));
  const { status, body } = await dcoFetch(`/rules/actions?${params.toString()}`, undefined, logger);
  return json(
    body && typeof body === "object" ? body as Record<string, unknown> : { error: "Bad upstream response" },
    status,
  );
}

async function handleGet(input: Extract<Input, { action: "get" }>, logger: Logger) {
  const { status, body } = await dcoFetch(
    `/rules/actions?status=PENDING&limit=200&offset=0`,
    undefined,
    logger,
  );
  if (status !== 200 || !body || typeof body !== "object") {
    logger.warn("get.upstream_unavailable", { status });
    return json({ error: "Failed to refresh action" }, status);
  }
  const data = (body as { data?: unknown[] }).data ?? [];
  const row = data.find((r) => (r as { id?: string })?.id === input.ruleActionId) ?? null;
  logger.info("get.resolved", { found: Boolean(row), poolSize: data.length });
  return json({ action: row });
}

async function handleApprove(input: Extract<Input, { action: "approve" }>, claims: Claims, logger: Logger) {
  const { status, body } = await dcoFetch(
    `/rules/actions/${encodeURIComponent(input.ruleActionId)}/approve`,
    {
      method: "POST",
      body: JSON.stringify({ actorId: claims.email, note: input.note ?? "Approved via Continuum" }),
    },
    logger,
  );

  const summary = summarizeAction(body);
  const errorMessage = typeof (body as { error?: unknown })?.error === "string"
    ? (body as { error: string }).error
    : null;

  if (status >= 200 && status < 300) {
    const isAlreadyExecuted = (body as { status?: string })?.status === "ALREADY_EXECUTED";
    logger.info("approve.upstream_ok", {
      ruleActionId: shortId(input.ruleActionId),
      alreadyExecuted: isAlreadyExecuted,
      actionType: summary.action_type ?? null,
      isDryRun: summary.is_dry_run ?? false,
    });
    await mirrorDecision({
      brandId: input.brandId,
      ruleActionId: input.ruleActionId,
      decision: "APPROVED",
      claims,
      note: input.note ?? null,
      summary,
      logger,
    });
    return json({
      ok: true,
      alreadyExecuted: isAlreadyExecuted,
      action: (body as { action?: unknown })?.action ?? body,
    }, 200);
  }

  logger.warn("approve.upstream_failed", {
    ruleActionId: shortId(input.ruleActionId),
    status,
    error: errorMessage,
  });
  await mirrorDecision({
    brandId: input.brandId,
    ruleActionId: input.ruleActionId,
    decision: "FAILED",
    claims,
    note: input.note ?? null,
    error: errorMessage ?? `Upstream HTTP ${status}`,
    summary,
    logger,
  });
  return json({ ok: false, error: errorMessage ?? `Upstream HTTP ${status}` }, 200);
}

async function handleReject(input: Extract<Input, { action: "reject" }>, claims: Claims, logger: Logger) {
  const { status, body } = await dcoFetch(
    `/rules/actions/${encodeURIComponent(input.ruleActionId)}/reject`,
    {
      method: "POST",
      body: JSON.stringify({ actorId: claims.email, reason: input.reason }),
    },
    logger,
  );

  const summary = summarizeAction(body);
  const errorMessage = typeof (body as { error?: unknown })?.error === "string"
    ? (body as { error: string }).error
    : null;

  if (status >= 200 && status < 300) {
    logger.info("reject.upstream_ok", {
      ruleActionId: shortId(input.ruleActionId),
      actionType: summary.action_type ?? null,
    });
    await mirrorDecision({
      brandId: input.brandId,
      ruleActionId: input.ruleActionId,
      decision: "REJECTED",
      claims,
      reason: input.reason,
      summary,
      logger,
    });
    return json({ ok: true, action: body });
  }
  logger.warn("reject.upstream_failed", {
    ruleActionId: shortId(input.ruleActionId),
    status,
    error: errorMessage,
  });
  return json({ ok: false, error: errorMessage ?? `Upstream HTTP ${status}` }, 200);
}

async function handleDryRun(logger: Logger) {
  const { status, body } = await dcoFetch(`/settings/rules_dry_run_mode`, undefined, logger);
  if (status !== 200 || !body || typeof body !== "object") {
    logger.warn("dry_run.unavailable", { status });
    return json({ enabled: false }, 200);
  }
  const raw = (body as { value?: unknown }).value;
  const enabled = raw === true || raw === "true";
  logger.info("dry_run.resolved", { enabled, rawType: typeof raw });
  return json({ enabled });
}

// ── Top-level handler ────────────────────────────────────────────────────────

async function handler(req: Request): Promise<Response> {
  const reqId = crypto.randomUUID().slice(0, 8);
  const t0 = performance.now();
  const logger = createLogger(reqId, { method: req.method });

  try {
    if (req.method === "OPTIONS") {
      logger.info("preflight");
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (req.method !== "POST") {
      logger.warn("method.not_allowed");
      return json({ error: "Method not allowed" }, 405);
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch (err) {
      logger.warn("input.invalid_json", { error: (err as Error).message ?? String(err) });
      return json({ error: "Invalid JSON" }, 400);
    }

    let parsed: Input;
    try {
      parsed = InputSchema.parse(raw);
    } catch (err) {
      const issues = (err as { issues?: Array<{ path: (string | number)[]; message: string; code?: string }> }).issues;
      logger.warn("input.validation_failed", {
        issues: issues ? issues.map((i) => ({ path: i.path.join("."), code: i.code, message: i.message })) : undefined,
        rawAction: (raw as { action?: unknown })?.action ?? null,
      });
      return json({ error: "Invalid request", details: (err as Error).message }, 400);
    }

    const requestLogger = logger.child(actionSummary(parsed));
    requestLogger.info("request.start");

    let response: Response;
    if (parsed.action === "dryRun") {
      response = await handleDryRun(requestLogger);
    } else {
      const claims = await getClaims(req, requestLogger);
      if (!claims) {
        requestLogger.warn("response.unauthenticated");
        response = json({ error: "Not authenticated" }, 401);
      } else {
        const hasAccess = await assertBrandAccess(parsed.brandId, claims.sub, requestLogger);
        if (!hasAccess) {
          requestLogger.warn("response.forbidden");
          response = json({ error: "Forbidden" }, 403);
        } else if (parsed.action === "list") {
          response = await handleList(parsed, requestLogger);
        } else if (parsed.action === "get") {
          response = await handleGet(parsed, requestLogger);
        } else if (parsed.action === "approve") {
          response = await handleApprove(parsed, claims, requestLogger);
        } else {
          response = await handleReject(parsed, claims, requestLogger);
        }
      }
    }

    const ms = Math.round(performance.now() - t0);
    requestLogger.info("request.end", { status: response.status, ms });
    return response;
  } catch (err) {
    const ms = Math.round(performance.now() - t0);
    logger.error("unhandled", {
      ms,
      error: (err as Error).message ?? String(err),
      stack: (err as Error).stack,
    });
    return json({ error: "Internal server error" }, 500);
  }
}

Deno.serve(handler);

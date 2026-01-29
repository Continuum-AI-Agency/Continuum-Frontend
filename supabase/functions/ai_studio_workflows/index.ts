// deno-lint-ignore-file no-explicit-any
// Edge function: ai_studio_workflows
// Actions: list, create
// Env vars required:
// SUPABASE_URL
// SUPABASE_ANON_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { workflowActionSchema, type WorkflowAction } from "./validators.ts";
import type { WorkflowRow } from "./types.ts";
import { sanitizeWorkflowNodes } from "./sanitize.ts";

const DEFAULT_MAX_PAYLOAD_BYTES = 1024 * 1024;
const MAX_PAYLOAD_BYTES = Number(Deno.env.get("AI_STUDIO_WORKFLOWS_MAX_BYTES")) || DEFAULT_MAX_PAYLOAD_BYTES;
const decoder = new TextDecoder();

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

async function requireUser(supabase: ReturnType<typeof createSupabaseForRequest>) {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Not authenticated");
}

async function handleList(req: Request, input: Extract<WorkflowAction, { action: "list" }>) {
  const supabase = createSupabaseForRequest(req);
  await requireUser(supabase);

  const { data, error } = await supabase
    .schema("brand_profiles")
    .from("canvas_workflows")
    .select("*")
    .eq("brand_profile_id", input.brandProfileId)
    .order("updated_at", { ascending: false });

  if (error) return json({ error: error.message }, 400);
  return json({ workflows: (data ?? []) as WorkflowRow[] });
}

async function handleCreate(req: Request, input: Extract<WorkflowAction, { action: "create" }>) {
  const supabase = createSupabaseForRequest(req);
  await requireUser(supabase);
  const sanitizedNodes = sanitizeWorkflowNodes(input.nodes ?? []);

  const { data, error } = await supabase
    .schema("brand_profiles")
    .from("canvas_workflows")
    .insert({
      brand_profile_id: input.brandProfileId,
      name: input.name,
      description: input.description ?? null,
      nodes: sanitizedNodes,
      edges: input.edges ?? [],
      metadata: input.metadata ?? null,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) return json({ error: error.message }, 400);
  return json({ workflow: data as WorkflowRow });
}

async function handler(req: Request): Promise<Response> {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*" } });
    }
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    let parsed: WorkflowAction;
    let payloadBytes = 0;
    try {
      const buffer = await req.arrayBuffer();
      payloadBytes = buffer.byteLength;
      if (payloadBytes === 0) return json({ error: "Missing request body" }, 400);
      if (payloadBytes > MAX_PAYLOAD_BYTES) {
        return json({ error: "Payload too large", maxBytes: MAX_PAYLOAD_BYTES }, 413);
      }
      parsed = workflowActionSchema.parse(JSON.parse(decoder.decode(buffer)));
    } catch (err) {
      return json({ error: "Invalid request", details: (err as Error).message }, 400);
    }

    if (parsed.action === "list") {
      console.info("[ai_studio_workflows] list request", {
        brandProfileId: parsed.brandProfileId,
        payloadBytes,
      });
      return await handleList(req, parsed);
    }
    if (parsed.action === "create") {
      console.info("[ai_studio_workflows] create request", {
        brandProfileId: parsed.brandProfileId,
        nodes: parsed.nodes?.length ?? 0,
        edges: parsed.edges?.length ?? 0,
        payloadBytes,
      });
      return await handleCreate(req, parsed);
    }

    return json({ error: "Unsupported action" }, 400);
  } catch (err) {
    console.error("[ai_studio_workflows] unhandled error", err);
    return json({ error: "Unexpected error", details: (err as Error).message }, 500);
  }
}

Deno.serve(handler);

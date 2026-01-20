// deno-lint-ignore-file no-explicit-any
// Edge function: ai_studio_workflows
// Actions: list, create
// Env vars required:
// SUPABASE_URL
// SUPABASE_ANON_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { workflowActionSchema, type WorkflowAction } from "./validators.ts";
import type { WorkflowRow } from "./types.ts";

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

  const { data, error } = await supabase
    .schema("brand_profiles")
    .from("canvas_workflows")
    .insert({
      brand_profile_id: input.brandProfileId,
      name: input.name,
      description: input.description ?? null,
      nodes: input.nodes ?? [],
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
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*" } });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let parsed: WorkflowAction;
  try {
    parsed = workflowActionSchema.parse(await req.json());
  } catch (err) {
    return json({ error: "Invalid request", details: (err as Error).message }, 400);
  }

  if (parsed.action === "list") return await handleList(req, parsed);
  if (parsed.action === "create") return await handleCreate(req, parsed);

  return json({ error: "Unsupported action" }, 400);
}

Deno.serve(handler);

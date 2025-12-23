// deno-lint-ignore-file no-explicit-any
// Edge function: prompt_templates
// Actions: list, create, update, delete
// Env vars required:
// SUPABASE_URL
// SUPABASE_ANON_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { promptTemplateActionSchema, type PromptTemplateAction } from "./validators.ts";
import type { PromptTemplateRow } from "./types.ts";

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

async function handleList(req: Request, input: Extract<PromptTemplateAction, { action: "list" }>) {
  const supabase = createSupabaseForRequest(req);
  await requireUser(supabase);

  let query = supabase
    .schema("brand_profiles")
    .from("prompt_templates")
    .select("*")
    .eq("brand_profile_id", input.brandProfileId)
    .order("updated_at", { ascending: false });

  if (input.query) {
    query = query.ilike("name", `%${input.query}%`);
  }

  const { data, error } = await query;
  if (error) return json({ error: error.message }, 400);
  return json({ templates: (data ?? []) as PromptTemplateRow[] });
}

async function handleCreate(req: Request, input: Extract<PromptTemplateAction, { action: "create" }>) {
  const supabase = createSupabaseForRequest(req);
  await requireUser(supabase);

  const { data, error } = await supabase
    .schema("brand_profiles")
    .from("prompt_templates")
    .insert({
      brand_profile_id: input.brandProfileId,
      name: input.name,
      prompt: input.prompt,
      category: input.category ?? "Custom",
      source: "custom",
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) return json({ error: error.message }, 400);
  return json({ template: data as PromptTemplateRow });
}

async function handleUpdate(req: Request, input: Extract<PromptTemplateAction, { action: "update" }>) {
  const supabase = createSupabaseForRequest(req);
  await requireUser(supabase);

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.name) updatePayload.name = input.name;
  if (input.prompt) updatePayload.prompt = input.prompt;
  if (input.category) updatePayload.category = input.category;

  const { data, error } = await supabase
    .schema("brand_profiles")
    .from("prompt_templates")
    .update(updatePayload)
    .eq("id", input.id)
    .select("*")
    .single();

  if (error) return json({ error: error.message }, 400);
  return json({ template: data as PromptTemplateRow });
}

async function handleDelete(req: Request, input: Extract<PromptTemplateAction, { action: "delete" }>) {
  const supabase = createSupabaseForRequest(req);
  await requireUser(supabase);

  const { error } = await supabase
    .schema("brand_profiles")
    .from("prompt_templates")
    .delete()
    .eq("id", input.id);

  if (error) return json({ error: error.message }, 400);
  return json({ ok: true });
}

async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*" } });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let parsed: PromptTemplateAction;
  try {
    parsed = promptTemplateActionSchema.parse(await req.json());
  } catch (err) {
    return json({ error: "Invalid request", details: (err as Error).message }, 400);
  }

  if (parsed.action === "list") return await handleList(req, parsed);
  if (parsed.action === "create") return await handleCreate(req, parsed);
  if (parsed.action === "update") return await handleUpdate(req, parsed);
  if (parsed.action === "delete") return await handleDelete(req, parsed);

  return json({ error: "Unsupported action" }, 400);
}

Deno.serve(handler);

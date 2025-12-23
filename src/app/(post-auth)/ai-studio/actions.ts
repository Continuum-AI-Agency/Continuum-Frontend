"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  mapPromptTemplateRow,
  promptTemplateCreateSchema,
  promptTemplateListSchema,
  promptTemplateRowSchema,
  promptTemplateUpdateSchema,
  type PromptTemplate,
  type PromptTemplateCreateInput,
  type PromptTemplateListInput,
  type PromptTemplateRow,
  type PromptTemplateUpdateInput,
} from "@/lib/schemas/promptTemplates";

const FUNCTION_NAME = "prompt_templates";

type ListResponse = { templates: PromptTemplateRow[] };

type SingleResponse = { template: PromptTemplateRow };

type DeleteResponse = { ok: true };

type PromptTemplateAction =
  | {
      action: "list";
      brandProfileId: string;
      query?: string;
    }
  | {
      action: "create";
      brandProfileId: string;
      name: string;
      prompt: string;
      category?: string;
    }
  | {
      action: "update";
      id: string;
      name?: string;
      prompt?: string;
      category?: string;
    }
  | {
      action: "delete";
      id: string;
    };

function isMissingPromptTemplatesTable(error: unknown): boolean {
  if (!error) return false;
  const message = (error as { message?: string }).message;
  if (!message) return false;
  const normalized = message.toLowerCase();
  return normalized.includes("prompt_templates") && normalized.includes("does not exist");
}

async function invokePromptTemplatesFallback<T>(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  body: PromptTemplateAction
): Promise<T> {
  if (body.action === "list") {
    let query = supabase
      .schema("brand_profiles")
      .from("prompt_templates")
      .select("*")
      .eq("brand_profile_id", body.brandProfileId)
      .order("updated_at", { ascending: false });

    if (body.query) {
      query = query.ilike("name", `%${body.query}%`);
    }

    const { data, error } = await query;
    if (error) {
      if (isMissingPromptTemplatesTable(error)) {
        return { templates: [] as PromptTemplateRow[] } as T;
      }
      throw new Error(error.message || "Prompt templates request failed");
    }
    return { templates: (data ?? []) as PromptTemplateRow[] } as T;
  }

  if (body.action === "create") {
    const { data, error } = await supabase
      .schema("brand_profiles")
      .from("prompt_templates")
      .insert({
        brand_profile_id: body.brandProfileId,
        name: body.name,
        prompt: body.prompt,
        category: body.category ?? "Custom",
        source: "custom",
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message || "Prompt templates request failed");
    }
    if (!data) {
      throw new Error("Prompt templates request returned no data");
    }
    return { template: data as PromptTemplateRow } as T;
  }

  if (body.action === "update") {
    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (body.name) updatePayload.name = body.name;
    if (body.prompt) updatePayload.prompt = body.prompt;
    if (body.category) updatePayload.category = body.category;

    const { data, error } = await supabase
      .schema("brand_profiles")
      .from("prompt_templates")
      .update(updatePayload)
      .eq("id", body.id)
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message || "Prompt templates request failed");
    }
    if (!data) {
      throw new Error("Prompt templates request returned no data");
    }
    return { template: data as PromptTemplateRow } as T;
  }

  if (body.action === "delete") {
    const { error } = await supabase
      .schema("brand_profiles")
      .from("prompt_templates")
      .delete()
      .eq("id", body.id);

    if (error) {
      throw new Error(error.message || "Prompt templates request failed");
    }
    return { ok: true } as T;
  }

  throw new Error("Unsupported prompt template action");
}

async function invokePromptTemplates<T>(body: Record<string, unknown>): Promise<T> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { data, error } = await supabase.functions.invoke<T>(FUNCTION_NAME, {
    body,
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
  });

  if (!error && data) {
    return data;
  }

  const action = body as PromptTemplateAction;
  return invokePromptTemplatesFallback<T>(supabase, action);
}

export async function listPromptTemplatesAction(input: PromptTemplateListInput): Promise<PromptTemplate[]> {
  const parsed = promptTemplateListSchema.parse(input);
  const data = await invokePromptTemplates<ListResponse>({
    action: "list",
    brandProfileId: parsed.brandProfileId,
    query: parsed.query,
  });

  return data.templates.map((row) => mapPromptTemplateRow(promptTemplateRowSchema.parse(row)));
}

export async function createPromptTemplateAction(input: PromptTemplateCreateInput): Promise<PromptTemplate> {
  const parsed = promptTemplateCreateSchema.parse(input);
  const data = await invokePromptTemplates<SingleResponse>({
    action: "create",
    brandProfileId: parsed.brandProfileId,
    name: parsed.name,
    prompt: parsed.prompt,
    category: parsed.category,
  });

  return mapPromptTemplateRow(promptTemplateRowSchema.parse(data.template));
}

export async function updatePromptTemplateAction(input: PromptTemplateUpdateInput): Promise<PromptTemplate> {
  const parsed = promptTemplateUpdateSchema.parse(input);
  const data = await invokePromptTemplates<SingleResponse>({
    action: "update",
    id: parsed.id,
    name: parsed.name,
    prompt: parsed.prompt,
    category: parsed.category,
  });

  return mapPromptTemplateRow(promptTemplateRowSchema.parse(data.template));
}

export async function deletePromptTemplateAction(id: string): Promise<void> {
  if (!id) {
    throw new Error("Template id is required");
  }
  await invokePromptTemplates<DeleteResponse>({ action: "delete", id });
}

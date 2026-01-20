"use server";

import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  aiStudioWorkflowRowSchema,
  mapAiStudioWorkflowRow,
  type AiStudioWorkflow,
  type AiStudioWorkflowRow,
} from "@/lib/schemas/aiStudio";

const FUNCTION_NAME = "ai_studio_workflows";

const listSchema = z.object({
  brandProfileId: z.string().uuid("brandProfileId must be a valid UUID"),
});

const createSchema = z.object({
  brandProfileId: z.string().uuid("brandProfileId must be a valid UUID"),
  name: z.string().min(1, "Workflow name is required"),
  description: z.string().optional(),
  nodes: z.array(z.unknown()).optional().default([]),
  edges: z.array(z.unknown()).optional().default([]),
  metadata: z.record(z.unknown()).optional(),
});

type WorkflowAction =
  | {
      action: "list";
      brandProfileId: string;
    }
  | {
      action: "create";
      brandProfileId: string;
      name: string;
      description?: string;
      nodes?: unknown[];
      edges?: unknown[];
      metadata?: Record<string, unknown>;
    };

type ListResponse = { workflows: AiStudioWorkflowRow[] };

type SingleResponse = { workflow: AiStudioWorkflowRow };

async function invokeWorkflows<T>(body: WorkflowAction): Promise<T> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const accessToken = session?.access_token;
  if (!accessToken) {
    throw new Error("Missing session access token");
  }

  const { data, error } = await supabase.functions.invoke<T>(FUNCTION_NAME, {
    body,
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (error) {
    throw new Error(error.message || "Workflow request failed");
  }

  if (!data) {
    throw new Error("Workflow request returned no data");
  }

  return data;
}

export async function listAiStudioWorkflowsAction(brandProfileId: string): Promise<AiStudioWorkflow[]> {
  const parsed = listSchema.parse({ brandProfileId });
  const data = await invokeWorkflows<ListResponse>({
    action: "list",
    brandProfileId: parsed.brandProfileId,
  });

  return data.workflows.map((row) => mapAiStudioWorkflowRow(aiStudioWorkflowRowSchema.parse(row)));
}

export async function createAiStudioWorkflowAction(
  input: z.infer<typeof createSchema>
): Promise<AiStudioWorkflow> {
  const parsed = createSchema.parse(input);
  const data = await invokeWorkflows<SingleResponse>({
    action: "create",
    brandProfileId: parsed.brandProfileId,
    name: parsed.name,
    description: parsed.description,
    nodes: parsed.nodes,
    edges: parsed.edges,
    metadata: parsed.metadata,
  });

  return mapAiStudioWorkflowRow(aiStudioWorkflowRowSchema.parse(data.workflow));
}

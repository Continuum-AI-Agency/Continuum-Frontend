import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const listSchema = z.object({
  action: z.literal("list"),
  brandProfileId: z.string().uuid().optional(),
  query: z.string().optional(),
});

const listBrandsSchema = z.object({
  action: z.literal("list_brands"),
  query: z.string().optional(),
  limit: z.number().int().positive().max(100).optional(),
});

const migrateGlobalToBrandSchema = z.object({
  action: z.literal("migrate_global_to_brand"),
  workflowId: z.string().uuid(),
  targetBrandProfileId: z.string().uuid(),
});

const duplicateToBrandSchema = z.object({
  action: z.literal("duplicate_to_brand"),
  workflowId: z.string().uuid(),
  targetBrandProfileId: z.string().uuid(),
});

const promoteSchema = z.object({
  action: z.literal("promote_to_global"),
  workflowId: z.string().uuid(),
});

const actionSchema = z.discriminatedUnion("action", [
  listSchema,
  listBrandsSchema,
  migrateGlobalToBrandSchema,
  duplicateToBrandSchema,
  promoteSchema,
]);

type AdminClient = ReturnType<typeof createAdminClient>;

type GlobalWorkflowRow = {
  id: string;
  name: string;
  description: string | null;
  content: unknown;
  tags: string[];
  source_canvas_workflow_id?: string | null;
  source_brand_profile_id?: string | null;
  promoted_by?: string | null;
  promoted_at?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
};

type CanvasWorkflowRow = {
  id: string;
  brand_profile_id: string;
  name: string;
  description: string | null;
  nodes: unknown;
  edges: unknown;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type WorkflowRow = {
  id: string;
  brand_profile_id: string | null;
  name: string;
  description: string | null;
  content: unknown;
  tags: string[];
  visibility: "brand" | "global";
  source_scope: string | null;
  source_workflow_id: string | null;
  source_brand_profile_id: string | null;
  promoted_from_workflow_id: string | null;
  copied_by: string | null;
  copied_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function createAdminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase admin environment not configured");
  }
  return createClient(supabaseUrl, serviceRoleKey);
}

function normalizeContent(value: unknown): { nodes: unknown[]; edges: unknown[]; metadata: Record<string, unknown> } {
  const content = value && typeof value === "object" ? value as { nodes?: unknown; edges?: unknown; metadata?: unknown } : {};
  return {
    nodes: Array.isArray(content.nodes) ? content.nodes : [],
    edges: Array.isArray(content.edges) ? content.edges : [],
    metadata: content.metadata && typeof content.metadata === "object" && !Array.isArray(content.metadata)
      ? content.metadata as Record<string, unknown>
      : {},
  };
}

function normalizeGlobalWorkflow(row: GlobalWorkflowRow): WorkflowRow {
  return {
    id: row.id,
    brand_profile_id: null,
    name: row.name,
    description: row.description,
    content: row.content,
    tags: row.tags ?? [],
    visibility: "global",
    source_scope: "global",
    source_workflow_id: row.source_canvas_workflow_id ?? null,
    source_brand_profile_id: row.source_brand_profile_id ?? null,
    promoted_from_workflow_id: row.source_canvas_workflow_id ?? null,
    copied_by: row.promoted_by ?? null,
    copied_at: row.promoted_at ?? null,
    created_by: row.created_by ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeCanvasWorkflow(row: CanvasWorkflowRow): WorkflowRow {
  const provenance = row.metadata?.admin_provenance as Record<string, unknown> | undefined;
  return {
    id: row.id,
    brand_profile_id: row.brand_profile_id,
    name: row.name,
    description: row.description,
    content: {
      nodes: Array.isArray(row.nodes) ? row.nodes : [],
      edges: Array.isArray(row.edges) ? row.edges : [],
      metadata: row.metadata ?? {},
    },
    tags: [],
    visibility: "brand",
    source_scope: typeof provenance?.source_scope === "string" ? provenance.source_scope : "brand",
    source_workflow_id: typeof provenance?.source_workflow_id === "string" ? provenance.source_workflow_id : null,
    source_brand_profile_id: typeof provenance?.source_brand_profile_id === "string" ? provenance.source_brand_profile_id : null,
    promoted_from_workflow_id: null,
    copied_by: typeof provenance?.copied_by === "string" ? provenance.copied_by : null,
    copied_at: typeof provenance?.copied_at === "string" ? provenance.copied_at : null,
    created_by: null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function requireAdmin(req: Request, adminClient: AdminClient) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  if (!token) throw new Error("Missing bearer token");

  const { data, error } = await adminClient.auth.getClaims(token);
  const actorUserId = data?.claims?.sub;
  if (error || !actorUserId) throw new Error("Invalid token");

  const isAdmin = Boolean((data.claims?.app_metadata as Record<string, unknown> | undefined)?.is_admin);
  if (!isAdmin) throw new Error("Forbidden");

  return actorUserId;
}

async function writeAudit(args: {
  adminClient: AdminClient;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  brandProfileId?: string | null;
  before: unknown;
  after: unknown;
  metadata?: Record<string, unknown>;
  requestId: string;
  status?: "success" | "failed";
}) {
  const { error } = await args.adminClient
    .schema("brand_profiles")
    .from("admin_audit_log")
    .insert({
      actor_user_id: args.actorUserId,
      action: args.action,
      target_type: args.targetType,
      target_id: args.targetId,
      brand_profile_id: args.brandProfileId ?? null,
      before: args.before,
      after: args.after,
      metadata: args.metadata ?? {},
      request_id: args.requestId,
      status: args.status ?? "success",
    });

  if (error) {
    console.error("[admin-workflow-library] audit write failed", error);
  }
}

async function fetchGlobalWorkflow(adminClient: AdminClient, workflowId: string): Promise<WorkflowRow | null> {
  const { data, error } = await adminClient
    .schema("brand_profiles")
    .from("workflow_library")
    .select("id, name, description, content, tags, source_canvas_workflow_id, source_brand_profile_id, promoted_by, promoted_at, created_by, created_at, updated_at")
    .eq("id", workflowId)
    .single();

  if (error) {
    console.error("[admin-workflow-library] global workflow lookup failed", { workflowId, error });
    return null;
  }

  return normalizeGlobalWorkflow(data as GlobalWorkflowRow);
}

async function fetchCanvasWorkflow(adminClient: AdminClient, workflowId: string): Promise<WorkflowRow | null> {
  const { data, error } = await adminClient
    .schema("brand_profiles")
    .from("canvas_workflows")
    .select("id, brand_profile_id, name, description, nodes, edges, metadata, created_at, updated_at")
    .eq("id", workflowId)
    .single();

  if (error) {
    console.error("[admin-workflow-library] canvas workflow lookup failed", { workflowId, error });
    return null;
  }

  return normalizeCanvasWorkflow(data as CanvasWorkflowRow);
}

async function resolveCopyName(adminClient: AdminClient, baseName: string, target: { scope: "brand" | "global"; brandProfileId?: string }) {
  const normalizedBase = baseName.trim();
  let existingRows: Array<{ name: string }> = [];

  if (target.scope === "brand") {
    const { data, error } = await adminClient
      .schema("brand_profiles")
      .from("canvas_workflows")
      .select("name")
      .eq("brand_profile_id", target.brandProfileId);
    if (error) throw new Error(error.message);
    existingRows = data ?? [];
  } else {
    const { data, error } = await adminClient
      .schema("brand_profiles")
      .from("workflow_library")
      .select("name");
    if (error) throw new Error(error.message);
    existingRows = data ?? [];
  }

  const existing = new Set(existingRows.map((row) => row.name.trim().toLowerCase()));
  if (!existing.has(normalizedBase.toLowerCase())) return normalizedBase;

  const firstCopy = `${normalizedBase} (copy)`;
  if (!existing.has(firstCopy.toLowerCase())) return firstCopy;

  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${normalizedBase} (copy ${index})`;
    if (!existing.has(candidate.toLowerCase())) return candidate;
  }

  return `${normalizedBase} (copy ${crypto.randomUUID().slice(0, 8)})`;
}

async function handleList(adminClient: AdminClient, input: z.infer<typeof listSchema>) {
  const trimmedQuery = input.query?.trim();

  if (!input.brandProfileId) {
    let globalQuery = adminClient
      .schema("brand_profiles")
      .from("workflow_library")
      .select("id, name, description, content, tags, source_canvas_workflow_id, source_brand_profile_id, promoted_by, promoted_at, created_by, created_at, updated_at")
      .order("updated_at", { ascending: false });

    if (trimmedQuery) globalQuery = globalQuery.ilike("name", `%${trimmedQuery}%`);

    const { data, error } = await globalQuery.limit(200);
    if (error) return json({ error: error.message }, 500);
    return json({ workflows: (data ?? []).map((row) => normalizeGlobalWorkflow(row as GlobalWorkflowRow)) });
  }

  let query = adminClient
    .schema("brand_profiles")
    .from("canvas_workflows")
    .select("id, brand_profile_id, name, description, nodes, edges, metadata, created_at, updated_at")
    .eq("brand_profile_id", input.brandProfileId)
    .order("updated_at", { ascending: false });

  if (trimmedQuery) query = query.ilike("name", `%${trimmedQuery}%`);

  const { data, error } = await query.limit(200);
  if (error) return json({ error: error.message }, 500);
  return json({ workflows: (data ?? []).map((row) => normalizeCanvasWorkflow(row as CanvasWorkflowRow)) });
}

async function handleListBrands(adminClient: AdminClient, input: z.infer<typeof listBrandsSchema>) {
  let query = adminClient
    .schema("brand_profiles")
    .from("brand_profiles")
    .select("id, brand_name, tier, active")
    .order("brand_name", { ascending: true })
    .limit(input.limit ?? 50);

  const trimmedQuery = input.query?.trim();
  if (trimmedQuery) query = query.ilike("brand_name", `%${trimmedQuery}%`);

  const { data, error } = await query;
  if (error) return json({ error: error.message }, 500);
  return json({ brands: data ?? [] });
}

async function insertCanvasWorkflow(args: {
  adminClient: AdminClient;
  targetBrandProfileId: string;
  source: WorkflowRow;
  name: string;
  actorUserId: string;
  action: "migrate_global_to_brand" | "duplicate_to_brand";
}) {
  const content = normalizeContent(args.source.content);
  const metadata = {
    ...content.metadata,
    admin_provenance: {
      source_scope: args.source.visibility,
      source_workflow_id: args.source.id,
      source_brand_profile_id: args.source.brand_profile_id,
      copied_by: args.actorUserId,
      copied_at: new Date().toISOString(),
      action: args.action,
    },
  };

  return await args.adminClient
    .schema("brand_profiles")
    .from("canvas_workflows")
    .insert({
      brand_profile_id: args.targetBrandProfileId,
      name: args.name,
      description: args.source.description,
      nodes: content.nodes,
      edges: content.edges,
      metadata,
      updated_at: new Date().toISOString(),
    })
    .select("id, brand_profile_id, name, description, nodes, edges, metadata, created_at, updated_at")
    .single();
}

async function handleCopyToBrand(
  adminClient: AdminClient,
  actorUserId: string,
  requestId: string,
  input: z.infer<typeof migrateGlobalToBrandSchema> | z.infer<typeof duplicateToBrandSchema>,
) {
  const source = input.action === "migrate_global_to_brand"
    ? await fetchGlobalWorkflow(adminClient, input.workflowId)
    : await fetchCanvasWorkflow(adminClient, input.workflowId);
  if (!source) return json({ error: "Workflow not found" }, 404);

  if (input.action === "migrate_global_to_brand" && source.visibility !== "global") {
    return json({ error: "Only global library workflows can be migrated to a brand canvas workflow." }, 400);
  }
  if (input.action === "duplicate_to_brand" && source.visibility !== "brand") {
    return json({ error: "Only brand canvas workflows can be duplicated between brands." }, 400);
  }

  const name = await resolveCopyName(adminClient, source.name, {
    scope: "brand",
    brandProfileId: input.targetBrandProfileId,
  });

  const { data, error } = await insertCanvasWorkflow({
    adminClient,
    targetBrandProfileId: input.targetBrandProfileId,
    source,
    name,
    actorUserId,
    action: input.action,
  });

  if (error) {
    await writeAudit({
      adminClient,
      actorUserId,
      action: `admin.workflow.${input.action}`,
      targetType: "canvas_workflow",
      targetId: source.id,
      brandProfileId: input.targetBrandProfileId,
      before: source,
      after: null,
      metadata: { error: error.message },
      requestId,
      status: "failed",
    });
    return json({ error: error.message }, 500);
  }

  const normalized = normalizeCanvasWorkflow(data as CanvasWorkflowRow);
  await writeAudit({
    adminClient,
    actorUserId,
    action: `admin.workflow.${input.action}`,
    targetType: "canvas_workflow",
    targetId: normalized.id,
    brandProfileId: input.targetBrandProfileId,
    before: source,
    after: normalized,
    metadata: { renamePolicy: "rename_copy", originalName: source.name, finalName: name },
    requestId,
  });

  return json({ workflow: normalized });
}

async function handlePromote(
  adminClient: AdminClient,
  actorUserId: string,
  requestId: string,
  input: z.infer<typeof promoteSchema>,
) {
  const source = await fetchCanvasWorkflow(adminClient, input.workflowId);
  if (!source) return json({ error: "Workflow not found" }, 404);

  const name = await resolveCopyName(adminClient, source.name, { scope: "global" });
  const { data, error } = await adminClient
    .schema("brand_profiles")
    .from("workflow_library")
    .insert({
      name,
      description: source.description,
      content: source.content,
      tags: source.tags,
      source_canvas_workflow_id: source.id,
      source_brand_profile_id: source.brand_profile_id,
      promoted_by: actorUserId,
      promoted_at: new Date().toISOString(),
      created_by: actorUserId,
      updated_at: new Date().toISOString(),
    })
    .select("id, name, description, content, tags, source_canvas_workflow_id, source_brand_profile_id, promoted_by, promoted_at, created_by, created_at, updated_at")
    .single();

  if (error) {
    await writeAudit({
      adminClient,
      actorUserId,
      action: "admin.workflow.promote_to_global",
      targetType: "workflow_library",
      targetId: source.id,
      brandProfileId: source.brand_profile_id,
      before: source,
      after: null,
      metadata: { error: error.message },
      requestId,
      status: "failed",
    });
    return json({ error: error.message }, 500);
  }

  const normalized = normalizeGlobalWorkflow(data as GlobalWorkflowRow);
  await writeAudit({
    adminClient,
    actorUserId,
    action: "admin.workflow.promote_to_global",
    targetType: "workflow_library",
    targetId: normalized.id,
    brandProfileId: source.brand_profile_id,
    before: source,
    after: normalized,
    metadata: { renamePolicy: "rename_copy", originalName: source.name, finalName: name },
    requestId,
  });

  return json({ workflow: normalized });
}

serve(async (req) => {
  const requestId = crypto.randomUUID();

  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const adminClient = createAdminClient();
    const actorUserId = await requireAdmin(req, adminClient);
    const parsed = actionSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return json({ error: "Invalid request", details: parsed.error.message }, 400);
    }

    if (parsed.data.action === "list") return await handleList(adminClient, parsed.data);
    if (parsed.data.action === "list_brands") return await handleListBrands(adminClient, parsed.data);
    if (parsed.data.action === "promote_to_global") return await handlePromote(adminClient, actorUserId, requestId, parsed.data);
    if (parsed.data.action === "migrate_global_to_brand" || parsed.data.action === "duplicate_to_brand") {
      return await handleCopyToBrand(adminClient, actorUserId, requestId, parsed.data);
    }

    return json({ error: "Unsupported action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "Forbidden" ? 403 : message.includes("token") || message.includes("bearer") ? 401 : 500;
    console.error("[admin-workflow-library] unhandled", { requestId, error });
    return json({ error: message }, status);
  }
});

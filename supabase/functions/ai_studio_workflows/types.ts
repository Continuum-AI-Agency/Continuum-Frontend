export type WorkflowRow = {
  id: string;
  brand_profile_id: string;
  name: string;
  description: string | null;
  nodes: unknown[] | null;
  edges: unknown[] | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string | null;
};

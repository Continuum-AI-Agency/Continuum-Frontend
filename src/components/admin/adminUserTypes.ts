export type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
  createdAt: string | null;
};

export type PermissionRow = {
  user_id: string;
  brand_profile_id: string;
  role: string | null;
  brand_tier: number;
  brand_name: string | null;
};

export type AdminBrandOption = {
  id: string;
  brand_name: string;
  tier: number;
  active: boolean;
  ownerEmail: string | null;
  // Populated by list_brands for the Brands tab. Optional because the synthetic
  // options (the global-library row, the audit "All brands" row) have no counts.
  memberCount?: number;
  workflowCount?: number;
  created_at?: string | null;
};

export type AdminWorkflowTransferResult = {
  workflowId: string;
  status: 'moved' | 'failed';
  newId?: string;
  error?: string;
  // A transfer carries the canvas's media with it. Surfacing the counts is what
  // makes that visible -- the failure this replaces was silent by nature.
  movedAssets?: number;
  movedVersions?: number;
  // Coordinates with no media.assets row. Because canvas signing is
  // all-or-nothing, these block the transfer rather than degrade it.
  strandedPaths?: string[];
};

export type AdminWorkflowLibraryRow = {
  id: string;
  brand_profile_id: string | null;
  name: string;
  description: string | null;
  // List responses carry the node COUNT, not the graph. `content` is present
  // only on single-workflow responses (a transfer's echo of the row it wrote).
  node_count?: number;
  content?: unknown;
  tags: string[];
  visibility: 'brand' | 'global';
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

export type AdminAuditLogEntry = {
  id: string;
  actor_user_id: string | null;
  // Resolved server-side from admin_user_directory so the actor reads as a
  // person (name/email), not a raw UUID; null for system/automated or
  // unresolvable actors.
  actor_email: string | null;
  actor_name: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  brand_profile_id: string | null;
  before: unknown;
  after: unknown;
  metadata: Record<string, unknown>;
  request_id: string | null;
  status: 'success' | 'failed';
  created_at: string;
};

// Pagination envelope returned by the admin-audit-log edge function. Narrower
// than AdminPagination (the user-list SSR shape) — the audit reader only sends
// the fields it computes, so we type exactly those rather than reuse a wider
// shape the endpoint never populates.
export type AdminAuditPagination = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
};

export type AdminPagination = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  nextPage: number | null;
  lastPage: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
};

export type AdminListResponse = {
  users: AdminUser[];
  permissions: PermissionRow[];
  pagination: AdminPagination;
};

// Projects — a sub-brand context scope.
//
// A brand has many projects; a project carries a brief (the creative direction an agent
// reads), a colour for its chip, and a subset of ad accounts/campaigns. Everything else is
// tagged into a project many-to-many through `brand_profiles.project_memberships`.
//
// This module is the seam: the migration, the /api/projects routes, the Frontend primitives
// and every later consumer (Library filter, Jaina scope, MCP) parse through these schemas.
// Import from the ROOT entry — `@continuum/contracts` — never a subpath: the Backend uses
// classic `node` resolution and does not honour package.json `exports`.

import { z } from 'zod';

/**
 * What can be tagged into a project. Mirrors the check constraint on
 * `brand_profiles.project_memberships.entity_type` exactly — adding a member here without
 * the matching migration produces a row the database rejects at insert time.
 */
export const projectEntityTypeSchema = z.enum([
  'asset',
  'collection',
  'canvas_workflow',
  'automation',
  'jaina_session',
  'organic_session',
  'optimizer_portfolio',
  'brand_document',
]);
export type ProjectEntityType = z.infer<typeof projectEntityTypeSchema>;

export const projectStatusSchema = z.enum(['active', 'archived']);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

/** Hex, because the chip sets `style={{ backgroundColor }}` — a token name would not render. */
const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'expected a #rrggbb hex colour');

/**
 * The palette the project picker offers. Kept here rather than in the settings UI so the
 * chip, the selector and the settings form cannot drift to three different greens.
 */
export const PROJECT_COLOR_PRESETS = [
  '#0daea2',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#f59e0b',
  '#ef4444',
  '#64748b',
] as const;

export const DEFAULT_PROJECT_COLOR: string = PROJECT_COLOR_PRESETS[0];

export const projectSchema = z.object({
  id: z.string().uuid(),
  brandId: z.string().uuid(),
  name: z.string().min(1).max(120),
  brief: z.string().nullable(),
  color: z.string().nullable(),
  status: projectStatusSchema,
  /** Provider ids, text — Meta account ids are text and carry an `act_` prefix. */
  adAccountIds: z.array(z.string().min(1)),
  campaignIds: z.array(z.string().min(1)),
  createdBy: z.string().uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Project = z.infer<typeof projectSchema>;

export const projectMembershipSchema = z.object({
  projectId: z.string().uuid(),
  brandId: z.string().uuid(),
  entityType: projectEntityTypeSchema,
  /**
   * Text, not uuid: an asset id is a uuid but a chat session id is not (`bench:...`,
   * provider ids). Consumers that know the entity is an asset narrow it themselves.
   */
  entityId: z.string().min(1),
  addedBy: z.string().uuid().nullable(),
  addedAt: z.string(),
});
export type ProjectMembership = z.infer<typeof projectMembershipSchema>;

// ---------------------------------------------------------------------------
// Row shapes + mappers. Both the Frontend route and (later) the Backend read the same
// snake_case rows; mapping them in one place is what stops two hand-rolled converters.
// ---------------------------------------------------------------------------

export const projectRowSchema = z.object({
  id: z.string(),
  brand_id: z.string(),
  name: z.string(),
  brief: z.string().nullable(),
  color: z.string().nullable(),
  status: z.string(),
  ad_account_ids: z.array(z.string()).nullable(),
  campaign_ids: z.array(z.string()).nullable(),
  created_by: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ProjectRow = z.infer<typeof projectRowSchema>;

export function toProject(row: unknown): Project {
  const parsed = projectRowSchema.parse(row);
  return projectSchema.parse({
    id: parsed.id,
    brandId: parsed.brand_id,
    name: parsed.name,
    brief: parsed.brief,
    color: parsed.color,
    status: parsed.status,
    adAccountIds: parsed.ad_account_ids ?? [],
    campaignIds: parsed.campaign_ids ?? [],
    createdBy: parsed.created_by,
    createdAt: parsed.created_at,
    updatedAt: parsed.updated_at,
  });
}

export const projectMembershipRowSchema = z.object({
  project_id: z.string(),
  brand_id: z.string(),
  entity_type: z.string(),
  entity_id: z.string(),
  added_by: z.string().nullable(),
  added_at: z.string(),
});
export type ProjectMembershipRow = z.infer<typeof projectMembershipRowSchema>;

export function toProjectMembership(row: unknown): ProjectMembership {
  const parsed = projectMembershipRowSchema.parse(row);
  return projectMembershipSchema.parse({
    projectId: parsed.project_id,
    brandId: parsed.brand_id,
    entityType: parsed.entity_type,
    entityId: parsed.entity_id,
    addedBy: parsed.added_by,
    addedAt: parsed.added_at,
  });
}

// ---------------------------------------------------------------------------
// Request / response envelopes for /api/projects.
// ---------------------------------------------------------------------------

/** `all` exists so the settings surface can show archived projects without a second route. */
export const projectListFilterSchema = z.enum(['active', 'archived', 'all']);
export type ProjectListFilter = z.infer<typeof projectListFilterSchema>;

export const projectListQuerySchema = z
  .object({
    brandId: z.string().uuid(),
    status: projectListFilterSchema.default('active'),
  })
  .strict();
export type ProjectListQuery = z.infer<typeof projectListQuerySchema>;

export const projectListResponseSchema = z.object({ projects: z.array(projectSchema) });
export type ProjectListResponse = z.infer<typeof projectListResponseSchema>;

export const projectResponseSchema = z.object({ project: projectSchema });
export type ProjectResponse = z.infer<typeof projectResponseSchema>;

export const projectCreateRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    brief: z.string().max(8000).nullable().optional(),
    color: hexColorSchema.nullable().optional(),
    adAccountIds: z.array(z.string().min(1)).max(200).default([]),
    campaignIds: z.array(z.string().min(1)).max(500).default([]),
  })
  .strict();
export type ProjectCreateRequest = z.infer<typeof projectCreateRequestSchema>;

/**
 * PATCH semantics: an omitted field is left alone, an explicit `null` clears it. Archiving
 * is `status: 'archived'` here as well as the DELETE route — the settings surface toggles it
 * in place, and forcing that through a different verb would need two mutation hooks.
 */
export const projectUpdateRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    projectId: z.string().uuid(),
    name: z.string().trim().min(1).max(120).optional(),
    brief: z.string().max(8000).nullable().optional(),
    color: hexColorSchema.nullable().optional(),
    status: projectStatusSchema.optional(),
    adAccountIds: z.array(z.string().min(1)).max(200).optional(),
    campaignIds: z.array(z.string().min(1)).max(500).optional(),
  })
  .strict();
export type ProjectUpdateRequest = z.infer<typeof projectUpdateRequestSchema>;

/** Archive is a soft delete: memberships and history survive so the scope stays auditable. */
export const projectArchiveRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    projectId: z.string().uuid(),
  })
  .strict();
export type ProjectArchiveRequest = z.infer<typeof projectArchiveRequestSchema>;

/**
 * Tagging is plural because every real caller is plural — a multi-select in the Library, a
 * turn that tags its whole evidence set. Singular would have forced N round-trips for the
 * identical insert.
 */
export const projectTagRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    projectId: z.string().uuid(),
    entityType: projectEntityTypeSchema,
    entityIds: z.array(z.string().min(1)).min(1).max(500),
  })
  .strict();
export type ProjectTagRequest = z.infer<typeof projectTagRequestSchema>;

export const projectUntagRequestSchema = projectTagRequestSchema;
export type ProjectUntagRequest = z.infer<typeof projectUntagRequestSchema>;

export const projectTagResponseSchema = z.object({
  memberships: z.array(projectMembershipSchema),
});
export type ProjectTagResponse = z.infer<typeof projectTagResponseSchema>;

export const projectUntagResponseSchema = z.object({ removed: z.number().int().min(0) });
export type ProjectUntagResponse = z.infer<typeof projectUntagResponseSchema>;

/** Membership listing — "what is in this project" and "which projects is this thing in". */
export const projectMembershipQuerySchema = z
  .object({
    brandId: z.string().uuid(),
    projectId: z.string().uuid().optional(),
    entityType: projectEntityTypeSchema.optional(),
    entityId: z.string().min(1).optional(),
  })
  .strict()
  .refine((value) => value.projectId !== undefined || value.entityId !== undefined, {
    message: 'projectId or entityId is required',
  });
export type ProjectMembershipQuery = z.infer<typeof projectMembershipQuerySchema>;

export const projectMembershipListResponseSchema = z.object({
  memberships: z.array(projectMembershipSchema),
});
export type ProjectMembershipListResponse = z.infer<typeof projectMembershipListResponseSchema>;

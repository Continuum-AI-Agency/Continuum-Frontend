// Projects client. Reads go to the same-origin /api/projects routes, which query under the
// caller's RLS; writes go to the `projects` edge function with the user's JWT, because every
// write is service-role and that key stays off Vercel.
//
// Reads use plain `fetch` with a relative path, NOT `@/lib/api/http` — that wrapper prefixes
// `getApiBaseUrl()` (the Fastify Backend on :4000), which is wrong for a Next route handler.
//
// Every response is parsed with the contracts schema so a drifted route fails here, loudly,
// instead of rendering `undefined` three components later.

import {
  PROJECTS_EDGE_FUNCTION,
  type Project,
  type ProjectCreateRequest,
  type ProjectEntityType,
  type ProjectListFilter,
  type ProjectMembership,
  type ProjectsEdgeRequest,
  type ProjectTagRequest,
  type ProjectUntagRequest,
  type ProjectUpdateRequest,
  projectListResponseSchema,
  projectMembershipListResponseSchema,
  projectResponseSchema,
  projectTagResponseSchema,
  projectUntagResponseSchema,
} from '@continuum/contracts';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { readEdgeErrorMessage } from '@/lib/supabase/edgeErrorMessage';

const ROUTE = '/api/projects';
const MEMBERSHIPS_ROUTE = '/api/projects/memberships';

async function readJson(response: Response, what: string): Promise<unknown> {
  if (!response.ok) {
    // The route answers `{ error }` on every failure path; surfacing it beats a bare status.
    const detail = await response
      .json()
      .then((body: unknown) => (body as { error?: string }).error)
      .catch(() => undefined);
    throw new Error(detail ?? `${what} failed (${response.status})`);
  }
  return response.json();
}

async function invokeProjects(request: ProjectsEdgeRequest, what: string): Promise<unknown> {
  const { data, error } = await createSupabaseBrowserClient().functions.invoke(
    PROJECTS_EDGE_FUNCTION,
    { body: request },
  );
  // The function answers `{ error }` on every failure path, e.g. a 409 duplicate name.
  if (error) throw new Error(await readEdgeErrorMessage(error, `${what} failed`));
  return data;
}

export async function fetchProjects(
  brandId: string,
  status: ProjectListFilter = 'active',
  signal?: AbortSignal,
): Promise<Project[]> {
  const params = new URLSearchParams({ brandId, status });
  const response = await fetch(`${ROUTE}?${params.toString()}`, { signal });
  const payload = await readJson(response, 'Loading projects');
  return projectListResponseSchema.parse(payload).projects;
}

export async function createProject(input: ProjectCreateRequest): Promise<Project> {
  const payload = await invokeProjects({ action: 'create', ...input }, 'Creating the project');
  return projectResponseSchema.parse(payload).project;
}

export async function updateProject(input: ProjectUpdateRequest): Promise<Project> {
  const payload = await invokeProjects({ action: 'update', ...input }, 'Updating the project');
  return projectResponseSchema.parse(payload).project;
}

/** Soft delete: the project is archived, its memberships survive. */
export async function archiveProject(brandId: string, projectId: string): Promise<Project> {
  const payload = await invokeProjects(
    { action: 'archive', brandId, projectId },
    'Archiving the project',
  );
  return projectResponseSchema.parse(payload).project;
}

export async function tagIntoProject(input: ProjectTagRequest): Promise<ProjectMembership[]> {
  const payload = await invokeProjects({ action: 'tag', ...input }, 'Tagging into the project');
  return projectTagResponseSchema.parse(payload).memberships;
}

export async function untagFromProject(input: ProjectUntagRequest): Promise<number> {
  const payload = await invokeProjects({ action: 'untag', ...input }, 'Removing from the project');
  return projectUntagResponseSchema.parse(payload).removed;
}

export async function fetchProjectMemberships(
  query: { brandId: string; projectId?: string; entityType?: ProjectEntityType; entityId?: string },
  signal?: AbortSignal,
): Promise<ProjectMembership[]> {
  const params = new URLSearchParams({ brandId: query.brandId });
  if (query.projectId) params.set('projectId', query.projectId);
  if (query.entityType) params.set('entityType', query.entityType);
  if (query.entityId) params.set('entityId', query.entityId);
  const response = await fetch(`${MEMBERSHIPS_ROUTE}?${params.toString()}`, { signal });
  const payload = await readJson(response, 'Loading project memberships');
  return projectMembershipListResponseSchema.parse(payload).memberships;
}

// Same-origin client for /api/projects.
//
// Plain `fetch` with a relative path, NOT `@/lib/api/http` — that wrapper prefixes
// `getApiBaseUrl()` (the Fastify Backend on :4000), which is right for /api/goals and wrong
// for a Next route handler. The route reads the Supabase session from cookies, so no bearer
// header is needed; this mirrors `src/lib/library/collections.ts`.
//
// Every response is parsed with the contracts schema so a drifted route fails here, loudly,
// instead of rendering `undefined` three components later.

import {
  type Project,
  type ProjectCreateRequest,
  type ProjectEntityType,
  type ProjectListFilter,
  type ProjectMembership,
  projectListResponseSchema,
  projectMembershipListResponseSchema,
  type ProjectTagRequest,
  projectTagResponseSchema,
  type ProjectUntagRequest,
  projectUntagResponseSchema,
  type ProjectUpdateRequest,
  projectResponseSchema,
} from '@continuum/contracts';

const ROUTE = '/api/projects';
const MEMBERSHIPS_ROUTE = '/api/projects/memberships';

async function readJson(response: Response, what: string): Promise<unknown> {
  if (!response.ok) {
    // The route answers `{ error }` on every failure path; surfacing it beats a bare status
    // when the cause is a 409 duplicate name the user can actually fix.
    const detail = await response
      .json()
      .then((body: unknown) => (body as { error?: string }).error)
      .catch(() => undefined);
    throw new Error(detail ?? `${what} failed (${response.status})`);
  }
  return response.json();
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
  const response = await fetch(ROUTE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await readJson(response, 'Creating the project');
  return projectResponseSchema.parse(payload).project;
}

export async function updateProject(input: ProjectUpdateRequest): Promise<Project> {
  const response = await fetch(ROUTE, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await readJson(response, 'Updating the project');
  return projectResponseSchema.parse(payload).project;
}

/** Soft delete: the project is archived, its memberships survive. */
export async function archiveProject(brandId: string, projectId: string): Promise<Project> {
  const params = new URLSearchParams({ brandId, projectId });
  const response = await fetch(`${ROUTE}?${params.toString()}`, { method: 'DELETE' });
  const payload = await readJson(response, 'Archiving the project');
  return projectResponseSchema.parse(payload).project;
}

export async function tagIntoProject(input: ProjectTagRequest): Promise<ProjectMembership[]> {
  const response = await fetch(MEMBERSHIPS_ROUTE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await readJson(response, 'Tagging into the project');
  return projectTagResponseSchema.parse(payload).memberships;
}

export async function untagFromProject(input: ProjectUntagRequest): Promise<number> {
  const response = await fetch(MEMBERSHIPS_ROUTE, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await readJson(response, 'Removing from the project');
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

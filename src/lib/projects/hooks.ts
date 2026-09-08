'use client';

// React Query hooks for projects. Query keys are brand-scoped so a brand switch reads a
// different cache entry rather than showing the previous brand's projects for a frame.

import type {
  Project,
  ProjectCreateRequest,
  ProjectEntityType,
  ProjectListFilter,
  ProjectMembership,
  ProjectTagRequest,
  ProjectUpdateRequest,
} from '@continuum/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  archiveProject,
  createProject,
  fetchProjectMemberships,
  fetchProjects,
  tagIntoProject,
  untagFromProject,
  updateProject,
} from './client';

export const projectsQueryKey = (brandId: string | undefined, status: ProjectListFilter) =>
  ['projects', brandId, status] as const;

export const projectMembershipsQueryKey = (
  brandId: string | undefined,
  scope: { projectId?: string; entityType?: ProjectEntityType; entityId?: string },
) => ['project-memberships', brandId, scope.projectId, scope.entityType, scope.entityId] as const;

export function useProjects(brandId: string | undefined, status: ProjectListFilter = 'active') {
  const query = useQuery({
    queryKey: projectsQueryKey(brandId, status),
    queryFn: ({ signal }) => fetchProjects(brandId as string, status, signal),
    enabled: Boolean(brandId),
    staleTime: 60_000,
  });

  return {
    projects: (query.data ?? []) as Project[],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}

export function useProjectMemberships(
  brandId: string | undefined,
  scope: { projectId?: string; entityType?: ProjectEntityType; entityId?: string },
) {
  const query = useQuery({
    queryKey: projectMembershipsQueryKey(brandId, scope),
    queryFn: ({ signal }) => fetchProjectMemberships({ brandId: brandId as string, ...scope }, signal),
    enabled: Boolean(brandId) && Boolean(scope.projectId ?? scope.entityId),
    staleTime: 30_000,
  });

  return {
    memberships: (query.data ?? []) as ProjectMembership[],
    isLoading: query.isLoading,
    error: query.error as Error | null,
  };
}

/**
 * Create / update / archive / tag / untag.
 *
 * Every `onSuccess` returns the invalidation promise rather than firing it with `void`, so
 * react-query keeps the mutation pending until the list is refetched — the house style for a
 * mutation whose caller closes a dialog on settle.
 */
export function useProjectMutations(brandId: string | undefined) {
  const queryClient = useQueryClient();
  const invalidateProjects = () => queryClient.invalidateQueries({ queryKey: ['projects', brandId] });
  const invalidateMemberships = () =>
    queryClient.invalidateQueries({ queryKey: ['project-memberships', brandId] });

  return {
    create: useMutation({
      mutationFn: (input: Omit<ProjectCreateRequest, 'brandId'>) =>
        createProject({ ...input, brandId: brandId as string }),
      onSuccess: invalidateProjects,
    }),
    update: useMutation({
      mutationFn: (input: Omit<ProjectUpdateRequest, 'brandId'>) =>
        updateProject({ ...input, brandId: brandId as string }),
      onSuccess: invalidateProjects,
    }),
    archive: useMutation({
      mutationFn: (projectId: string) => archiveProject(brandId as string, projectId),
      onSuccess: invalidateProjects,
    }),
    tag: useMutation({
      mutationFn: (input: Omit<ProjectTagRequest, 'brandId'>) =>
        tagIntoProject({ ...input, brandId: brandId as string }),
      onSuccess: invalidateMemberships,
    }),
    untag: useMutation({
      mutationFn: (input: Omit<ProjectTagRequest, 'brandId'>) =>
        untagFromProject({ ...input, brandId: brandId as string }),
      onSuccess: invalidateMemberships,
    }),
  };
}

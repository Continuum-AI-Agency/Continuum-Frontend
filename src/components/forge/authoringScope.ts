import type { TemplateAuthoringScope, TemplateAuthoringScopeQuery } from '@continuum/contracts';

export const authoringScopeIdentity = (scope: TemplateAuthoringScope) =>
  `${scope.brandId}:${scope.assetId}:${scope.baseVersionId}:${scope.workingCopyId ?? 'legacy'}`;

export const sameAuthoringScope = (left: TemplateAuthoringScope, right: TemplateAuthoringScope) =>
  authoringScopeIdentity(left) === authoringScopeIdentity(right);

export const authoringScopeQuery = (scope: TemplateAuthoringScopeQuery) => ({
  brandId: scope.brandId, baseVersionId: scope.baseVersionId,
  ...(scope.workingCopyId ? { workingCopyId: scope.workingCopyId } : {}),
});

export function withAuthoringWorkingCopy<T extends { workingCopyId?: string }>(scope: TemplateAuthoringScopeQuery, request: T): T {
  if (request.workingCopyId && request.workingCopyId !== scope.workingCopyId)
    throw new Error('This request belongs to another private working copy.');
  return { ...request, ...(scope.workingCopyId ? { workingCopyId: scope.workingCopyId } : {}) };
}

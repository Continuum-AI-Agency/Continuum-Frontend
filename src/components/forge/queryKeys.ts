export const FORGE_STALE_MS = {
  active: 30_000,
  lists: 5 * 60_000,
  contract: 30 * 60_000,
} as const;

export const forgeQueryKeys = {
  all: ['forge'] as const,
  brand: (brandId: string) => ['forge', brandId] as const,
  templateSources: (brandId: string) => ['forge', brandId, 'template-sources'] as const,
  templateVariables: (brandId: string, assetId: string, versionId: string) =>
    ['forge', brandId, 'template-variables', assetId, versionId] as const,
  templateFonts: (brandId: string, assetId: string, versionId: string) =>
    ['forge', brandId, 'template-fonts', assetId, versionId] as const,
  workspaces: (brandId: string) => ['forge', brandId, 'workspaces'] as const,
  workspaceTemplates: (brandId: string) => ['forge', brandId, 'workspace-templates'] as const,
  environments: (brandId: string) => ['forge', brandId, 'environments'] as const,
  templates: (brandId: string) => ['forge', brandId, 'templates'] as const,
  templateList: (brandId: string, bindingId: string | null) =>
    ['forge', brandId, 'templates', bindingId ?? 'default'] as const,
  contracts: (brandId: string) => ['forge', brandId, 'contracts'] as const,
  contract: (brandId: string, bindingId: string | null, templateKey: string) =>
    ['forge', brandId, 'contracts', bindingId ?? 'default', templateKey] as const,
  inputSets: (brandId: string, templateKey: string) =>
    ['forge', brandId, 'input-sets', templateKey] as const,
  renderSets: (brandId: string) => ['forge', brandId, 'render-sets'] as const,
  renderSetList: (brandId: string, templateKey?: string) =>
    ['forge', brandId, 'render-sets', templateKey ?? 'all'] as const,
  runs: (brandId: string) => ['forge', brandId, 'runs'] as const,
  run: (brandId: string, assetId: string) => ['forge', brandId, 'runs', assetId] as const,
  renderJobs: (brandId: string) => ['forge', brandId, 'render-jobs'] as const,
  renderJobLists: (brandId: string) => ['forge', brandId, 'render-jobs', 'list'] as const,
  renderJobList: (brandId: string, limit: number, renderSetId?: string) =>
    ['forge', brandId, 'render-jobs', 'list', { limit, renderSetId: renderSetId ?? null }] as const,
  renderJobPages: (brandId: string) => ['forge', brandId, 'render-jobs', 'page'] as const,
  renderJobPage: (
    brandId: string,
    limit: number,
    renderSetId: string | undefined,
    cursor: string,
  ) =>
    [
      'forge',
      brandId,
      'render-jobs',
      'page',
      { limit, renderSetId: renderSetId ?? null, cursor },
    ] as const,
  renderJob: (brandId: string, jobId: string) =>
    ['forge', brandId, 'render-jobs', 'job', jobId] as const,
  approvals: (brandId: string) => ['forge', brandId, 'approvals'] as const,
  mediaAsset: (brandId: string, assetId: string) =>
    ['forge', brandId, 'media-assets', assetId] as const,
} as const;

import type { TemplateSourceSummary } from '@continuum/contracts';
import { experimental_streamedQuery, type QueryClient, queryOptions } from '@tanstack/react-query';
import {
  discoverWorkspaceTemplates,
  fetchTemplateRevisionVariants,
  fetchTemplateVariantDefaults,
  fetchTemplateVariants,
  streamTemplateSources,
} from '@/lib/library/templateSources';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';

export const FORGE_STALE_MS = {
  active: 30_000,
  lists: 5 * 60_000,
  contract: 30 * 60_000,
} as const;

// A source version and a revision never change, so their layer views cannot go stale.
const VERSION_VIEWS = new Set(['layer-inventory', 'layer-scene', 'layer-preview']);

/** Refetch the brand's Forge reads after a change — all but the per-version layer views. */
export function invalidateForgeBrand(queryClient: QueryClient, brandId: string) {
  return queryClient.invalidateQueries({
    queryKey: forgeQueryKeys.brand(brandId),
    predicate: (query) => !VERSION_VIEWS.has(String(query.queryKey[2])),
  });
}

export const forgeQueryKeys = {
  all: ['forge'] as const,
  brand: (brandId: string) => ['forge', brandId] as const,
  templateVariants: (brandId: string) => ['forge', brandId, 'template-variants'] as const,
  revisionVariants: (brandId: string, assetId: string) =>
    ['forge', brandId, 'revision-variants', assetId] as const,
  /** The variant each template family opens on, for the whole brand. */
  variantDefaults: (brandId: string) => ['forge', brandId, 'variant-defaults'] as const,
  templateSources: (brandId: string) => ['forge', brandId, 'template-sources'] as const,
  templateVariables: (brandId: string, assetId: string, versionId: string) =>
    ['forge', brandId, 'template-variables', assetId, versionId] as const,
  colourFields: (brandId: string, assetId: string, templateKey: string) =>
    ['forge', brandId, 'colour-fields', assetId, templateKey] as const,
  templateFonts: (brandId: string, assetId: string, versionId: string) =>
    ['forge', brandId, 'template-fonts', assetId, versionId] as const,
  layerInventory: (brandId: string, assetId: string, versionId: string) =>
    ['forge', brandId, 'layer-inventory', assetId, versionId] as const,
  layerScene: (brandId: string, assetId: string, versionId: string, compId: number | null) =>
    ['forge', brandId, 'layer-scene', assetId, versionId, compId] as const,
  /** A composed preview of pending edits on one revision; `edits` is part of the key. */
  layerPreview: (brandId: string, revisionId: string, compId: number | null, edits: unknown) =>
    ['forge', brandId, 'layer-preview', revisionId, compId, edits] as const,
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
  /** Slack rooms and Meta ad accounts a render can deliver to. */
  deliveryDestinations: (brandId: string) => ['forge', brandId, 'delivery-destinations'] as const,
  renderSetList: (brandId: string, templateKey?: string) =>
    ['forge', brandId, 'render-sets', templateKey ?? 'all'] as const,
  runs: (brandId: string) => ['forge', brandId, 'runs'] as const,
  run: (brandId: string, assetId: string) => ['forge', brandId, 'runs', assetId] as const,
  lineage: (brandId: string, assetId: string) => ['forge', brandId, 'lineage', assetId] as const,
  mappingReview: (brandId: string, assetId: string, versionId: string, state: string | null) =>
    ['forge', brandId, 'mapping-review', assetId, versionId, state] as const,
  renderJobs: (brandId: string) => ['forge', brandId, 'render-jobs'] as const,
  renderJobLists: (brandId: string) => ['forge', brandId, 'render-jobs', 'list'] as const,
  renderJobList: (
    brandId: string,
    limit: number,
    renderSetId?: string,
    templateKey?: string,
    batchId?: string,
  ) =>
    [
      'forge',
      brandId,
      'render-jobs',
      'list',
      {
        limit,
        renderSetId: renderSetId ?? null,
        templateKey: templateKey ?? null,
        batchId: batchId ?? null,
      },
    ] as const,
  renderJobPages: (brandId: string) => ['forge', brandId, 'render-jobs', 'page'] as const,
  renderJobPage: (
    brandId: string,
    limit: number,
    renderSetId: string | undefined,
    cursor: string,
    templateKey?: string,
    batchId?: string,
  ) =>
    [
      'forge',
      brandId,
      'render-jobs',
      'page',
      {
        limit,
        renderSetId: renderSetId ?? null,
        templateKey: templateKey ?? null,
        batchId: batchId ?? null,
        cursor,
      },
    ] as const,
  /** The newest finished job of one grid row — what the Render tab preview shows as rendered. */
  renderJobRowLatest: (brandId: string, renderSetId: string, rowId: string) =>
    ['forge', brandId, 'render-jobs', 'row-latest', { renderSetId, rowId }] as const,
  renderJob: (brandId: string, jobId: string) =>
    ['forge', brandId, 'render-jobs', 'job', jobId] as const,
  approvals: (brandId: string) => ['forge', brandId, 'approvals'] as const,
  /** The Library side of these outputs; the caller sorts the ids so any order is one read. */
  libraryState: (brandId: string, assetIds: readonly string[]) =>
    ['forge', brandId, 'library-state', assetIds.join(',')] as const,
  mediaAsset: (brandId: string, assetId: string) =>
    ['forge', brandId, 'media-assets', assetId] as const,
  /** A Blender template as the editor reads it: fields, outputs, the version a render pins. */
  sceneTemplate: (brandId: string, assetId: string) =>
    ['forge', brandId, 'scene-template', assetId] as const,
  /** One draft of one output with one set of values; `request` is part of the key. */
  scenePreview: (brandId: string, assetId: string, request: unknown) =>
    ['forge', brandId, 'scene-preview', assetId, request] as const,
  sceneRenders: (brandId: string, assetId: string) =>
    ['forge', brandId, 'scene-renders', assetId] as const,
  sceneRender: (brandId: string, assetId: string, jobId: string) =>
    ['forge', brandId, 'scene-renders', assetId, jobId] as const,
  hyperframesFilmFields: (brandId: string, assetId: string) =>
    ['forge', brandId, 'hyperframes-film-fields', assetId] as const,
  nativeScene: (brandId: string, assetId: string, revisionId?: string) =>
    ['forge', brandId, 'hyperframes-scene', assetId, revisionId ?? 'original'] as const,
  nativeRenders: (brandId: string, assetId: string) =>
    ['forge', brandId, 'hyperframes-renders', assetId] as const,
  nativeRender: (brandId: string, assetId: string, jobId: string) =>
    ['forge', brandId, 'hyperframes-render', assetId, jobId] as const,
  nativeUploads: (brandId: string, assetId: string) =>
    ['forge', brandId, 'hyperframes-uploads', assetId] as const,
  nativeUpload: (brandId: string, assetId: string, jobId: string) =>
    ['forge', brandId, 'hyperframes-upload', assetId, jobId] as const,
} as const;

/** Everything this brand may render, from every binding, as one list. The Forge page reads it on
 * mount, so the picker is full by the time Render is opened. */
export const templateListQuery = (brandId: string) => ({
  queryKey: forgeQueryKeys.templateList(brandId, null),
  queryFn: () => apiRendersApi.listTemplates(brandId, null),
  staleTime: FORGE_STALE_MS.lists,
});

/** The Templates tab's cards. They roll in a page at a time as the stream reads. */
export const templateSourcesQuery = (brandId: string) =>
  queryOptions({
    queryKey: forgeQueryKeys.templateSources(brandId),
    queryFn: experimental_streamedQuery({
      streamFn: () => streamTemplateSources(brandId),
      reducer: (sources: TemplateSourceSummary[], page: TemplateSourceSummary[]) => [
        ...sources,
        ...page,
      ],
      initialValue: [],
      refetchMode: 'replace',
    }),
    staleTime: FORGE_STALE_MS.lists,
  });

export const workspaceTemplatesQuery = (brandId: string) =>
  queryOptions({
    queryKey: forgeQueryKeys.workspaceTemplates(brandId),
    queryFn: () => discoverWorkspaceTemplates(brandId),
    staleTime: FORGE_STALE_MS.lists,
  });

/** The brand's template registry: every family, its variants and their revisions. The Templates
 * tab shows skeleton rows until it answers. */
export const revisionVariantsQuery = (brandId: string) =>
  queryOptions({
    queryKey: forgeQueryKeys.revisionVariants(brandId, 'all'),
    queryFn: () => fetchTemplateRevisionVariants(brandId),
    staleTime: FORGE_STALE_MS.active,
  });

export const templateVariantsQuery = (brandId: string) =>
  queryOptions({
    queryKey: forgeQueryKeys.templateVariants(brandId),
    queryFn: () => fetchTemplateVariants(brandId),
    staleTime: FORGE_STALE_MS.active,
  });

export const variantDefaultsQuery = (brandId: string) =>
  queryOptions({
    queryKey: forgeQueryKeys.variantDefaults(brandId),
    queryFn: () => fetchTemplateVariantDefaults(brandId),
    staleTime: FORGE_STALE_MS.lists,
  });

/** Forge's route loader, run from the sidebar on intent: every read the Templates tab waits on
 * before its skeleton goes, and the page's own code, which otherwise downloads only after the
 * server answers the navigation. The Render picker's list stays with ForgeTabs: nothing on the
 * first screen shows it. */
export function prefetchForgeEntry(queryClient: QueryClient, brandId: string) {
  return Promise.all([
    import('@/components/forge/ForgeTabs'),
    queryClient.prefetchQuery(templateSourcesQuery(brandId)),
    queryClient.prefetchQuery(workspaceTemplatesQuery(brandId)),
    queryClient.prefetchQuery(revisionVariantsQuery(brandId)),
    queryClient.prefetchQuery(templateVariantsQuery(brandId)),
    queryClient.prefetchQuery(variantDefaultsQuery(brandId)),
  ]);
}

/** The three reads a chosen template's grid waits for. The picker starts them on highlight, so a
 * click usually lands on all three already cached. */
export const templateLoadQueries = (
  brandId: string,
  bindingId: string | null,
  templateKey: string,
) => ({
  contract: {
    queryKey: forgeQueryKeys.contract(brandId, bindingId, templateKey),
    queryFn: () => apiRendersApi.getContract(brandId, templateKey, bindingId),
    staleTime: FORGE_STALE_MS.contract,
  },
  inputSets: {
    queryKey: forgeQueryKeys.inputSets(brandId, templateKey),
    queryFn: () => apiRendersApi.listInputSets(brandId, templateKey),
    staleTime: FORGE_STALE_MS.lists,
  },
  renderSets: {
    queryKey: forgeQueryKeys.renderSetList(brandId, templateKey),
    queryFn: () => apiRendersApi.listRenderSets(brandId, templateKey),
    staleTime: FORGE_STALE_MS.lists,
  },
});

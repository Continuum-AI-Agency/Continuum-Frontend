import {
  API_RENDER_BATCH_PREFLIGHT_ROUTE,
  API_RENDER_BATCHES_ROUTE,
  API_RENDER_DESTINATIONS_ROUTE,
  API_RENDER_DRAFT_SOURCES_STATUS_ROUTE,
  API_RENDER_DRIVE_SNAPSHOT_ROUTE,
  API_RENDER_ENVIRONMENTS_ROUTE,
  API_RENDER_IMPORT_MEDIA_ROUTE,
  API_RENDER_IMPORT_PREVIEW_ROUTE,
  API_RENDER_INPUT_SETS_ROUTE,
  API_RENDER_JOBS_ROUTE,
  API_RENDER_PREFLIGHT_ROUTE,
  API_RENDER_PREVIEW_ROUTE,
  API_RENDER_SETS_ROUTE,
  API_RENDER_SLACK_CHANNELS_ROUTE,
  API_RENDER_SUGGEST_ROWS_ROUTE,
  API_RENDER_TEMPLATES_ROUTE,
  type ApiRenderBatch,
  type ApiRenderBatchPreflightRequest,
  type ApiRenderBatchPreflightResponse,
  type ApiRenderBatchShareResponse,
  type ApiRenderCreateDeliveryDestinationRequest,
  type ApiRenderCreateInputSetRequest,
  type ApiRenderCreateJobRequest,
  type ApiRenderDeliveryDestination,
  type ApiRenderDeliveryDestinationsResponse,
  type ApiRenderDraftSourcesStatusRequest,
  type ApiRenderDraftSourcesStatusResponse,
  type ApiRenderEnvironmentListResponse,
  type ApiRenderInputSet,
  type ApiRenderInputSetListResponse,
  type ApiRenderJob,
  type ApiRenderJobListResponse,
  type ApiRenderPreflightRequest,
  type ApiRenderPreflightResponse,
  type ApiRenderSlackChannelListResponse,
  type ApiRenderSuggestRowsRequest,
  type ApiRenderSuggestRowsResponse,
  type ApiRenderTemplateContract,
  type ApiRenderTemplateListResponse,
  type ApiRenderUpdateInputSetRequest,
  apiRenderBatchPreflightResponseSchema,
  apiRenderBatchSchema,
  apiRenderBatchShareResponseSchema,
  apiRenderBatchShareRoute,
  apiRenderDeliveryDestinationSchema,
  apiRenderDeliveryDestinationsResponseSchema,
  apiRenderDestinationRoute,
  apiRenderDraftSourcesStatusResponseSchema,
  apiRenderEnvironmentListResponseSchema,
  apiRenderInputSetListResponseSchema,
  apiRenderInputSetSchema,
  apiRenderJobListResponseSchema,
  apiRenderJobSchema,
  apiRenderPreflightResponseSchema,
  apiRenderSlackChannelListResponseSchema,
  apiRenderSuggestRowsResponseSchema,
  apiRenderTemplateContractSchema,
  apiRenderTemplateListResponseSchema,
  type CreateForgeRenderSetRequest,
  type ForgeRenderDriveSnapshot,
  type ForgeRenderDriveSnapshotRequest,
  type ForgeRenderImportMediaRequest,
  type ForgeRenderImportMediaResponse,
  type ForgeRenderImportPreview,
  type ForgeRenderImportPreviewRequest,
  type ForgeRenderPreview,
  type ForgeRenderPreviewRequest,
  type ForgeRenderSet,
  type ForgeRenderSetRevision,
  forgeRenderDriveSnapshotSchema,
  forgeRenderImportMediaResponseSchema,
  forgeRenderImportPreviewSchema,
  forgeRenderPreviewSchema,
  forgeRenderSetListResponseSchema,
  forgeRenderSetRevisionListResponseSchema,
  forgeRenderSetSchema,
  type UpdateForgeRenderSetRequest,
} from '@continuum/contracts';
import { getApiBaseUrl } from '@/lib/api/config';
import { http } from '@/lib/api/http';

const query = (input: Record<string, string | number>) =>
  new URLSearchParams(Object.entries(input).map(([key, value]) => [key, String(value)])).toString();

export const apiRendersApi = {
  importMedia(input: ForgeRenderImportMediaRequest) {
    return http.request<ForgeRenderImportMediaResponse>({
      path: API_RENDER_IMPORT_MEDIA_ROUTE,
      method: 'POST',
      body: input,
      schema: forgeRenderImportMediaResponseSchema,
    });
  },
  previewImport(input: ForgeRenderImportPreviewRequest) {
    return http.request<ForgeRenderImportPreview>({
      path: API_RENDER_IMPORT_PREVIEW_ROUTE,
      method: 'POST',
      body: input,
      schema: forgeRenderImportPreviewSchema,
    });
  },
  snapshotDriveFolder(input: ForgeRenderDriveSnapshotRequest) {
    return http.request<ForgeRenderDriveSnapshot>({
      path: API_RENDER_DRIVE_SNAPSHOT_ROUTE,
      method: 'POST',
      body: input,
      schema: forgeRenderDriveSnapshotSchema,
    });
  },
  // Which workspaces this brand can render into. Most brands answer with one — the picker
  // collapses to a label then — but a brand with several could previously reach only its
  // default and had no way to see that the others existed.
  listEnvironments(brandId: string) {
    return http.request<ApiRenderEnvironmentListResponse>({
      path: `${API_RENDER_ENVIRONMENTS_ROUTE}?${query({ brandId })}`,
      schema: apiRenderEnvironmentListResponseSchema,
    });
  },
  // `bindingId` is omitted, not sent empty, when the node is on the brand's default: an absent
  // param means "the default" on the server, and sending a blank one would be a 400.
  listTemplates(brandId: string, bindingId?: string | null) {
    return http.request<ApiRenderTemplateListResponse>({
      path: `${API_RENDER_TEMPLATES_ROUTE}?${query(bindingId ? { brandId, bindingId } : { brandId })}`,
      schema: apiRenderTemplateListResponseSchema,
    });
  },
  getContract(brandId: string, templateKey: string, bindingId?: string | null) {
    return http.request<ApiRenderTemplateContract>({
      path: `${API_RENDER_TEMPLATES_ROUTE}/${encodeURIComponent(templateKey)}/contract?${query(
        bindingId ? { brandId, bindingId } : { brandId },
      )}`,
      schema: apiRenderTemplateContractSchema,
    });
  },
  preflight(input: ApiRenderPreflightRequest) {
    return http.request<ApiRenderPreflightResponse>({
      path: API_RENDER_PREFLIGHT_ROUTE,
      method: 'POST',
      body: input,
      schema: apiRenderPreflightResponseSchema,
    });
  },
  /** One row composed over the closest real render (or drawn whole from the template) on the server. */
  composePreview(input: ForgeRenderPreviewRequest) {
    return http.request<ForgeRenderPreview>({
      path: API_RENDER_PREVIEW_ROUTE,
      method: 'POST',
      body: input,
      schema: forgeRenderPreviewSchema,
    });
  },
  createJob(input: ApiRenderCreateJobRequest) {
    return http.request<ApiRenderJob>({
      path: API_RENDER_JOBS_ROUTE,
      method: 'POST',
      body: input,
      schema: apiRenderJobSchema,
    });
  },
  listJobs(
    brandId: string,
    limit = 10,
    options?: {
      cursor?: string;
      renderSetId?: string;
      renderSetRowId?: string;
      templateKey?: string;
      status?: ApiRenderJob['status'];
      batchId?: string;
    },
  ) {
    return http.request<ApiRenderJobListResponse>({
      path: `${API_RENDER_JOBS_ROUTE}?${query({
        brandId,
        limit,
        ...(options?.cursor ? { cursor: options.cursor } : {}),
        ...(options?.renderSetId ? { renderSetId: options.renderSetId } : {}),
        ...(options?.renderSetRowId ? { renderSetRowId: options.renderSetRowId } : {}),
        ...(options?.templateKey ? { templateKey: options.templateKey } : {}),
        ...(options?.status ? { status: options.status } : {}),
        ...(options?.batchId ? { batchId: options.batchId } : {}),
      })}`,
      schema: apiRenderJobListResponseSchema,
    });
  },
  getJob(brandId: string, jobId: string) {
    return http.request<ApiRenderJob>({
      path: `${API_RENDER_JOBS_ROUTE}/${encodeURIComponent(jobId)}?${query({ brandId })}`,
      schema: apiRenderJobSchema,
    });
  },

  // Saved input sets. Brand-scoped everywhere; `templateKey` is the server's optional
  // filter, and the node always passes it — a set authored against one template's
  // contract is meaningless against another.
  listInputSets(brandId: string, templateKey?: string) {
    const params = templateKey ? query({ brandId, templateKey }) : query({ brandId });
    return http.request<ApiRenderInputSetListResponse>({
      path: `${API_RENDER_INPUT_SETS_ROUTE}?${params}`,
      schema: apiRenderInputSetListResponseSchema,
    });
  },
  createInputSet(input: ApiRenderCreateInputSetRequest) {
    return http.request<ApiRenderInputSet>({
      path: API_RENDER_INPUT_SETS_ROUTE,
      method: 'POST',
      body: input,
      schema: apiRenderInputSetSchema,
    });
  },
  // The one asymmetry in this surface: PATCH reads brandId from the BODY, not the
  // query string. Mirrored here rather than "fixed", because the server is the server.
  updateInputSet(inputSetId: string, input: ApiRenderUpdateInputSetRequest) {
    return http.request<ApiRenderInputSet>({
      path: `${API_RENDER_INPUT_SETS_ROUTE}/${encodeURIComponent(inputSetId)}`,
      method: 'PATCH',
      body: input,
      schema: apiRenderInputSetSchema,
    });
  },
  deleteInputSet(brandId: string, inputSetId: string) {
    return http.request<void>({
      path: `${API_RENDER_INPUT_SETS_ROUTE}/${encodeURIComponent(inputSetId)}?${query({ brandId })}`,
      method: 'DELETE',
    });
  },

  listRenderSets(brandId: string, templateKey?: string) {
    return http.request<{ items: ForgeRenderSet[]; nextCursor: null }>({
      path: `${API_RENDER_SETS_ROUTE}?${query(
        templateKey ? { brandId, templateKey } : { brandId },
      )}`,
      schema: forgeRenderSetListResponseSchema,
    });
  },
  getRenderSet(brandId: string, setId: string) {
    return http.request<ForgeRenderSet>({
      path: `${API_RENDER_SETS_ROUTE}/${encodeURIComponent(setId)}?${query({ brandId })}`,
      schema: forgeRenderSetSchema,
    });
  },
  createRenderSet(input: CreateForgeRenderSetRequest) {
    return http.request<ForgeRenderSet>({
      path: API_RENDER_SETS_ROUTE,
      method: 'POST',
      body: input,
      schema: forgeRenderSetSchema,
    });
  },
  updateRenderSet(setId: string, input: UpdateForgeRenderSetRequest) {
    return http.request<ForgeRenderSet>({
      path: `${API_RENDER_SETS_ROUTE}/${encodeURIComponent(setId)}`,
      method: 'PUT',
      body: input,
      schema: forgeRenderSetSchema,
    });
  },
  /** The states the set was left in, newest first, for Version history. */
  listRenderSetRevisions(brandId: string, setId: string) {
    return http.request<{ items: ForgeRenderSetRevision[] }>({
      path: `${API_RENDER_SETS_ROUTE}/${encodeURIComponent(setId)}/revisions?${query({ brandId })}`,
      schema: forgeRenderSetRevisionListResponseSchema,
    });
  },
  deleteRenderSet(brandId: string, setId: string) {
    return http.request<void>({
      path: `${API_RENDER_SETS_ROUTE}/${encodeURIComponent(setId)}?${query({ brandId })}`,
      method: 'DELETE',
    });
  },

  // Batches. One token wraps N per-record tokens; every job createBatch makes carries its
  // `batchId`, so `listJobs({ batchId })` reads the whole batch back later.
  batchPreflight(input: ApiRenderBatchPreflightRequest) {
    return http.request<ApiRenderBatchPreflightResponse>({
      path: API_RENDER_BATCH_PREFLIGHT_ROUTE,
      method: 'POST',
      body: input,
      schema: apiRenderBatchPreflightResponseSchema,
    });
  },
  // AI fill for the requests grid. Proposals only — nothing is rendered or saved.
  suggestRows(input: ApiRenderSuggestRowsRequest) {
    return http.request<ApiRenderSuggestRowsResponse>({
      path: API_RENDER_SUGGEST_ROWS_ROUTE,
      method: 'POST',
      body: input,
      schema: apiRenderSuggestRowsResponseSchema,
    });
  },
  draftSourcesStatus(input: ApiRenderDraftSourcesStatusRequest) {
    return http.request<ApiRenderDraftSourcesStatusResponse>({
      path: API_RENDER_DRAFT_SOURCES_STATUS_ROUTE,
      method: 'POST',
      body: input,
      schema: apiRenderDraftSourcesStatusResponseSchema,
    });
  },
  // Delivery destinations: where a render can go besides the Library. The Slack channel list is
  // the requesting user's own workspace, so it is safe to show in a brand-scoped picker.
  listDeliveryDestinations(brandId: string) {
    return http.request<ApiRenderDeliveryDestinationsResponse>({
      path: `${API_RENDER_DESTINATIONS_ROUTE}?${query({ brandId })}`,
      schema: apiRenderDeliveryDestinationsResponseSchema,
    });
  },
  listSlackChannels(brandId: string) {
    return http.request<ApiRenderSlackChannelListResponse>({
      path: `${API_RENDER_SLACK_CHANNELS_ROUTE}?${query({ brandId })}`,
      schema: apiRenderSlackChannelListResponseSchema,
    });
  },
  createDeliveryDestination(input: ApiRenderCreateDeliveryDestinationRequest) {
    return http.request<ApiRenderDeliveryDestination>({
      path: API_RENDER_DESTINATIONS_ROUTE,
      method: 'POST',
      body: input,
      schema: apiRenderDeliveryDestinationSchema,
    });
  },
  /**
   * Switches a room off (`active = false`) — nothing is deleted, so the rows already delivered
   * there keep reading. Refused 409 `chat_destination_has_pending_approvals` when it is the last
   * active room on a package whose approvals are still pending: retiring it would strand them.
   */
  retireDeliveryDestination(destinationId: string) {
    return http.request<void>({
      path: apiRenderDestinationRoute(destinationId),
      method: 'DELETE',
    });
  },
  /**
   * A 30-day link that downloads the batch as one zip, with no sign-in. Minted per click: the
   * link is the credential, so it is never cached or shown before someone asks for it.
   */
  async shareBatch(brandId: string, batchId: string) {
    const share = await http.request<ApiRenderBatchShareResponse>({
      path: apiRenderBatchShareRoute(batchId),
      method: 'POST',
      body: { brandId },
      schema: apiRenderBatchShareResponseSchema,
    });
    return { url: `${getApiBaseUrl()}${share.path}`, expiresAt: share.expiresAt };
  },
  createBatch(input: ApiRenderCreateJobRequest) {
    return http.request<ApiRenderBatch>({
      path: API_RENDER_BATCHES_ROUTE,
      method: 'POST',
      body: input,
      schema: apiRenderBatchSchema,
    });
  },
};

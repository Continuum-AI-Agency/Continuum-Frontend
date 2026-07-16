import {
  bulkSetAssetFieldValueOperationSchema,
  bulkTransitionAssetReviewOperationSchema,
  bulkUpdateAssetTagsOperationSchema,
  type CreateCommentRequest,
  type CreateShareLinkRequest,
  type CustomFieldValue,
  createCommentOperationSchema,
  createLibraryCollectionOperationSchema,
  createLibrarySavedViewOperationSchema,
  createShareLinkOperationSchema,
  creativeOperationErrorSchema,
  type DeleteCommentRequest,
  decideAssetReviewOperationSchema,
  deleteCommentOperationSchema,
  deleteCommentResponseSchema,
  deleteLibraryCollectionOperationSchema,
  deleteLibrarySavedViewOperationSchema,
  deleteLibrarySavedViewResponseSchema,
  type EnsureAssetHeadVersionResponse,
  ensureAssetHeadVersionRequestSchema,
  ensureAssetHeadVersionResponseSchema,
  type LibraryBrowseQuery,
  type LibrarySavedView,
  type ListVersionsResponse,
  libraryBulkCommandResponseSchema,
  libraryCollectionCommandResponseSchema,
  libraryCollectionDeleteResponseSchema,
  librarySavedViewSchema,
  libraryTagMutationResponseSchema,
  listAssetVersionsOperationSchema,
  listShareLinksOperationSchema,
  listShareLinksResponseSchema,
  listVersionsResponseSchema,
  type MediaCollection,
  type MediaComment,
  mediaCommentSchema,
  mergeLibraryTagsOperationSchema,
  mutateCollectionMembershipOperationSchema,
  type RegisterGeneratedAssetOperation,
  type RegisterGeneratedAssetResponse,
  type RegisterVersionResponse,
  type ReviewCommandResponse,
  type ReviewTransitionResponse,
  type RevokeShareLinkRequest,
  registerAssetVersionOperationSchema,
  registerGeneratedAssetOperationSchema,
  registerGeneratedAssetResponseSchema,
  registerVersionResponseSchema,
  renameLibraryTagOperationSchema,
  requestAssetReviewOperationSchema,
  reviewCommandResponseSchema,
  reviewTransitionResponseSchema,
  revokeShareLinkOperationSchema,
  rollbackAssetVersionOperationSchema,
  type ShareLink,
  shareLinkSchema,
  signVersionUploadOperationSchema,
  transitionAssetReviewOperationSchema,
  type UpdateCommentRequest,
  updateCommentOperationSchema,
  updateLibraryCollectionOperationSchema,
  type VersionSignUploadResponse,
  versionSignUploadResponseSchema,
} from '@continuum/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { z } from 'zod';

const CREATIVE_OPERATIONS_FUNCTION = 'library-creative-operations';

export class CreativeOperationError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
  ) {
    super(message);
    this.name = 'CreativeOperationError';
  }
}

async function invokeCreativeOperation<T>(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
  responseSchema: z.ZodType<T>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(CREATIVE_OPERATIONS_FUNCTION, { body });
  if (error) {
    const context = error as { context?: unknown };
    const response = context.context instanceof Response ? context.context : null;
    let detail: string | null = null;
    if (response) {
      try {
        const payload = await response.clone().json();
        const structured = creativeOperationErrorSchema.safeParse(payload);
        detail = structured.success
          ? `${structured.data.code}: ${structured.data.message}`
          : typeof (payload as { error?: unknown }).error === 'string'
            ? String((payload as { error: string }).error)
            : null;
      } catch {
        // The Edge Function should send JSON, but a platform failure may not.
      }
    }
    throw new CreativeOperationError(
      detail ?? `Creative Operations request failed: ${error.message}`,
      response?.status ?? null,
    );
  }
  return responseSchema.parse(data);
}

// The Edge Function owns the only privileged Library operation in this path:
// materializing an immutable v1 row with the asset creator preserved. Route
// handlers keep all ordinary reads and comment writes on the caller's RLS
// scoped client, so a Vercel service key is never part of this workflow.
export async function ensureAssetHeadVersion(
  supabase: SupabaseClient,
  input: { brandId: string; assetId: string },
): Promise<EnsureAssetHeadVersionResponse> {
  const body = ensureAssetHeadVersionRequestSchema.parse({
    action: 'ensure_head_version',
    ...input,
  });
  return invokeCreativeOperation(supabase, body, ensureAssetHeadVersionResponseSchema);
}

export function listAssetVersions(
  supabase: SupabaseClient,
  input: { brandId: string; assetId: string },
): Promise<ListVersionsResponse> {
  return invokeCreativeOperation(
    supabase,
    listAssetVersionsOperationSchema.parse({ action: 'list_asset_versions', ...input }),
    listVersionsResponseSchema,
  );
}

export function signVersionUpload(
  supabase: SupabaseClient,
  input: { brandId: string; assetId: string; fileName: string; mimeType: string },
): Promise<VersionSignUploadResponse> {
  return invokeCreativeOperation(
    supabase,
    signVersionUploadOperationSchema.parse({ action: 'sign_version_upload', ...input }),
    versionSignUploadResponseSchema,
  );
}

export function registerAssetVersion(
  supabase: SupabaseClient,
  input: {
    brandId: string;
    assetId: string;
    bucket: string;
    storagePath: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    note?: string;
    integrityState?: 'verified' | 'skipped_large_file' | 'unknown';
    idempotencyKey?: string;
  },
): Promise<RegisterVersionResponse> {
  return invokeCreativeOperation(
    supabase,
    registerAssetVersionOperationSchema.parse({
      action: 'register_asset_version',
      ...input,
      idempotencyKey: input.idempotencyKey ?? crypto.randomUUID(),
    }),
    registerVersionResponseSchema,
  );
}

export function registerGeneratedAssetOperation(
  supabase: SupabaseClient,
  input: Omit<RegisterGeneratedAssetOperation, 'action'>,
): Promise<RegisterGeneratedAssetResponse> {
  return invokeCreativeOperation(
    supabase,
    registerGeneratedAssetOperationSchema.parse({
      action: 'register_generated_asset',
      ...input,
    }),
    registerGeneratedAssetResponseSchema,
  );
}

export function rollbackAssetVersion(
  supabase: SupabaseClient,
  input: { brandId: string; assetId: string; versionId: string; idempotencyKey?: string },
): Promise<RegisterVersionResponse> {
  return invokeCreativeOperation(
    supabase,
    rollbackAssetVersionOperationSchema.parse({
      action: 'rollback_asset_version',
      ...input,
      idempotencyKey: input.idempotencyKey ?? crypto.randomUUID(),
    }),
    registerVersionResponseSchema,
  );
}

export function createAssetCommentOperation(
  supabase: SupabaseClient,
  input: CreateCommentRequest,
): Promise<MediaComment> {
  return invokeCreativeOperation(
    supabase,
    createCommentOperationSchema.parse({
      action: 'create_asset_comment',
      ...input,
      idempotencyKey: input.idempotencyKey ?? crypto.randomUUID(),
    }),
    mediaCommentSchema,
  );
}

export function updateAssetCommentOperation(
  supabase: SupabaseClient,
  input: UpdateCommentRequest,
): Promise<MediaComment> {
  return invokeCreativeOperation(
    supabase,
    updateCommentOperationSchema.parse({
      action: 'update_asset_comment',
      ...input,
      idempotencyKey: input.idempotencyKey ?? crypto.randomUUID(),
    }),
    mediaCommentSchema,
  );
}

export async function deleteAssetCommentOperation(
  supabase: SupabaseClient,
  input: DeleteCommentRequest,
): Promise<void> {
  await invokeCreativeOperation(
    supabase,
    deleteCommentOperationSchema.parse({
      action: 'delete_asset_comment',
      ...input,
      idempotencyKey: input.idempotencyKey ?? crypto.randomUUID(),
    }),
    deleteCommentResponseSchema,
  );
}

export function transitionAssetReviewOperation(
  supabase: SupabaseClient,
  input: {
    brandId: string;
    assetId: string;
    toStatus: 'none' | 'draft' | 'in_review' | 'needs_changes' | 'approved';
    note?: string;
    idempotencyKey?: string;
  },
): Promise<ReviewTransitionResponse> {
  return invokeCreativeOperation(
    supabase,
    transitionAssetReviewOperationSchema.parse({
      action: 'transition_asset_review',
      ...input,
      idempotencyKey: input.idempotencyKey ?? crypto.randomUUID(),
    }),
    reviewTransitionResponseSchema,
  );
}

export function requestAssetReviewOperation(
  supabase: SupabaseClient,
  input: {
    brandId: string;
    assetId: string;
    reviewerUserIds: string[];
    note?: string;
    dueAt?: string;
    idempotencyKey?: string;
  },
): Promise<ReviewCommandResponse> {
  return invokeCreativeOperation(
    supabase,
    requestAssetReviewOperationSchema.parse({
      action: 'request_asset_review',
      ...input,
      idempotencyKey: input.idempotencyKey ?? crypto.randomUUID(),
    }),
    reviewCommandResponseSchema,
  );
}

export function decideAssetReviewOperation(
  supabase: SupabaseClient,
  input: {
    brandId: string;
    reviewRequestId: string;
    decision: 'approved' | 'needs_changes';
    note?: string;
    idempotencyKey?: string;
  },
): Promise<ReviewCommandResponse> {
  return invokeCreativeOperation(
    supabase,
    decideAssetReviewOperationSchema.parse({
      action: 'decide_asset_review',
      ...input,
      idempotencyKey: input.idempotencyKey ?? crypto.randomUUID(),
    }),
    reviewCommandResponseSchema,
  );
}

export function createLibrarySavedViewOperation(
  supabase: SupabaseClient,
  input: {
    brandId: string;
    name: string;
    query: LibraryBrowseQuery;
    isShared?: boolean;
  },
): Promise<LibrarySavedView> {
  return invokeCreativeOperation(
    supabase,
    createLibrarySavedViewOperationSchema.parse({ action: 'create_saved_view', ...input }),
    librarySavedViewSchema,
  );
}

export function deleteLibrarySavedViewOperation(
  supabase: SupabaseClient,
  input: { brandId: string; savedViewId: string },
): Promise<{ ok: true; savedViewId: string }> {
  return invokeCreativeOperation(
    supabase,
    deleteLibrarySavedViewOperationSchema.parse({ action: 'delete_saved_view', ...input }),
    deleteLibrarySavedViewResponseSchema,
  );
}

export function createShareLinkOperation(
  supabase: SupabaseClient,
  input: CreateShareLinkRequest,
): Promise<ShareLink> {
  return invokeCreativeOperation(
    supabase,
    createShareLinkOperationSchema.parse({
      action: 'create_share_link',
      ...input,
      idempotencyKey: input.idempotencyKey ?? crypto.randomUUID(),
    }),
    shareLinkSchema,
  );
}

export async function listShareLinksOperation(
  supabase: SupabaseClient,
  input: { brandId: string; assetId: string },
): Promise<ShareLink[]> {
  const result = await invokeCreativeOperation(
    supabase,
    listShareLinksOperationSchema.parse({ action: 'list_share_links', ...input }),
    listShareLinksResponseSchema,
  );
  return result.links;
}

export function revokeShareLinkOperation(
  supabase: SupabaseClient,
  input: RevokeShareLinkRequest,
): Promise<ShareLink> {
  return invokeCreativeOperation(
    supabase,
    revokeShareLinkOperationSchema.parse({
      action: 'revoke_share_link',
      ...input,
      idempotencyKey: input.idempotencyKey ?? crypto.randomUUID(),
    }),
    shareLinkSchema,
  );
}

export async function createLibraryCollectionOperation(
  supabase: SupabaseClient,
  input: {
    brandId: string;
    name: string;
    kind?: 'manual' | 'smart';
    smartQuery?: Omit<LibraryBrowseQuery, 'cursor'>;
  },
): Promise<MediaCollection> {
  const result = await invokeCreativeOperation(
    supabase,
    createLibraryCollectionOperationSchema.parse({
      action: 'create_library_collection',
      ...input,
      idempotencyKey: crypto.randomUUID(),
    }),
    libraryCollectionCommandResponseSchema,
  );
  return result.collection;
}

export async function updateLibraryCollectionOperation(
  supabase: SupabaseClient,
  input: {
    brandId: string;
    collectionId: string;
    name?: string;
    smartQuery?: Omit<LibraryBrowseQuery, 'cursor'> | null;
  },
): Promise<MediaCollection> {
  const result = await invokeCreativeOperation(
    supabase,
    updateLibraryCollectionOperationSchema.parse({
      action: 'update_library_collection',
      ...input,
      idempotencyKey: crypto.randomUUID(),
    }),
    libraryCollectionCommandResponseSchema,
  );
  return result.collection;
}

export function deleteLibraryCollectionOperation(
  supabase: SupabaseClient,
  input: { brandId: string; collectionId: string },
): Promise<{ collectionId: string }> {
  return invokeCreativeOperation(
    supabase,
    deleteLibraryCollectionOperationSchema.parse({
      action: 'delete_library_collection',
      ...input,
      idempotencyKey: crypto.randomUUID(),
    }),
    libraryCollectionDeleteResponseSchema,
  );
}

export async function mutateCollectionMembershipOperation(
  supabase: SupabaseClient,
  input: {
    brandId: string;
    collectionId: string;
    assetIds: string[];
    mode: 'add' | 'remove';
  },
): Promise<string[]> {
  const result = await invokeCreativeOperation(
    supabase,
    mutateCollectionMembershipOperationSchema.parse({
      action: 'mutate_collection_membership',
      ...input,
      idempotencyKey: crypto.randomUUID(),
    }),
    libraryBulkCommandResponseSchema,
  );
  return result.updatedAssetIds;
}

export async function bulkUpdateAssetTagsOperation(
  supabase: SupabaseClient,
  input: { brandId: string; assetIds: string[]; addTags?: string[]; removeTags?: string[] },
): Promise<string[]> {
  const result = await invokeCreativeOperation(
    supabase,
    bulkUpdateAssetTagsOperationSchema.parse({
      action: 'bulk_update_asset_tags',
      ...input,
      idempotencyKey: crypto.randomUUID(),
    }),
    libraryBulkCommandResponseSchema,
  );
  return result.updatedAssetIds;
}

export async function bulkTransitionAssetReviewOperation(
  supabase: SupabaseClient,
  input: {
    brandId: string;
    assetIds: string[];
    toStatus: 'none' | 'draft' | 'in_review' | 'needs_changes' | 'approved';
    note?: string;
  },
): Promise<string[]> {
  const result = await invokeCreativeOperation(
    supabase,
    bulkTransitionAssetReviewOperationSchema.parse({
      action: 'bulk_transition_asset_review',
      ...input,
      idempotencyKey: crypto.randomUUID(),
    }),
    libraryBulkCommandResponseSchema,
  );
  return result.updatedAssetIds;
}

export async function bulkSetAssetFieldValueOperation(
  supabase: SupabaseClient,
  input: {
    brandId: string;
    assetIds: string[];
    fieldId: string;
    value: CustomFieldValue;
  },
): Promise<string[]> {
  const result = await invokeCreativeOperation(
    supabase,
    bulkSetAssetFieldValueOperationSchema.parse({
      action: 'bulk_set_asset_field_value',
      ...input,
      idempotencyKey: crypto.randomUUID(),
    }),
    libraryBulkCommandResponseSchema,
  );
  return result.updatedAssetIds;
}

export function renameLibraryTagOperation(
  supabase: SupabaseClient,
  input: { brandId: string; fromTag: string; toTag: string },
): Promise<{ canonicalTag: string; mergedTags: string[]; updatedAssetCount: number }> {
  return invokeCreativeOperation(
    supabase,
    renameLibraryTagOperationSchema.parse({
      action: 'rename_library_tag',
      ...input,
      idempotencyKey: crypto.randomUUID(),
    }),
    libraryTagMutationResponseSchema,
  );
}

export function mergeLibraryTagsOperation(
  supabase: SupabaseClient,
  input: { brandId: string; sourceTags: string[]; targetTag: string },
): Promise<{ canonicalTag: string; mergedTags: string[]; updatedAssetCount: number }> {
  return invokeCreativeOperation(
    supabase,
    mergeLibraryTagsOperationSchema.parse({
      action: 'merge_library_tags',
      ...input,
      idempotencyKey: crypto.randomUUID(),
    }),
    libraryTagMutationResponseSchema,
  );
}

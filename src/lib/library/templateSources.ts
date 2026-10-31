'use client';

import {
  templateVersionBranchRequestSchema, templateVersionDiffRequestSchema,
  templateVersionDiffResponseSchema, templateVersionResultSchema,
  templateVersionMergePreviewRequestSchema, templateVersionMergePreviewSchema,
  templateVersionMergeCommitRequestSchema, templateVersionRevertRequestSchema,
  templateVersionCapabilitiesSchema, templateVersionCommitsResponseSchema,
  templateVersionHistoryQuerySchema, templateVersionHistoryResponseSchema, templateReleaseListQuerySchema, templateReleaseListResponseSchema,
  templateReleaseRequestSchema, templateReleaseRollbackRequestSchema, templateReleaseResultSchema,
  type TemplateVersionHistoryQuery, type TemplateVersionBranchRequest, type TemplateVersionDiffRequest,
  type TemplateVersionMergePreviewRequest, type TemplateVersionMergeCommitRequest,
  type TemplateVersionRevertRequest, type TemplateReleaseRequest, type TemplateReleaseRollbackRequest,
} from '@continuum/contracts';

import type {
  RenderWorkspace,
  TemplateFontPushResponse,
  TemplateAuthoringDocument,
  TemplateAuthoringDraft,
  TemplateAuthoringDraftPut,
  TemplateAuthoringWorkspacePreviewResponse,
  TemplateAuthoringArtifact,
  TemplateAuthoringCompileRequest,
  TemplateAuthoringArtifactReview,
  TemplateAuthoringArtifactCommit,
  TemplateAuthoringPreparationRequest,
  TemplateAuthoringPreparation,
  TemplateAuthoringNativeRenderRequest,
  TemplateAuthoringNativeRender,
  TemplateForgeBundle,
  TemplateForgeNeed,
  TemplateMappingReview,
  TemplateRebindPreview,
  TemplateSource,
  TemplateSourceSummary,
  WorkspaceTemplateDiscoveryResponse,
  ForgeLineageView,
  TemplateOperationInput,
  TemplateAuthoringWorkingCopy,
  TemplateAuthoringWorkingCopyOpenRequest,
  TemplateAuthoringScopeQuery,
} from '@continuum/contracts';
import type { MediaAssetVersion } from '@continuum/contracts';
import {
  type CreateTemplateVariantRequest,
  createTemplateVariantRequestSchema,
  type DesignArrangement,
  type DesignArrangementsResponse,
  type DesignImportRequest,
  type DesignImportResponse,
  type DesignLayersResponse,
  designArrangementsResponseSchema,
  designImportResponseSchema,
  designLayersResponseSchema,
  type FontInventoryRow,
  fontInventoryResponseSchema,
  type RenameTemplateSourceRequest,
  readFontNames,
  type SaveTemplateRevisionRequest,
  type TemplateColourFields,
  type TemplateFontAliasRequest,
  type TemplateFontCandidatesResponse,
  type TemplateFontHealResult,
  type TemplateRevisionPreviewRequest,
  type TemplateLayerPreviewRequest,
  type TemplateSourceEvent,
  type TemplateTextMoveRequest,
  type TemplateTextMoveResponse,
  type TemplateVariant,
  templateColourFieldsSchema,
  templateFontAliasRequestSchema,
  templateFontCandidatesResponseSchema,
  templateFontHealResultSchema,
  templateFontPushRequestSchema,
  templateFontPushResponseSchema,
  templateFontReadinessSchema,
  templateForgeBundleSchema,
  templateAuthoringDocumentSchema,
  templateAuthoringDraftSchema,
  templateAuthoringWorkspacePreviewResponseSchema,
  templateAuthoringArtifactSchema,
  templateAuthoringCompileRequestSchema,
  templateAuthoringArtifactReviewSchema,
  templateAuthoringArtifactCommitSchema,
  templateAuthoringPreparationRequestSchema,
  templateAuthoringPreparationSchema,
  templateAuthoringNativeRenderRequestSchema,
  templateAuthoringNativeRenderSchema,
  templateLayerPreviewResponseSchema,
  templateLayerInventorySchema,
  templateLayerSceneSchema,
  templateLayerVariantResponseSchema,
  templateMappingReviewSchema,
  templateRebindPreviewSchema,
  templateRevisionSchema,
  templateRevisionVariantsResponseSchema,
  templateVariantDefaultsResponseSchema,
  templateVariantSchema,
  templateVariantsResponseSchema,
  templateSourceEventsResponseSchema,
  templateSourceSchema,
  templateSourceListResponseSchema,
  templateTextMoveResponseSchema,
  workspaceTemplateDiscoveryResponseSchema,
  templateVersionHistoryAppendRequestSchema,
  templateVersionHistoryAppendResponseSchema,
  templateAuthoringWorkingCopySchema,
  templateAuthoringWorkingCopyOpenRequestSchema,
  templateAuthoringWorkingCopyListSchema,
} from '@continuum/contracts';
import { TemplateAuthoringDraftError } from '@/components/forge/layerDraft';
import { templateAuthoringEqual } from '@/components/forge/templateAuthoringEquality';
import { authoringScopeQuery, withAuthoringWorkingCopy } from '@/components/forge/authoringScope';
import { verifyTemplateAuthoringPackageResponse } from '@/components/forge/templateAuthoringPackage';
import { verifyTemplateAuthoringFontResponse } from '@/components/forge/templateAuthoringFont';
import { resolvePinnedArtworkVersion, type PinnedArtworkAssetRef } from '@/components/forge/templateArtworkPreview';
import { getApiUrl } from '@/lib/api/config';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { listAssetVersions } from './versions';

export type TemplateFontReadiness = import('@continuum/contracts').TemplateFontReadiness;

/** Reads the checkpoint lineage used to identify the bytes currently rendered by Forge. */
export async function fetchTemplateLineage(
  brandId: string,
  assetId: string,
): Promise<ForgeLineageView> {
  const response = await authorizedFetch(
    `/api/ai-studio/templates/${encodeURIComponent(assetId)}/lineage?brandId=${encodeURIComponent(brandId)}`,
  );
  return unwrap<ForgeLineageView>(response, 'Template lineage');
}

/** Resolves a freshly signed preview only for the immutable version in the draft. */
export async function fetchPinnedArtworkPreview(
  brandId: string,
  assetRef: PinnedArtworkAssetRef,
): Promise<MediaAssetVersion> {
  const versions = await listAssetVersions({ brandId, assetId: assetRef.assetId });
  return resolvePinnedArtworkVersion(versions, assetRef);
}

export async function repairTemplateText(
  assetId: string,
  request: TemplateTextMoveRequest,
): Promise<TemplateTextMoveResponse> {
  const response = await authorizedFetch(
    `/api/ai-studio/templates/${encodeURIComponent(assetId)}/repair-text`,
    { method: 'POST', body: JSON.stringify(request) },
  );
  return templateTextMoveResponseSchema.parse(await unwrap(response, 'Text layout repair'));
}

export async function editableTemplateFonts(brandId: string): Promise<FontInventoryRow[]> {
  const response = await authorizedFetch(
    `/api/ai-studio/fonts?brandId=${encodeURIComponent(brandId)}`,
  );
  const inventory = fontInventoryResponseSchema.parse(await unwrap(response, 'Available fonts'));
  return inventory.fonts.filter(
    (font) =>
      (font.brandId === brandId || font.brandId === null) &&
      !!font.postScriptName &&
      (font.format === 'ttf' || font.format === 'otf'),
  );
}

// Client for the template-source routes on the Fastify backend. They live there rather than
// in a Next route handler because they reach Template Forge with a server-only token, and
// because the font readiness check reads the private brand font store.

async function authorizedFetch(path: string, init?: RequestInit, expectedUserId?: string): Promise<Response> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('A signed-in session is required');
  if (expectedUserId && data.session?.user.id !== expectedUserId)
    throw new Error('This operation history belongs to another signed-in account. Its pending events are preserved.');
  return fetch(getApiUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
}

export async function appendTemplateAuthoringHistory(
  userId: string,
  assetId: string,
  brandId: string,
  operations: TemplateOperationInput[],
): Promise<void> {
  const request = templateVersionHistoryAppendRequestSchema.parse({ brandId, operations });
  const response = await authorizedFetch(`/api/ai-studio/templates/${encodeURIComponent(assetId)}/history`,
    { method: 'POST', body: JSON.stringify(request) }, userId);
  const { items } = templateVersionHistoryAppendResponseSchema.parse(await unwrap(response, 'Forge operation history'));
  const received = new Map(items.filter((event) => event.principalId === userId).map((event) => [event.id, event]));
  if (request.operations.some((event) => {
    const accepted = received.get(event.id);
    return !accepted || Object.entries(event).some(([key, value]) =>
      !templateAuthoringEqual(accepted[key as keyof typeof accepted], value));
  }))
    throw new Error('The server did not acknowledge every operation for this account. The original batch is preserved.');
}

async function unwrap<T>(response: Response, what: string): Promise<T> {
  if (!response.ok) {
    const detail = (await response.json().catch(() => ({}))) as { detail?: string; error?: string };
    throw new Error(detail.detail ?? detail.error ?? `${what} failed (${response.status})`);
  }
  return (await response.json()) as T;
}

const versionPath = (assetId: string, action: string) =>
  `/api/ai-studio/templates/${encodeURIComponent(assetId)}/${action}`;
const versionPost = (assetId: string, action: string, body: object, userId?: string) =>
  authorizedFetch(
    versionPath(assetId, action),
    { method: 'POST', body: JSON.stringify(body) },
    userId,
  ).then((response) => unwrap(response, action));
const versionGet = (assetId: string, action: string, brandId: string) =>
  authorizedFetch(`${versionPath(assetId, action)}?${new URLSearchParams({ brandId })}`).then(
    (response) => unwrap(response, action),
  );

export async function branchTemplateVersion(
  assetId: string,
  body: TemplateVersionBranchRequest,
  userId?: string,
) {
  return templateVersionResultSchema.parse(
    await versionPost(assetId, 'branches', templateVersionBranchRequestSchema.parse(body), userId),
  );
}
export async function diffTemplateVersions(assetId: string, body: TemplateVersionDiffRequest) {
  return templateVersionDiffResponseSchema.parse(
    await versionPost(assetId, 'diff', templateVersionDiffRequestSchema.parse(body)),
  );
}
export async function previewTemplateMerge(
  assetId: string,
  body: TemplateVersionMergePreviewRequest,
) {
  return templateVersionMergePreviewSchema.parse(
    await versionPost(
      assetId,
      'merges/preview',
      templateVersionMergePreviewRequestSchema.parse(body),
    ),
  );
}
export async function commitTemplateMerge(
  assetId: string,
  body: TemplateVersionMergeCommitRequest,
  userId?: string,
) {
  return templateVersionResultSchema.parse(
    await versionPost(
      assetId,
      'merges',
      templateVersionMergeCommitRequestSchema.parse(body),
      userId,
    ),
  );
}
export async function revertTemplateVersion(
  assetId: string,
  body: TemplateVersionRevertRequest,
  userId?: string,
) {
  return templateVersionResultSchema.parse(
    await versionPost(assetId, 'reverts', templateVersionRevertRequestSchema.parse(body), userId),
  );
}
export async function fetchTemplateVersionCapabilities(brandId: string, assetId: string) {
  return templateVersionCapabilitiesSchema.parse(
    await versionGet(assetId, 'capabilities', brandId),
  );
}
export async function fetchTemplateVersionCommits(brandId: string, assetId: string) {
  return templateVersionCommitsResponseSchema.parse(await versionGet(assetId, 'commits', brandId));
}
export async function fetchTemplateVersionHistory(
  brandId: string,
  assetId: string,
  options: Partial<Omit<TemplateVersionHistoryQuery, 'brandId'>> = {},
  expectedUserId?: string,
  signal?: AbortSignal,
) {
  const input = templateVersionHistoryQuerySchema.parse({ ...options, brandId });
  const query = new URLSearchParams(Object.entries(input).map(([key, value]) => [key, String(value)]));
  const page = templateVersionHistoryResponseSchema.parse(await unwrap(
    await authorizedFetch(`${versionPath(assetId, 'history')}?${query}`, { signal }, expectedUserId), 'Operation history'));
  if (expectedUserId && (await fetchTemplateAuthoringUserId()) !== expectedUserId)
    throw new Error('This operation history belongs to another signed-in account.');
  return page;
}
export async function fetchTemplateReleases(brandId: string, assetId: string) {
  const input = templateReleaseListQuerySchema.parse({ brandId, includeTargets: true });
  const query = new URLSearchParams(Object.entries(input).map(([key, value]) => [key, String(value)]));
  return templateReleaseListResponseSchema.parse(await unwrap(
    await authorizedFetch(`${versionPath(assetId, 'releases')}?${query}`), 'Template releases'));
}
export async function promoteTemplateRelease(
  assetId: string,
  body: TemplateReleaseRequest,
  userId?: string,
) {
  return templateReleaseResultSchema.parse(
    await versionPost(assetId, 'releases', templateReleaseRequestSchema.parse(body), userId),
  );
}
export async function rollbackTemplateRelease(
  assetId: string,
  body: TemplateReleaseRollbackRequest,
  userId?: string,
) {
  return templateReleaseResultSchema.parse(
    await versionPost(
      assetId,
      'releases/rollback',
      templateReleaseRollbackRequestSchema.parse(body),
      userId,
    ),
  );
}


/** The brand's templates a page at a time, newest first, until the list runs out. */
export async function* streamTemplateSources(
  brandId: string,
  pageSize = 24,
): AsyncGenerator<TemplateSourceSummary[]> {
  let cursor: string | null = null;
  do {
    const params = new URLSearchParams({
      brandId,
      limit: String(pageSize),
      ...(cursor ? { cursor } : {}),
    });
    const page = templateSourceListResponseSchema.parse(
      await unwrap(await authorizedFetch(`/api/ai-studio/templates?${params}`), 'Template list'),
    );
    yield page.items;
    cursor = page.nextCursor;
  } while (cursor);
}

/** Every template at once, for callers that need the whole list before they can use any of it. */
export async function fetchTemplateSources(brandId: string): Promise<TemplateSourceSummary[]> {
  const sources: TemplateSourceSummary[] = [];
  for await (const page of streamTemplateSources(brandId, 100)) sources.push(...page);
  return sources;
}

export async function fetchTemplateForgeBundle(
  brandId: string,
  assetId: string,
): Promise<TemplateForgeBundle | null> {
  const response = await authorizedFetch(
    `/api/ai-studio/templates/${encodeURIComponent(assetId)}/bundle?brandId=${encodeURIComponent(brandId)}`,
  );
  const body = await unwrap<{ bundle: unknown }>(response, 'Template bundle');
  return body.bundle == null ? null : templateForgeBundleSchema.parse(body.bundle);
}

export async function advanceTemplateForgeBundle(
  brandId: string,
  assetId: string,
  action: 'smoke' | 'promotion-plan' | 'approve' | 'resume',
  options: { confirmation?: string; runId?: string } = {},
): Promise<TemplateForgeBundle> {
  const path =
    action === 'resume'
      ? `/api/ai-studio/templates/${encodeURIComponent(assetId)}/bundle/children/${encodeURIComponent(options.runId ?? '')}/resume`
      : `/api/ai-studio/templates/${encodeURIComponent(assetId)}/bundle/${action}`;
  const response = await authorizedFetch(path, {
    method: 'POST',
    body: JSON.stringify({ brandId, confirmation: options.confirmation }),
  });
  const body = await unwrap<{ bundle: unknown }>(response, 'Template bundle action');
  return templateForgeBundleSchema.parse(body.bundle);
}

/** Rename a template: writes its Library asset's title, which becomes `displayName` everywhere. */
export async function renameTemplateSource(
  brandId: string,
  assetId: string,
  title: string,
): Promise<TemplateSource> {
  const body: RenameTemplateSourceRequest = { brandId, title };
  const response = await authorizedFetch(
    `/api/ai-studio/templates/${encodeURIComponent(assetId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  );
  return templateSourceSchema.parse(await unwrap(response, 'Template rename'));
}

export async function previewTemplateRebind(input: {
  brandId: string;
  assetId: string;
  versionId: string;
  expectedVersionId: string;
}): Promise<TemplateRebindPreview> {
  const response = await authorizedFetch(
    `/api/ai-studio/templates/${encodeURIComponent(input.assetId)}/rebind/preview`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return templateRebindPreviewSchema.parse(await unwrap(response, 'Source revision preview'));
}

export async function confirmTemplateRebind(input: {
  brandId: string;
  assetId: string;
  versionId: string;
  expectedVersionId: string;
  expectedChecksum: string;
  acceptMissing: boolean;
}): Promise<TemplateRebindPreview> {
  const response = await authorizedFetch(
    `/api/ai-studio/templates/${encodeURIComponent(input.assetId)}/rebind/confirm`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return templateRebindPreviewSchema.parse(await unwrap(response, 'Source revision update'));
}

export async function fetchTemplateFonts(
  brandId: string,
  assetId: string,
): Promise<TemplateFontReadiness> {
  const response = await authorizedFetch(
    `/api/ai-studio/templates/${encodeURIComponent(assetId)}/fonts?brandId=${encodeURIComponent(brandId)}`,
  );
  return templateFontReadinessSchema.parse(await unwrap(response, 'Template font check'));
}

export async function fetchTemplateFontCandidates(
  brandId: string,
  assetId: string,
): Promise<TemplateFontCandidatesResponse> {
  const response = await authorizedFetch(
    `/api/ai-studio/templates/${encodeURIComponent(assetId)}/fonts/candidates?brandId=${encodeURIComponent(brandId)}`,
  );
  return templateFontCandidatesResponseSchema.parse(
    await unwrap(response, 'Template font candidates'),
  );
}

/** Accept a held face for one the template asks for, or clear that decision with `fontId: null`. */
export async function setTemplateFontAlias(
  brandId: string,
  assetId: string,
  input: TemplateFontAliasRequest,
): Promise<TemplateFontReadiness> {
  const body = templateFontAliasRequestSchema.parse(input);
  const response = await authorizedFetch(
    `/api/ai-studio/templates/${encodeURIComponent(assetId)}/fonts/alias?brandId=${encodeURIComponent(brandId)}`,
    { method: 'POST', body: JSON.stringify(body) },
  );
  return templateFontReadinessSchema.parse(await unwrap(response, 'Template font substitution'));
}

export async function pushTemplateFonts(
  brandId: string,
  assetId: string,
  fire: boolean,
  families: string[],
): Promise<TemplateFontPushResponse> {
  const body = templateFontPushRequestSchema.parse({ families, fire });
  const response = await authorizedFetch(
    `/api/ai-studio/templates/${encodeURIComponent(assetId)}/fonts/push?brandId=${encodeURIComponent(brandId)}`,
    { method: 'POST', body: JSON.stringify(body) },
  );
  return templateFontPushResponseSchema.parse(await unwrap(response, 'Template font install'));
}

/** The workspaces this brand may build in. More than one is a supported, live shape. */
export async function fetchRenderWorkspaces(brandId: string): Promise<RenderWorkspace[]> {
  const response = await authorizedFetch(
    `/api/ai-studio/templates/workspaces?brandId=${encodeURIComponent(brandId)}`,
  );
  return (await unwrap<{ items: RenderWorkspace[] }>(response, 'Render workspaces')).items;
}

/**
 * What is already in the workspace, and what the brand may do about it.
 *
 * Not the same list as `fetchTemplateSources`: that one is the Library's uploads, this one is the
 * workspace's contents — which is where templates made before the forge, or by an operator
 * directly in NocoBase, actually live.
 */
export async function discoverWorkspaceTemplates(
  brandId: string,
  workspaceId?: string,
): Promise<WorkspaceTemplateDiscoveryResponse> {
  const params = new URLSearchParams({ brandId });
  if (workspaceId) params.set('workspaceId', workspaceId);
  const response = await authorizedFetch(`/api/ai-studio/templates/discover?${params}`);
  return workspaceTemplateDiscoveryResponseSchema.parse(
    await unwrap<unknown>(response, 'Workspace templates'),
  );
}

/** Adopt a template that is already there, or put it back. */
export async function setTemplateAdoption(input: {
  brandId: string;
  templateKey: string;
  enabled: boolean;
  workspaceId?: string;
}): Promise<{ granted: boolean; reason?: string }> {
  const response = await authorizedFetch('/api/ai-studio/templates/adopt', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return unwrap<{ granted: boolean; reason?: string }>(response, 'Adopt template');
}

export async function sendTemplateToForge(
  brandId: string,
  assetId: string,
  // Asked for, never inferred: the forge names this template's render table after it, capped at
  // 40 characters and never truncated, so a filename is not a safe default.
  templateName: string,
): Promise<TemplateSource> {
  // No workspace: a build always lands in the brand's own space in the shared sub-app, which the
  // Backend provisions on first use. Operator tools still choose; the product does not.
  const response = await authorizedFetch(`/api/ai-studio/templates/${assetId}/forge`, {
    method: 'POST',
    body: JSON.stringify({ brandId, templateName }),
  });
  return unwrap<TemplateSource>(response, 'Template Forge hand-off');
}

/**
 * A Photoshop file already in the Library → an editable template beside it. Takes seconds: the
 * Backend reads every layer and the forge writes the project. `exists` when this exact version was
 * imported before — the call is idempotent, so a double drop makes one template.
 */
export async function importDesignTemplate(
  brandId: string,
  assetId: string,
): Promise<DesignImportResponse> {
  const body: DesignImportRequest = { brandId };
  const response = await authorizedFetch(
    `/api/ai-studio/templates/${encodeURIComponent(assetId)}/import-design`,
    { method: 'POST', body: JSON.stringify(body) },
  );
  return designImportResponseSchema.parse(await unwrap(response, 'Design import'));
}

export async function uploadBrandFont(input: {
  brandId: string;
  family: string;
  file: File;
  weight?: number;
  style?: 'normal' | 'italic';
}): Promise<{ family: string; format: string; bytes: number }> {
  // Base64 in JSON, not multipart: the backend registers no multipart parser, and a font is
  // small enough that the encoding overhead is cheaper than adding one. Chunked so a large
  // face cannot blow the argument limit of String.fromCharCode.
  const buffer = new Uint8Array(await input.file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < buffer.length; i += 0x8000) {
    binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
  }
  const response = await authorizedFetch('/brand-knowledge/fonts', {
    method: 'POST',
    body: JSON.stringify({
      brand_id: input.brandId,
      family: input.family,
      base64: btoa(binary),
      ...(input.weight === undefined ? {} : { weight: input.weight }),
      ...(input.style === undefined ? {} : { style: input.style }),
    }),
  });
  return unwrap(response, 'Font upload');
}

/**
 * Store font files a person handed Forge, each under the PostScript name its file carries.
 *
 * Package fonts arrive with hashed filenames, and a template asks for `PlusJakartaSans-Bold`,
 * so a family guessed from the filename can never match. The PostScript name is also unique per
 * face, which keeps two weights of one family from overwriting each other in the store.
 */
export async function uploadTemplateFontFiles(
  brandId: string,
  files: readonly File[],
): Promise<{ stored: string[]; refused: string[] }> {
  const stored: string[] = [];
  const refused: string[] = [];
  for (const file of files) {
    const names = readFontNames(await file.arrayBuffer());
    if (!names?.postScriptName) {
      refused.push(`${file.name} (not a TrueType or OpenType font)`);
      continue;
    }
    try {
      await uploadBrandFont({
        brandId,
        family: names.postScriptName,
        file,
        ...(/italic|oblique/i.test(names.subfamily ?? '') ? { style: 'italic' as const } : {}),
      });
      stored.push(names.postScriptName);
    } catch (error) {
      refused.push(`${file.name} (${error instanceof Error ? error.message : 'upload failed'})`);
    }
  }
  return { stored, refused };
}

/** Look for this template's missing faces in its package, then on Google Fonts. */
export async function healTemplateFonts(
  brandId: string,
  assetId: string,
): Promise<TemplateFontHealResult> {
  const response = await authorizedFetch(
    `/api/ai-studio/templates/${encodeURIComponent(assetId)}/fonts/heal?brandId=${encodeURIComponent(brandId)}`,
    { method: 'POST' },
  );
  return templateFontHealResultSchema.parse(await unwrap(response, 'Font repair'));
}

/** What happened to this template on its way in, newest first. */
export async function fetchTemplateEvents(
  brandId: string,
  assetId: string,
): Promise<TemplateSourceEvent[]> {
  const response = await authorizedFetch(
    `/api/ai-studio/templates/${encodeURIComponent(assetId)}/events?brandId=${encodeURIComponent(brandId)}`,
  );
  return templateSourceEventsResponseSchema.parse(await unwrap(response, 'Template activity'))
    .events;
}

export type BrandFontSummary = {
  family: string;
  weight: number | null;
  style: string;
  format: string;
  bytes: number;
  updated_at?: string;
};

export async function fetchBrandFonts(brandId: string): Promise<BrandFontSummary[]> {
  const response = await authorizedFetch(
    `/brand-knowledge/design-system?brand_id=${encodeURIComponent(brandId)}`,
  );
  const body = await unwrap<{ fonts_in_store?: BrandFontSummary[] }>(response, 'Font list');
  return body.fonts_in_store ?? [];
}

// ── Forge: the run, and the variables ────────────────────────────────────────────────────────

/** An `ApiRenderVariable` as the Library editor sees it: the parse, with the brand's edits on top. */
export type TemplateVariable = {
  key: string;
  label: string;
  kind: string;
  required: boolean;
  multiple: boolean;
  accept: string[];
  options: string[];
  description: string | null;
  reserved: boolean;
  role: string | null;
  roleSource: 'human' | null;
  charBudget: number | null;
  comps: string[];
  sample: string | null;
  placement: null;
  /** A video slot's clip seconds — see `apiRenderVariableSchema.clip`. Null for anything else. */
  clip: { fromSec: number; toSec: number; playsSec: number } | null;
  /** False: in the template but switched off — no form asks for it; renders what the file says. */
  exposed?: boolean;
};

export type TemplateSlotEdit = {
  slotKey: string;
  publicName?: string | null;
  role?: string | null;
  charBudget?: number | null;
  required?: boolean | null;
  exposed?: boolean | null;
  defaultValue?: unknown;
  binding?: { source: string; path: string; label?: string; line?: number } | null;
};

export type TemplateVariablesResponse = {
  variables: TemplateVariable[];
  edits: Array<TemplateSlotEdit & { assetId: string; kind: string; updatedAt: string }>;
  /**
   * `pending` and an empty variable list mean "we have not opened the file yet", which is a very
   * different message from "this template has no knobs". Without this they are identical.
   */
  parseState: string;
};

export async function fetchTemplateVariables(
  brandId: string,
  assetId: string,
): Promise<TemplateVariablesResponse> {
  const response = await authorizedFetch(
    `/api/ai-studio/templates/${assetId}/variables?brandId=${encodeURIComponent(brandId)}`,
  );
  return unwrap<TemplateVariablesResponse>(response, 'Template variables');
}

export async function saveTemplateVariables(
  brandId: string,
  assetId: string,
  slots: TemplateSlotEdit[],
): Promise<void> {
  const response = await authorizedFetch(`/api/ai-studio/templates/${assetId}/variables`, {
    method: 'PUT',
    body: JSON.stringify({ brandId, slots }),
  });
  await unwrap(response, 'Saving variables');
}

/** The render fields of one published template a person marked as colours. */
export async function fetchTemplateColourFields(
  brandId: string,
  assetId: string,
  templateKey: string,
): Promise<TemplateColourFields> {
  const response = await authorizedFetch(
    `/api/ai-studio/templates/${assetId}/colour-fields?brandId=${encodeURIComponent(brandId)}&templateKey=${encodeURIComponent(templateKey)}`,
  );
  return templateColourFieldsSchema.parse(await unwrap(response, 'Colour fields'));
}

/** Replaces the set: the keys sent are the template's marked colours afterwards. */
export async function saveTemplateColourFields(
  brandId: string,
  assetId: string,
  fields: TemplateColourFields,
): Promise<TemplateColourFields> {
  const response = await authorizedFetch(`/api/ai-studio/templates/${assetId}/colour-fields`, {
    method: 'PUT',
    body: JSON.stringify({ brandId, ...fields }),
  });
  return templateColourFieldsSchema.parse(await unwrap(response, 'Saving colour fields'));
}

/** Every layer a design-import template's source file stacks, and the arrangements saved on it. */
/** A design import's own stack and arrangements; null for a template not imported from a design. */
export async function fetchDesignLayers(
  brandId: string,
  assetId: string,
): Promise<DesignLayersResponse | null> {
  const response = await authorizedFetch(
    `/api/ai-studio/templates/${assetId}/design-layers?brandId=${encodeURIComponent(brandId)}`,
  );
  if (response.status === 422) {
    const body = (await response
      .clone()
      .json()
      .catch(() => ({}))) as { error?: string };
    if (body.error === 'not_a_design_import') return null;
  }
  return designLayersResponseSchema.parse(await unwrap(response, 'Layers'));
}

/**
 * The whole approved set. On the golden import it lands as a new variant named `name`; on an
 * arrangement variant `this_variant` writes that variant's next revision.
 */
export async function saveDesignArrangements(
  brandId: string,
  assetId: string,
  save: {
    arrangements: DesignArrangement[];
    saveTo: 'new_variant' | 'this_variant';
    name?: string;
  },
): Promise<DesignArrangementsResponse> {
  const response = await authorizedFetch(
    `/api/ai-studio/templates/${assetId}/design-arrangements`,
    { method: 'PUT', body: JSON.stringify({ brandId, ...save }) },
  );
  return designArrangementsResponseSchema.parse(await unwrap(response, 'Saving arrangements'));
}

/** The mirrored run row. The LIVE channel is Realtime; this is the mount backfill beside it. */
export type TemplateRunRow = {
  run_id: string;
  state: string;
  done: boolean;
  ok: boolean | null;
  progress: {
    total: number | null;
    done: number;
    pct: number | null;
    phase: string | null;
    detail: string | null;
    phases: Array<{ name: string; total: number | null; done: number }>;
  } | null;
  findings: Array<{ code: string; what?: string; why?: string; resolver?: string | null }>;
  // The contract's own shape, not a second hand-written one: `kind` is what tells a slot
  // nothing could bind apart from a media variable waiting for its picture, and a local
  // mirror that drifts from it is how the UI ends up calling the second one broken.
  needs: TemplateForgeNeed[];
  error: { code: string; message?: string } | null;
  root_table: string | null;
  application: string | null;
};

export async function fetchTemplateRun(
  brandId: string,
  assetId: string,
): Promise<TemplateRunRow | null> {
  const response = await authorizedFetch(
    `/api/ai-studio/templates/${assetId}/run?brandId=${encodeURIComponent(brandId)}`,
  );
  const body = await unwrap<{ run: TemplateRunRow | null }>(response, 'Template run');
  return body.run;
}

export async function fetchTemplateMappingReview(
  brandId: string,
  assetId: string,
): Promise<TemplateMappingReview> {
  const response = await authorizedFetch(
    `/api/ai-studio/templates/${assetId}/mapping-review?brandId=${encodeURIComponent(brandId)}`,
  );
  return templateMappingReviewSchema.parse(await unwrap<unknown>(response, 'Template mapping'));
}

export type ForgeLadderAction = 'decisions' | 'draft' | 'smoke' | 'promote' | 'resume';

/**
 * Move a parked run one rung on.
 *
 * The forge advances itself to `draft_ready` and stops, because everything past there writes into
 * a live workspace or spends a render.
 */
export async function advanceTemplateForgeRun(
  brandId: string,
  assetId: string,
  action: ForgeLadderAction,
  extra?: { decisions?: unknown; taskUID?: string },
): Promise<void> {
  const response = await authorizedFetch(`/api/ai-studio/templates/${assetId}/forge/${action}`, {
    method: 'POST',
    body: JSON.stringify({ brandId, ...(extra ?? {}) }),
  });
  await unwrap(response, `Forge ${action}`);
}

export async function fetchTemplateVariants(
  brandId: string,
  assetId?: string,
): Promise<TemplateVariant[]> {
  const params = new URLSearchParams({ brandId, ...(assetId ? { assetId } : {}) });
  const response = await authorizedFetch(`/api/ai-studio/template-variants?${params}`);
  return templateVariantsResponseSchema.parse(await unwrap(response, 'Template variants')).items;
}

export async function fetchTemplateAuthoringUserId(): Promise<string> {
  const { data } = await createSupabaseBrowserClient().auth.getSession();
  if (!data.session?.user.id) throw new Error('A signed-in session is required');
  return data.session.user.id;
}

export async function openTemplateAuthoringWorkingCopy(
  templateId: string,
  input: TemplateAuthoringWorkingCopyOpenRequest,
  expectedUserId: string,
): Promise<TemplateAuthoringWorkingCopy> {
  const request = templateAuthoringWorkingCopyOpenRequestSchema.parse(input);
  const response = await authorizedFetch(`/api/ai-studio/templates/${encodeURIComponent(templateId)}/authoring-working-copies`,
    { method: 'POST', body: JSON.stringify(request) }, expectedUserId);
  const copy = templateAuthoringWorkingCopySchema.parse(await unwrap(response, 'Private working copy'));
  if (copy.brandId !== request.brandId || copy.templateId !== templateId || copy.variantId !== request.variantId ||
      copy.principalId !== expectedUserId || copy.closedAt ||
      (request.workingCopyId && (copy.id !== request.workingCopyId || copy.baseRevisionId !== request.baseRevisionId)))
    throw new Error('The server returned a different private working copy. The current draft is preserved.');
  return copy;
}

export async function listTemplateAuthoringWorkingCopies(
  templateId: string,
  brandId: string,
  variantId: string,
  expectedUserId: string,
): Promise<TemplateAuthoringWorkingCopy[]> {
  const query = new URLSearchParams({ brandId, variantId });
  const response = await authorizedFetch(`/api/ai-studio/templates/${encodeURIComponent(templateId)}/authoring-working-copies?${query}`, undefined, expectedUserId);
  const copies = templateAuthoringWorkingCopyListSchema.parse(await unwrap(response, 'Private working copies')).items;
  if (copies.some((copy) => copy.principalId !== expectedUserId || copy.brandId !== brandId || copy.templateId !== templateId || copy.variantId !== variantId))
    throw new Error('The private working-copy list did not match this account and variant.');
  return copies;
}

export async function fetchTemplateAuthoringWorkingCopy(
  templateId: string,
  brandId: string,
  workingCopyId: string,
  expectedUserId: string,
): Promise<TemplateAuthoringWorkingCopy> {
  const response = await authorizedFetch(`/api/ai-studio/templates/${encodeURIComponent(templateId)}/authoring-working-copies/${encodeURIComponent(workingCopyId)}?${new URLSearchParams({ brandId })}`,
    undefined, expectedUserId);
  const copy = templateAuthoringWorkingCopySchema.parse(await unwrap(response, 'Private working copy'));
  if (copy.id !== workingCopyId || copy.brandId !== brandId || copy.templateId !== templateId || copy.principalId !== expectedUserId)
    throw new Error('This private working copy belongs to another context.');
  return copy;
}

export async function fetchTemplateAuthoringDocument(
  assetId: string,
  brandId: string,
  baseVersionId: string,
  workingCopyId?: string,
): Promise<TemplateAuthoringDocument> {
  const query = new URLSearchParams(authoringScopeQuery({ brandId, baseVersionId, workingCopyId }));
  const response = await authorizedFetch(
    `/api/ai-studio/templates/${encodeURIComponent(assetId)}/authoring-document?${query}`,
  );
  const result = (await unwrap(response, 'Authoring source')) as { document: unknown };
  return templateAuthoringDocumentSchema.parse(result.document);
}

export async function fetchTemplateAuthoringWorkspacePreview(
  assetId: string,
  scope: TemplateAuthoringScopeQuery,
  expectedRevision: number,
  compId?: number,
): Promise<TemplateAuthoringWorkspacePreviewResponse> {
  const query = new URLSearchParams({
    ...authoringScopeQuery(scope),
    expectedRevision: String(expectedRevision),
    ...(compId ? { compId: String(compId) } : {}),
  });
  const response = await authorizedFetch(
    `/api/ai-studio/templates/${encodeURIComponent(assetId)}/authoring-workspace-preview?${query}`,
  );
  return templateAuthoringWorkspacePreviewResponseSchema.parse(
    await unwrap(response, 'Private workspace preview'),
  );
}

export async function fetchTemplateAuthoringFontPreview(
  assetId: string,
  scope: TemplateAuthoringScopeQuery,
  font:
    | { fontId: string; postScriptName: string; sha256: string }
    | { kind: 'workspace_package'; packageChecksum: string; postScriptName: string; sha256: string },
  workspaceSeed?: { seedArtifactId: string; seedPackageChecksum: string; expectedRevision: number },
): Promise<{ bytes: ArrayBuffer; contentType: string; sha256: string }> {
  const packageFont = 'kind' in font;
  if (packageFont && (!workspaceSeed || font.packageChecksum.toLowerCase() !== workspaceSeed.seedPackageChecksum.toLowerCase()))
    throw new Error('The package font does not match the attached private workspace seed.');
  const query = new URLSearchParams({
    ...authoringScopeQuery(scope),
    postScriptName: font.postScriptName,
    sha256: font.sha256,
    ...('fontId' in font ? { fontId: font.fontId } : { kind: font.kind }),
    ...(workspaceSeed ? {
      seedArtifactId: workspaceSeed.seedArtifactId,
      seedPackageChecksum: workspaceSeed.seedPackageChecksum,
      expectedRevision: String(workspaceSeed.expectedRevision),
    } : {}),
  });
  const response = await authorizedFetch(
    `/api/ai-studio/templates/${encodeURIComponent(assetId)}/authoring-font-preview?${query}`,
  );
  return verifyTemplateAuthoringFontResponse(
    response,
    font.sha256,
    packageFont && workspaceSeed
      ? { postScriptName: font.postScriptName, ...workspaceSeed }
      : undefined,
  );
}

export async function fetchTemplateAuthoringDraft(
  assetId: string,
  brandId: string,
  baseVersionId: string,
  workingCopyId?: string,
): Promise<TemplateAuthoringDraft | null> {
  const query = new URLSearchParams(authoringScopeQuery({ brandId, baseVersionId, workingCopyId }));
  const response = await authorizedFetch(
    `/api/ai-studio/templates/${encodeURIComponent(assetId)}/authoring-draft?${query}`,
  );
  const result = (await unwrap(response, 'Private draft')) as {
    draft: TemplateAuthoringDraft | null;
  };
  return result.draft === null ? null : templateAuthoringDraftSchema.parse(result.draft);
}

export async function putTemplateAuthoringDraft(
  assetId: string,
  request: TemplateAuthoringDraftPut,
  expectedUserId?: string,
): Promise<TemplateAuthoringDraft> {
  const response = await authorizedFetch(
    `/api/ai-studio/templates/${encodeURIComponent(assetId)}/authoring-draft`,
    { method: 'PUT', body: JSON.stringify(request) }, expectedUserId,
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const code = typeof body.error === 'string' ? body.error : `http_${response.status}`;
    throw new TemplateAuthoringDraftError(
      response.status,
      code,
      typeof body.detail === 'string'
        ? body.detail
        : `Private draft save failed (${response.status})`,
      body,
    );
  }
  const result = (await response.json()) as { draft: TemplateAuthoringDraft };
  return templateAuthoringDraftSchema.parse(result.draft);
}

export async function compileTemplateAuthoring(
  assetId: string,
  request: TemplateAuthoringCompileRequest,
): Promise<TemplateAuthoringArtifact> {
  const body = templateAuthoringCompileRequestSchema.parse(request);
  const response = await authorizedFetch(
    `/api/ai-studio/templates/${encodeURIComponent(assetId)}/authoring-compile`,
    { method: 'POST', body: JSON.stringify(body) },
  );
  const result = (await unwrap(response, 'Prepare private package')) as { artifact: unknown };
  return templateAuthoringArtifactSchema.parse(result.artifact);
}

export async function fetchTemplateAuthoringArtifact(
  assetId: string,
  artifactId: string,
  scope: TemplateAuthoringScopeQuery,
): Promise<TemplateAuthoringArtifact> {
  const query = new URLSearchParams(authoringScopeQuery(scope));
  const response = await authorizedFetch(
    `/api/ai-studio/templates/${encodeURIComponent(assetId)}/authoring-artifacts/${encodeURIComponent(artifactId)}?${query}`,
  );
  const result = (await unwrap(response, 'Private package')) as { artifact: unknown };
  return templateAuthoringArtifactSchema.parse(result.artifact);
}

export async function fetchTemplateAuthoringArtifactPackage(
  assetId: string,
  artifact: TemplateAuthoringArtifact,
  scope: TemplateAuthoringScopeQuery,
): Promise<Blob> {
  const query = new URLSearchParams(authoringScopeQuery(scope));
  const response = await authorizedFetch(
    `/api/ai-studio/templates/${encodeURIComponent(assetId)}/authoring-artifacts/${encodeURIComponent(artifact.artifactId)}/package?${query}`,
  );
  return verifyTemplateAuthoringPackageResponse(response, artifact);
}

export async function prepareTemplateAuthoringArtifact(
  assetId: string,
  artifactId: string,
  scope: TemplateAuthoringScopeQuery,
  request: TemplateAuthoringPreparationRequest,
): Promise<TemplateAuthoringPreparation> {
  const body = templateAuthoringPreparationRequestSchema.parse(withAuthoringWorkingCopy(scope, request));
  const query = new URLSearchParams(authoringScopeQuery(scope));
  const response = await authorizedFetch(
    `/api/ai-studio/templates/${encodeURIComponent(assetId)}/authoring-artifacts/${encodeURIComponent(artifactId)}/prepare?${query}`,
    { method: 'POST', body: JSON.stringify(body) },
  );
  const result = (await unwrap(response, 'Prepare private package')) as { preparation: unknown };
  return templateAuthoringPreparationSchema.parse(result.preparation);
}

export async function fetchTemplateAuthoringPreparation(
  assetId: string,
  artifactId: string,
  scope: TemplateAuthoringScopeQuery,
): Promise<TemplateAuthoringPreparation> {
  const query = new URLSearchParams(authoringScopeQuery(scope));
  const response = await authorizedFetch(
    `/api/ai-studio/templates/${encodeURIComponent(assetId)}/authoring-artifacts/${encodeURIComponent(artifactId)}/preparation?${query}`,
  );
  const result = (await unwrap(response, 'Private package preparation')) as { preparation: unknown };
  return templateAuthoringPreparationSchema.parse(result.preparation);
}

export async function requestTemplateAuthoringNativeRender(
  assetId: string,
  artifactId: string,
  scope: TemplateAuthoringScopeQuery,
  request: TemplateAuthoringNativeRenderRequest,
): Promise<TemplateAuthoringNativeRender> {
  const body = templateAuthoringNativeRenderRequestSchema.parse(withAuthoringWorkingCopy(scope, request));
  const query = new URLSearchParams(authoringScopeQuery(scope));
  const response = await authorizedFetch(
    `/api/ai-studio/templates/${encodeURIComponent(assetId)}/authoring-artifacts/${encodeURIComponent(artifactId)}/native-renders?${query}`,
    { method: 'POST', body: JSON.stringify(body) },
  );
  const result = (await unwrap(response, 'Native sample render')) as { render: unknown };
  return templateAuthoringNativeRenderSchema.parse(result.render);
}

export async function fetchTemplateAuthoringNativeRender(
  assetId: string,
  artifactId: string,
  renderId: string,
  scope: TemplateAuthoringScopeQuery,
): Promise<TemplateAuthoringNativeRender> {
  const query = new URLSearchParams(authoringScopeQuery(scope));
  const response = await authorizedFetch(
    `/api/ai-studio/templates/${encodeURIComponent(assetId)}/authoring-artifacts/${encodeURIComponent(artifactId)}/native-renders/${encodeURIComponent(renderId)}?${query}`,
  );
  const result = (await unwrap(response, 'Native sample render')) as { render: unknown };
  return templateAuthoringNativeRenderSchema.parse(result.render);
}

export async function fetchTemplateAuthoringNativeRenderFrame(
  assetId: string,
  artifactId: string,
  renderId: string,
  frameId: string,
  scope: TemplateAuthoringScopeQuery,
): Promise<{ blob: Blob; sha256: string; stale: boolean }> {
  const query = new URLSearchParams(authoringScopeQuery(scope));
  const response = await authorizedFetch(
    `/api/ai-studio/templates/${encodeURIComponent(assetId)}/authoring-artifacts/${encodeURIComponent(artifactId)}/native-renders/${encodeURIComponent(renderId)}/frames/${encodeURIComponent(frameId)}?${query}`,
  );
  if (!response.ok) await unwrap(response, 'Native sample frame');
  const sha256 = response.headers.get('x-content-sha256');
  if (!sha256 || !/^[a-f0-9]{64}$/i.test(sha256))
    throw new Error('Native sample frame did not include a verified checksum.');
  const stale = response.headers.get('x-authoring-stale') === 'true';
  if (stale) throw new Error('This native sample belongs to an older private draft.');
  const blob = await response.blob();
  const bytes = await blob.arrayBuffer();
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const actual = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  if (actual !== sha256.toLowerCase()) throw new Error('Native sample checksum verification failed.');
  return { blob, sha256: actual, stale };
}

export async function reviewTemplateAuthoringArtifact(
  assetId: string,
  artifactId: string,
  scope: TemplateAuthoringScopeQuery,
  request: TemplateAuthoringArtifactReview,
): Promise<TemplateAuthoringArtifact> {
  const body = templateAuthoringArtifactReviewSchema.parse(withAuthoringWorkingCopy(scope, request));
  const query = new URLSearchParams(authoringScopeQuery(scope));
  const response = await authorizedFetch(
    `/api/ai-studio/templates/${encodeURIComponent(assetId)}/authoring-artifacts/${encodeURIComponent(artifactId)}/review?${query}`,
    { method: 'POST', body: JSON.stringify(body) },
  );
  const result = (await unwrap(response, 'Review private package')) as { artifact: unknown };
  return templateAuthoringArtifactSchema.parse(result.artifact);
}

export async function commitTemplateAuthoringArtifact(
  assetId: string,
  artifactId: string,
  scope: TemplateAuthoringScopeQuery,
  request: TemplateAuthoringArtifactCommit,
): Promise<TemplateAuthoringArtifact> {
  const body = templateAuthoringArtifactCommitSchema.parse(withAuthoringWorkingCopy(scope, request));
  const query = new URLSearchParams(authoringScopeQuery(scope));
  const response = await authorizedFetch(
    `/api/ai-studio/templates/${encodeURIComponent(assetId)}/authoring-artifacts/${encodeURIComponent(artifactId)}/commit?${query}`,
    { method: 'POST', body: JSON.stringify(body) },
  );
  const result = (await unwrap(response, 'Save verified package')) as { artifact: unknown };
  return templateAuthoringArtifactSchema.parse(result.artifact);
}

export async function saveTemplateLayerVariant(
  assetId: string,
  request: CreateTemplateVariantRequest,
): Promise<TemplateVariant> {
  const response = await authorizedFetch(
    `/api/ai-studio/templates/${encodeURIComponent(assetId)}/variants`,
    { method: 'POST', body: JSON.stringify(createTemplateVariantRequestSchema.parse(request)) },
  );
  return templateVariantSchema.parse(await unwrap(response, 'Create variant'));
}

export async function createTemplateVariant(
  assetId: string,
  request: CreateTemplateVariantRequest,
): Promise<TemplateVariant> {
  return saveTemplateLayerVariant(assetId, request);
}

/** No workspace is normal for a new brand; discovery is advisory to its upload list. */
export async function loadWorkspaceTemplates(brandId: string) {
  return discoverWorkspaceTemplates(brandId)
    .then((result) => result.items)
    .catch(() => []);
}

export async function fetchTemplateRevisionVariants(
  brandId: string,
  assetId?: string,
  includeArchived = false,
) {
  const query = new URLSearchParams({ brandId, ...(includeArchived ? { includeArchived: 'true' } : {}) });
  const path = assetId
    ? `/api/ai-studio/templates/${encodeURIComponent(assetId)}/revision-variants?${query}`
    : `/api/ai-studio/templates/revision-variants?${query}`;
  return templateRevisionVariantsResponseSchema.parse(
    await unwrap(await authorizedFetch(path), 'Template revision variants'),
  ).items;
}

export async function fetchExactTemplateRevision(brandId: string, assetId: string, revisionId: string) {
  const variants = await fetchTemplateRevisionVariants(brandId, assetId);
  const matches = variants.flatMap((variant) => variant.revisions.filter((revision) => revision.id === revisionId));
  if (matches.length !== 1) throw new Error('The exact saved revision is unavailable. The private working copy is retained.');
  return matches[0]!;
}

export async function previewTemplateRevision(
  assetId: string,
  request: TemplateRevisionPreviewRequest,
) {
  return templateLayerPreviewResponseSchema.parse(
    await unwrap(
      await authorizedFetch(
        `/api/ai-studio/templates/${encodeURIComponent(assetId)}/revisions/preview`,
        { method: 'POST', body: JSON.stringify(request) },
      ),
      'Template revision preview',
    ),
  );
}

export async function previewTemplateLayers(assetId: string, request: TemplateLayerPreviewRequest) {
  return templateLayerPreviewResponseSchema.parse(
    await unwrap(
      await authorizedFetch(`/api/ai-studio/templates/${encodeURIComponent(assetId)}/layer-preview`, {
        method: 'POST',
        body: JSON.stringify(request),
      }),
      'Layer preview',
    ),
  );
}

export async function saveTemplateRevision(assetId: string, request: SaveTemplateRevisionRequest) {
  return templateRevisionSchema.parse(
    await unwrap(
      await authorizedFetch(`/api/ai-studio/templates/${encodeURIComponent(assetId)}/revisions`, {
        method: 'POST',
        body: JSON.stringify(request),
      }),
      'Save template revision',
    ),
  );
}

/**
 * The Layers tab's unedited layer list for one source version (the open revision's file). The
 * Backend stores it per version, so only a first open reaches the forge.
 */
export async function fetchTemplateLayerInventory(
  brandId: string,
  assetId: string,
  versionId: string,
  workingCopyId?: string,
) {
  const query = new URLSearchParams({ brandId, versionId, ...(workingCopyId ? { workingCopyId } : {}) });
  return templateLayerInventorySchema.parse(
    await unwrap(
      await authorizedFetch(
        `/api/ai-studio/templates/${encodeURIComponent(assetId)}/layers?${query}`,
      ),
      'Layers',
    ),
  );
}

/** One comp's unedited layout preview; the template's default comp when none is named. */
export async function fetchTemplateLayerScene(
  brandId: string,
  assetId: string,
  versionId: string,
  compId: number | null,
  workingCopyId?: string,
) {
  const query = new URLSearchParams({
    brandId,
    versionId,
    ...(workingCopyId ? { workingCopyId } : {}),
    ...(compId ? { compId: String(compId) } : {}),
  });
  return templateLayerSceneSchema.parse(
    await unwrap(
      await authorizedFetch(
        `/api/ai-studio/templates/${encodeURIComponent(assetId)}/layer-scene?${query}`,
      ),
      'Layout preview',
    ),
  );
}

export async function archiveTemplateRevisionVariant(
  brandId: string,
  assetId: string,
  variantId: string,
) {
  await unwrap(
    await authorizedFetch(
      `/api/ai-studio/templates/${encodeURIComponent(assetId)}/revision-variants/${encodeURIComponent(variantId)}/archive`,
      { method: 'POST', body: JSON.stringify({ brandId }) },
    ),
    'Archive template variant',
  );
}

/** Success may come with or without a body; only a refusal is read. */
async function variantAction(path: string, init: RequestInit, what: string) {
  const response = await authorizedFetch(path, init);
  if (!response.ok) await unwrap(response, what);
}

export async function unarchiveTemplateRevisionVariant(
  brandId: string,
  assetId: string,
  variantId: string,
) {
  await variantAction(
    `/api/ai-studio/templates/${encodeURIComponent(assetId)}/revision-variants/${encodeURIComponent(variantId)}/unarchive`,
    { method: 'POST', body: JSON.stringify({ brandId }) },
    'Restore template variant',
  );
}

/** The variant each family opens on. Making the Original the default clears the pointer. */
export async function setTemplateVariantDefault(
  brandId: string,
  assetId: string,
  variantId: string,
) {
  await variantAction(
    `/api/ai-studio/templates/${encodeURIComponent(assetId)}/revision-variants/${encodeURIComponent(variantId)}/default`,
    { method: 'PUT', body: JSON.stringify({ brandId }) },
    'Make variant the default',
  );
}

export async function fetchTemplateVariantDefaults(brandId: string) {
  const response = await authorizedFetch(
    `/api/ai-studio/templates/variant-defaults?${new URLSearchParams({ brandId })}`,
  );
  // A Backend that predates defaults has no such route: every family opens on its Original.
  if (response.status === 404) return [];
  return templateVariantDefaultsResponseSchema.parse(
    await unwrap(response, 'Template variant defaults'),
  ).items;
}

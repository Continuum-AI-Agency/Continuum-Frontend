'use client';

// Elements — the Frontend half of the saved-reference feature (Canvas V3, Wave 2).
//
// An Element is a small set of images of ONE subject (a model, a product, a style) kept
// together with ONE canonical reference generated from them. Wired into a generator it
// costs a single reference slot instead of eight, which is the whole reason it exists:
// `gemini-3.1-flash-image` carries 10 object slots and only 4 character slots, so a
// five-image person Element in fallback is already over budget.
//
// The vocabulary, the wire schemas and the EMISSION RULES all come from
// `@continuum/contracts` — `resolveElementRefs` and `buildElementReferenceLabel` are
// shared with the Backend on purpose, because an Element that emits a different ref set
// on each side is exactly the drift that package exists to prevent. This module adds
// only what is Frontend-shaped: the HTTP calls, the query hooks, and signed preview
// URLs (the wire record carries asset IDS, not URLs).

import {
  buildElementReferenceLabel,
  type CreateElementRequest,
  ELEMENT_CATEGORIES,
  ELEMENT_MEMBER_LIMIT,
  ELEMENT_PERSON_FALLBACK_LIMIT,
  type ElementCategory,
  type ElementRecord,
  elementRecordSchema,
  type GenerateElementReferenceResponse,
  generateElementReferenceResponseSchema,
  type ImportElementCatalogRequest,
  type ImportElementCatalogResponse,
  importElementCatalogResponseSchema,
  isElementPersonCategory,
  type LibraryImageRef,
  type ListElementsResponse,
  listElementsResponseSchema,
  resolveElementRefs,
  type UpdateElementRequest,
} from '@continuum/contracts';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { http } from '@/lib/api/http';
import type { ImageReferenceType } from '@/StudioCanvas/types';

export type { ElementCategory, ElementRecord };
export {
  ELEMENT_CATEGORIES,
  ELEMENT_MEMBER_LIMIT,
  ELEMENT_PERSON_FALLBACK_LIMIT,
  isElementPersonCategory,
};

export const ELEMENTS_ROUTE = '/api/media/elements';
export const elementRoute = (elementId: string) =>
  `${ELEMENTS_ROUTE}/${encodeURIComponent(elementId)}`;

const elementResponseSchema = z.object({ element: elementRecordSchema });
type ElementResponse = z.infer<typeof elementResponseSchema>;

export function listElements(brandId: string, signal?: AbortSignal): Promise<ElementRecord[]> {
  return http
    .request<ListElementsResponse>({
      path: `${ELEMENTS_ROUTE}?brandId=${encodeURIComponent(brandId)}`,
      schema: listElementsResponseSchema,
      cache: 'no-store',
      signal,
    })
    .then((response) => response.elements);
}

export function createElement(input: CreateElementRequest): Promise<ElementRecord> {
  return http
    .request<ElementResponse>({
      path: ELEMENTS_ROUTE,
      method: 'POST',
      body: input,
      schema: elementResponseSchema,
      cache: 'no-store',
    })
    .then((response) => response.element);
}

/**
 * Bulk catalog import. ALWAYS 200 when the envelope is valid — the body is a report, not
 * a verdict, so a caller that treats a non-empty `rejected` as a failed request throws
 * away the rows that landed. Read `accepted` and `rejected` together, both by index.
 */
export function importElementCatalog(
  input: ImportElementCatalogRequest,
): Promise<ImportElementCatalogResponse> {
  return http.request<ImportElementCatalogResponse>({
    path: `${ELEMENTS_ROUTE}/catalog`,
    method: 'POST',
    body: input,
    schema: importElementCatalogResponseSchema,
    cache: 'no-store',
  });
}

export function updateElement(
  elementId: string,
  input: UpdateElementRequest,
): Promise<ElementRecord> {
  return http
    .request<ElementResponse>({
      path: elementRoute(elementId),
      method: 'PATCH',
      body: input,
      schema: elementResponseSchema,
      cache: 'no-store',
    })
    .then((response) => response.element);
}

/** ~14s — one paid image call. Always re-derived from the MEMBERS, never from the
 *  previous reference. The result appends to history and only becomes the default when
 *  there wasn't one, so a regeneration never silently changes what nodes point at. */
export function generateElementReference(
  elementId: string,
  brandId: string,
): Promise<GenerateElementReferenceResponse> {
  return http.request<GenerateElementReferenceResponse>({
    path: `${elementRoute(elementId)}/reference`,
    method: 'POST',
    body: { brandId },
    schema: generateElementReferenceResponseSchema,
    cache: 'no-store',
  });
}

/** `assetId: null` clears it, dropping the Element back to emitting its raw members. */
export function setElementDefaultReference(
  elementId: string,
  brandId: string,
  assetId: string | null,
): Promise<ElementRecord> {
  return http
    .request<ElementResponse>({
      path: `${elementRoute(elementId)}/default-reference`,
      method: 'PUT',
      body: { brandId, assetId },
      schema: elementResponseSchema,
      cache: 'no-store',
    })
    .then((response) => response.element);
}

export const elementsQueryKey = (brandId: string | undefined) => ['ai-studio', 'elements', brandId];

export function useElements(brandId: string | undefined) {
  const query = useQuery({
    queryKey: elementsQueryKey(brandId),
    queryFn: ({ signal }) => listElements(brandId as string, signal),
    enabled: Boolean(brandId),
    staleTime: 60_000,
  });

  return {
    elements: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}

/** The writes, sharing one cache invalidation. */
export function useElementMutations(brandId: string | undefined) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: elementsQueryKey(brandId) });

  return {
    create: useMutation({
      mutationFn: (input: Omit<CreateElementRequest, 'brandId'>) =>
        createElement({ ...input, brandId: brandId as string }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (vars: { elementId: string; input: Omit<UpdateElementRequest, 'brandId'> }) =>
        updateElement(vars.elementId, { ...vars.input, brandId: brandId as string }),
      onSuccess: invalidate,
    }),
    generateReference: useMutation({
      mutationFn: (elementId: string) => generateElementReference(elementId, brandId as string),
      onSuccess: invalidate,
    }),
    setDefaultReference: useMutation({
      mutationFn: (vars: { elementId: string; assetId: string | null }) =>
        setElementDefaultReference(vars.elementId, brandId as string, vars.assetId),
      onSuccess: invalidate,
    }),
  };
}

// ─── Previews ────────────────────────────────────────────────────────────────
//
// The wire record carries asset IDS. Signing happens through the same one-asset route
// the canvas already uses for library thumbnails; one query per asset so the panel, the
// detail pane and every node on the canvas share a cache instead of re-signing the same
// reference each render. Signed URLs live an hour — refresh well inside that.

export const signedAssetUrlQueryKey = (brandId: string | undefined, assetId: string) => [
  'library',
  'signed-asset',
  brandId,
  assetId,
];

export async function signLibraryAsset(brandId: string, assetId: string): Promise<string> {
  const response = await fetch('/api/library/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brandId, assetId }),
  });
  if (!response.ok) throw new Error(`Failed to sign asset: ${response.status}`);
  const data = (await response.json()) as { signedUrl?: string };
  if (!data.signedUrl) throw new Error('Failed to sign asset');
  return data.signedUrl;
}

export function useSignedAssetUrls(
  brandId: string | undefined,
  assetIds: readonly string[],
): Record<string, string | undefined> {
  const unique = [...new Set(assetIds)].filter((id) => id.length > 0);
  const results = useQueries({
    queries: unique.map((assetId) => ({
      queryKey: signedAssetUrlQueryKey(brandId, assetId),
      queryFn: () => signLibraryAsset(brandId as string, assetId),
      enabled: Boolean(brandId),
      staleTime: 30 * 60_000,
      retry: false,
    })),
  });

  const urls: Record<string, string | undefined> = {};
  unique.forEach((assetId, index) => {
    urls[assetId] = results[index]?.data;
  });
  return urls;
}

// ─── Emission ────────────────────────────────────────────────────────────────

/** What an Element contributes to a generation payload. */
export interface ElementEmission {
  /** Library refs to attach. One when a reference is pinned, up to the fallback
   *  ceiling otherwise. Comes from the contract, so both sides send the same set. */
  refs: LibraryImageRef[];
  /** Drives the existing `[System Context Injection]` line in buildNodePayload. */
  referenceType: ImageReferenceType;
  /** An Element that contributes an image but no words hands the model an ambiguity it
   *  will resolve on its own. */
  label: string;
  /** Members left behind by the fallback ceiling. Surfaced on the node as a chip;
   *  silent truncation is how a user concludes the product is random. */
  droppedCount: number;
  mode: 'pinned' | 'fallback';
}

const CATEGORY_REFERENCE_TYPE: Record<ElementCategory, ImageReferenceType> = {
  model: 'person',
  character: 'person',
  product: 'product',
  object: 'product',
  material: 'default',
  setting: 'default',
  style: 'default',
  moodboard: 'default',
  general: 'default',
};

export function elementReferenceTypeFor(category: ElementCategory): ImageReferenceType {
  return CATEGORY_REFERENCE_TYPE[category] ?? 'default';
}

export function elementRequiresRightsNote(category: ElementCategory): boolean {
  return isElementPersonCategory(category);
}

/**
 * What the node emits.
 *
 * `null` means emit NOTHING. A node bound to an Element that no longer exists must not
 * fall through to zero references and generate something plausible and wrong — and an
 * Element with neither a reference nor members has nothing to say either.
 */
export function elementNodeEmission(
  element: ElementRecord | null | undefined,
  slot = 1,
): ElementEmission | null {
  if (!element) return null;

  const refs = resolveElementRefs(element);
  if (refs.length === 0) return null;

  const pinned = Boolean(element.defaultReferenceAssetId);
  return {
    refs,
    referenceType: elementReferenceTypeFor(element.category),
    label: buildElementReferenceLabel({
      category: element.category,
      name: element.name,
      slot,
    }),
    droppedCount: pinned ? 0 : Math.max(0, element.members.length - refs.length),
    mode: pinned ? 'pinned' : 'fallback',
  };
}

/** The reference the panel and the node show: the pinned one, else the newest. */
export function elementDefaultReferenceAssetId(element: ElementRecord): string | undefined {
  return element.defaultReferenceAssetId ?? element.referenceHistory.at(-1);
}

// ─── UI copy (docs/research/element-reference-generation.md §6, written to be
//     pasted — a user who has been told the ceiling debugs their inputs) ───────

export const ELEMENT_CATEGORY_LABEL: Record<ElementCategory, string> = {
  model: 'Model',
  character: 'Character',
  product: 'Product',
  object: 'Object',
  material: 'Material',
  setting: 'Setting',
  style: 'Style',
  moodboard: 'Moodboard',
  general: 'General',
};

export interface ElementCategoryGuidance {
  /** Suggested member count, e.g. "3–5". */
  readonly count: string;
  /** What to vary between members. */
  readonly vary: string;
  /** What must stay the same. */
  readonly constant: string;
}

export const ELEMENT_CATEGORY_GUIDANCE: Record<ElementCategory, ElementCategoryGuidance> = {
  model: {
    count: '3–5',
    vary: 'angle (include one three-quarter), lighting, day',
    constant: 'the person; at least one frame with the face large',
  },
  character: {
    count: '3–5',
    vary: 'angle and distance; include one full-body and one back or three-quarter-rear',
    constant: 'the costume',
  },
  product: {
    count: '3–6',
    vary: 'angle — front, three-quarter, back, top; include one on a plain ground',
    constant: 'the exact SKU and colourway',
  },
  object: { count: '3–6', vary: 'angle, distance', constant: 'the unit' },
  material: {
    count: '2–4',
    vary: 'lighting, which patch of the surface',
    constant: 'the material and its scale',
  },
  setting: {
    count: '3–5',
    vary: 'vantage point; time of day only if the place still reads the same',
    constant: 'the place',
  },
  style: {
    count: '6–8',
    vary: 'the subject — deliberately different things',
    constant: 'the treatment',
  },
  moodboard: { count: '5–8', vary: 'everything except the feeling', constant: '—' },
  general: { count: '3–5', vary: 'framing and setting', constant: 'the subject' },
};

export const ELEMENT_INPUT_COPY =
  '3–5 varied images beat 8 similar ones. Add another only if it shows something the others don’t.';

export const ELEMENT_STYLE_INPUT_COPY =
  'Use images of different things in the same style — that’s how we tell the style apart from the subject.';

export const ELEMENT_GUIDELINES_COPY =
  'Optional. Call out what the images don’t make obvious — a detail to keep, or which of two variants this is.';

export const ELEMENT_RIGHTS_COPY =
  'Required for people. Where do these images come from? (e.g. “own employee, consent on file”, “licensed stock, Getty #12345”)';

export const ELEMENT_PREVIEW_COPY = 'This image is what gets sent to the model.';

export const ELEMENT_CEILING_COPY =
  'Expect “clearly the same person” rather than a pixel-identical face — Elements improve consistency, they don’t guarantee it.';

// Browser API for Meta Conversions API (CAPI) settings, sources, sends and deliveries. Calls the
// Backend directly through http.ts; every response parses through @continuum/contracts.

'use client';

import {
  CAPI_ROUTES,
  type CapiDelivery,
  type CapiPixel,
  type CapiSendRequest,
  type CapiSendResult,
  type CapiSettings,
  type CapiSettingsUpdate,
  type CapiSource,
  capiDeliveriesResponseSchema,
  capiPixelsResponseSchema,
  capiSendResultSchema,
  capiSettingsResponseSchema,
  capiSourceCreateResponseSchema,
  type capiSourceCreateSchema,
  capiSourceSchema,
  capiSourcesResponseSchema,
  type capiSourceUpdateSchema,
} from '@continuum/contracts';
import { z } from 'zod';
import { http } from '@/lib/api/http';

type CapiSourceCreate = z.input<typeof capiSourceCreateSchema>;
type CapiSourceUpdate = z.input<typeof capiSourceUpdateSchema>;

const byBrand = (path: string, brandId: string) => `${path}?brandId=${encodeURIComponent(brandId)}`;

export async function fetchCapiPixels(brandId: string): Promise<CapiPixel[]> {
  const result = await http.request<z.infer<typeof capiPixelsResponseSchema>>({
    path: byBrand(CAPI_ROUTES.pixels, brandId),
    schema: capiPixelsResponseSchema,
  });
  return result.pixels;
}

export async function fetchCapiSettings(brandId: string): Promise<CapiSettings | null> {
  const result = await http.request<z.infer<typeof capiSettingsResponseSchema>>({
    path: byBrand(CAPI_ROUTES.settings, brandId),
    schema: capiSettingsResponseSchema,
  });
  return result.settings;
}

export async function saveCapiSettings(input: CapiSettingsUpdate): Promise<CapiSettings | null> {
  const result = await http.request<z.infer<typeof capiSettingsResponseSchema>>({
    path: CAPI_ROUTES.settings,
    method: 'PUT',
    body: input,
    schema: capiSettingsResponseSchema,
  });
  return result.settings;
}

export async function fetchCapiSources(brandId: string): Promise<CapiSource[]> {
  const result = await http.request<z.infer<typeof capiSourcesResponseSchema>>({
    path: byBrand(CAPI_ROUTES.sources, brandId),
    schema: capiSourcesResponseSchema,
  });
  return result.sources;
}

/** `signingSecret` comes back once, here, and never again. */
export function createCapiSource(
  input: CapiSourceCreate,
): Promise<z.infer<typeof capiSourceCreateResponseSchema>> {
  return http.request<z.infer<typeof capiSourceCreateResponseSchema>>({
    path: CAPI_ROUTES.sources,
    method: 'POST',
    body: input,
    schema: capiSourceCreateResponseSchema,
  });
}

export async function updateCapiSource(
  sourceId: string,
  input: CapiSourceUpdate,
): Promise<CapiSource> {
  const result = await http.request<{ source: CapiSource }>({
    path: `${CAPI_ROUTES.sources}/${encodeURIComponent(sourceId)}`,
    method: 'PATCH',
    body: input,
    schema: z.object({ source: capiSourceSchema }),
  });
  return result.source;
}

export async function deleteCapiSource(brandId: string, sourceId: string): Promise<void> {
  await http.request({
    path: byBrand(`${CAPI_ROUTES.sources}/${encodeURIComponent(sourceId)}`, brandId),
    method: 'DELETE',
  });
}

export function sendCapiEvents(input: CapiSendRequest): Promise<CapiSendResult> {
  return http.request<z.infer<typeof capiSendResultSchema>>({
    path: CAPI_ROUTES.events,
    method: 'POST',
    body: input,
    schema: capiSendResultSchema,
  });
}

export async function fetchCapiDeliveries(brandId: string): Promise<CapiDelivery[]> {
  const result = await http.request<z.infer<typeof capiDeliveriesResponseSchema>>({
    path: byBrand(CAPI_ROUTES.deliveries, brandId),
    schema: capiDeliveriesResponseSchema,
  });
  return result.deliveries;
}

export const capiQueryKeys = {
  pixels: (brandId: string) => ['capi-pixels', brandId] as const,
  settings: (brandId: string) => ['capi-settings', brandId] as const,
  sources: (brandId: string) => ['capi-sources', brandId] as const,
  deliveries: (brandId: string) => ['capi-deliveries', brandId] as const,
};

import {
  type HyperframesFilm,
  type HyperframesFilmRequest,
  hyperframesFilmRequestSchema,
  hyperframesFilmSchema,
  type TemplateSource,
  templateSourceSchema,
} from '@continuum/contracts';
import { request } from '@/lib/api/http';

const path = (assetId: string) => `/api/ai-studio/templates/${encodeURIComponent(assetId)}`;

/** The template's editable copy, as its upload parse found it. */
export async function fetchHyperframesFilmFields(
  brandId: string,
  assetId: string,
  signal?: AbortSignal,
) {
  const source = await request<TemplateSource>({
    path: `${path(assetId)}?${new URLSearchParams({ brandId })}`,
    schema: templateSourceSchema,
    signal,
  });
  return (source.parse?.native?.fields ?? []).filter((field) => field.kind === 'text');
}

/** Render the template to a Library film. The render runs inside the request, so it waits. */
export function renderHyperframesFilm(
  assetId: string,
  body: HyperframesFilmRequest,
  signal?: AbortSignal,
) {
  return request<HyperframesFilm>({
    path: `${path(assetId)}/hyperframes/films`,
    method: 'POST',
    body: hyperframesFilmRequestSchema.parse(body),
    schema: hyperframesFilmSchema,
    // The proxy's own read timeout: the Backend answers inside it or not at all.
    timeoutMs: 300_000,
    signal,
  });
}

'use client';

import type { TemplateFontStatus, TemplateSource } from '@continuum/contracts';
import { getApiUrl } from '@/lib/api/config';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

// Client for the template-source routes on the Fastify backend. They live there rather than
// in a Next route handler because they reach Template Forge with a server-only token, and
// because the font readiness check reads the private brand font store.

async function authorizedFetch(path: string, init?: RequestInit): Promise<Response> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('A signed-in session is required');
  return fetch(getApiUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
}

async function unwrap<T>(response: Response, what: string): Promise<T> {
  if (!response.ok) {
    const detail = (await response.json().catch(() => ({}))) as { detail?: string; error?: string };
    throw new Error(detail.detail ?? detail.error ?? `${what} failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export async function fetchTemplateSources(brandId: string): Promise<TemplateSource[]> {
  const response = await authorizedFetch(
    `/api/ai-studio/templates?brandId=${encodeURIComponent(brandId)}`,
  );
  const body = await unwrap<{ items?: TemplateSource[] }>(response, 'Template list');
  return body.items ?? [];
}

export type TemplateFontReadiness = {
  fonts: TemplateFontStatus[];
  missing: number;
  parseState: string;
};

export async function fetchTemplateFonts(
  brandId: string,
  assetId: string,
): Promise<TemplateFontReadiness> {
  const response = await authorizedFetch(
    `/api/ai-studio/templates/${assetId}/fonts?brandId=${encodeURIComponent(brandId)}`,
  );
  return unwrap<TemplateFontReadiness>(response, 'Template font check');
}

export async function sendTemplateToForge(
  brandId: string,
  assetId: string,
): Promise<TemplateSource> {
  const response = await authorizedFetch(`/api/ai-studio/templates/${assetId}/forge`, {
    method: 'POST',
    body: JSON.stringify({ brandId }),
  });
  return unwrap<TemplateSource>(response, 'Template Forge hand-off');
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

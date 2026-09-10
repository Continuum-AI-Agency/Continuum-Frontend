'use client';

import type {
  RenderWorkspace,
  WorkspaceTemplate,
  TemplateFontStatus,
  TemplateForgeNeed,
  TemplateSource,
} from '@continuum/contracts';
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
): Promise<{ workspace: RenderWorkspace; items: WorkspaceTemplate[] }> {
  const params = new URLSearchParams({ brandId });
  if (workspaceId) params.set('workspaceId', workspaceId);
  const response = await authorizedFetch(`/api/ai-studio/templates/discover?${params}`);
  return unwrap<{ workspace: RenderWorkspace; items: WorkspaceTemplate[] }>(
    response,
    'Workspace templates',
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
  // Which workspace to build in. Omitted means the brand's default, which is the only choice
  // when it has one — but a template belongs to exactly ONE workspace, so when there are several
  // the person picks and we send it.
  workspaceId?: string,
): Promise<TemplateSource> {
  const response = await authorizedFetch(`/api/ai-studio/templates/${assetId}/forge`, {
    method: 'POST',
    body: JSON.stringify({ brandId, templateName, ...(workspaceId ? { workspaceId } : {}) }),
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
};

export type TemplateSlotEdit = {
  slotKey: string;
  publicName?: string | null;
  role?: string | null;
  charBudget?: number | null;
  required?: boolean | null;
  defaultValue?: unknown;
  binding?: { source: string; path: string; label?: string } | null;
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

'use client';

import type { RenderApproval, RenderApprovalDecisionResponse } from '@continuum/contracts';
import { getApiUrl } from '@/lib/api/config';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

// Client for the render-approval routes on the Fastify backend, matching
// templateSources.ts exactly — bearer token, no Next route handler, no direct
// Supabase read.
//
// Deciding here needs no Slack at all. That matters more than it looks: button
// clicks are inbound Slack traffic, and inbound is the half of that surface that
// has never worked in production, so this is the path that is known to work.

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

export async function fetchRenderApprovals(brandId: string): Promise<RenderApproval[]> {
  const response = await authorizedFetch(
    `/api/ai-studio/renders/approvals?brandId=${encodeURIComponent(brandId)}`,
  );
  const body = await unwrap<{ approvals?: RenderApproval[] }>(response, 'Pending approvals');
  return body.approvals ?? [];
}

export async function decideRenderApproval(
  approvalId: string,
  decision: 'approve' | 'reject',
  reason: string | null = null,
): Promise<RenderApprovalDecisionResponse> {
  const response = await authorizedFetch(
    `/api/ai-studio/renders/approvals/${approvalId}/decision`,
    {
      method: 'POST',
      body: JSON.stringify({ decision, reason }),
    },
  );
  return unwrap<RenderApprovalDecisionResponse>(response, 'Decision');
}

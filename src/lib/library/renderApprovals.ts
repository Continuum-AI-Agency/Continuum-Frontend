'use client';

import {
  type AddDestinationApproverRequest,
  type DestinationApprover,
  destinationApproverListResponseSchema,
  destinationApproverResponseSchema,
  type RenderApproval,
  type RenderApprovalDecisionResponse,
  type RenderApprovalDestination,
  renderApprovalDestinationListResponseSchema,
} from '@continuum/contracts';
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

/**
 * The brand's Slack and WhatsApp rooms a Meta-bound render can be approved in, and where it last
 * asked — a confirm pre-selects those rather than making someone re-pick the same rooms every time.
 *
 * `defaultDestinationIds` is simply absent from a Backend older than the one that sends it, which
 * is why it is optional here rather than an empty list meaning "nowhere".
 */
export async function fetchApprovalDestinations(brandId: string): Promise<{
  destinations: RenderApprovalDestination[];
  defaultDestinationIds?: string[];
}> {
  const response = await authorizedFetch(
    `/api/ai-studio/renders/approval-destinations?brandId=${encodeURIComponent(brandId)}`,
  );
  return renderApprovalDestinationListResponseSchema.parse(
    await unwrap<unknown>(response, 'Approval rooms'),
  );
}

const approversPath = (destinationId: string) =>
  `/api/ai-studio/renders/destinations/${encodeURIComponent(destinationId)}/approvers`;

export async function fetchDestinationApprovers(
  destinationId: string,
): Promise<DestinationApprover[]> {
  const response = await authorizedFetch(approversPath(destinationId));
  return destinationApproverListResponseSchema.parse(await unwrap<unknown>(response, 'Approvers'))
    .approvers;
}

/** Adds an ACTIVE approver: a brand member by `userId`, or a platform id. */
export async function addDestinationApprover(
  destinationId: string,
  body: AddDestinationApproverRequest,
): Promise<DestinationApprover> {
  const response = await authorizedFetch(approversPath(destinationId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return destinationApproverResponseSchema.parse(
    await unwrap<unknown>(response, 'Adding the approver'),
  ).approver;
}

async function transitionApprover(
  destinationId: string,
  approverId: string,
  action: 'activate' | 'revoke',
): Promise<DestinationApprover> {
  const response = await authorizedFetch(
    `${approversPath(destinationId)}/${encodeURIComponent(approverId)}/${action}`,
    { method: 'POST', body: '{}' },
  );
  return destinationApproverResponseSchema.parse(
    await unwrap<unknown>(response, action === 'activate' ? 'Activating' : 'Revoking'),
  ).approver;
}

export const activateDestinationApprover = (destinationId: string, approverId: string) =>
  transitionApprover(destinationId, approverId, 'activate');

export const revokeDestinationApprover = (destinationId: string, approverId: string) =>
  transitionApprover(destinationId, approverId, 'revoke');

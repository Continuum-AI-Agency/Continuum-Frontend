'use client';

import {
  APPROVALS_DECISIONS_ROUTE,
  type ApprovalBatchDecisionResponse,
  approvalBatchDecisionResponseSchema,
} from '@continuum/contracts';
import { request } from '@/lib/api/http';

// Several approvals decided in one call, over the cross-agent approvals ledger. Each id is decided
// by its own feature's rules on the Backend, exactly as one click would be, so a batch approves
// nothing a single decision would refuse — and needs no Slack.

export function decideApprovals(input: {
  brandId: string;
  ids: string[];
  decision: 'approve' | 'reject';
  reason?: string | null;
}): Promise<ApprovalBatchDecisionResponse> {
  return request<ApprovalBatchDecisionResponse>({
    path: APPROVALS_DECISIONS_ROUTE,
    method: 'POST',
    body: { ...input, reason: input.reason ?? null },
    schema: approvalBatchDecisionResponseSchema,
  });
}

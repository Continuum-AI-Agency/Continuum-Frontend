// The Jaina turn request, built once and shared by every transport.
//
// This lived inside the deleted NDJSON reader hook, which made it read as a detail of that hook
// rather than the wire contract it is. It is the only place that turns the composer's intent into
// `jainaChatRequestSchema`, and it parses against that schema on the way out, so a field the
// Backend does not accept fails here rather than at the route.
//
// Lifting it out is what lets the AI SDK transport send the SAME request that reader sent. A
// transport that rebuilds a narrower body of its own silently drops `include_thoughts`, the entity
// `dataScope`, references, attachments and the plan/scaffold/tool actions — none of which is
// visible at the call site, and all of which surface only as a turn that quietly does less.

import {
  type AgentAttachment,
  type AgentDocumentAttachment,
  type ConversationDataScopeV1,
  type JainaChatRequest as JainaChatStreamRequest,
  jainaChatRequestSchema,
} from '@continuum/contracts';
import type { AgentMentionReference } from '@/lib/agent-references';
import { browserTimezone } from '@/lib/automations/schedule';
import type { JainaPlanAction, JainaScaffoldAction, JainaToolAction } from '@/lib/jaina/schemas';

export type { JainaChatStreamRequest };

export type JainaChatInput = {
  query: string;
  canvas?: boolean;
  adAccountId: string;
  adAccountIds?: string[];
  brandId: string;
  /**
   * The optional sub-brand project scope, from ActiveProjectProvider. Absent means brand
   * scope — the behaviour that shipped before projects existed.
   */
  projectId?: string | null;
  sessionId?: string;
  clarificationId?: string;
  userId?: string;
  images?: AgentAttachment[];
  // Documents attached to the composer. Resolved to chunks server-side rather than
  // sent as content, and kept out of `images` so they never reach the pixels path.
  documents?: AgentDocumentAttachment[];
  // Scopes which ephemeral documents this turn may resolve. Server-derived.
  documentScopeKey?: string;
  references?: AgentMentionReference[];
  planAction?: JainaPlanAction;
  scaffoldAction?: JainaScaffoldAction;
  /** A human's answer to any gated tool that is not a paid scaffold. */
  toolAction?: JainaToolAction;
  forceReportArtifact?: boolean;
  /**
   * Invoked when the request fails to reach the backend.
   *
   * `start()` resolves before the fetch settles, so a caller holding optimistic UI
   * has no other way to learn it was dropped. Without this an approval that never
   * arrived still renders as "Approved" — exactly the silence an approval gate
   * exists to prevent.
   */
  onDispatchError?: (message: string) => void;
};

function referenceMetadataId(reference: AgentMentionReference, keys: string[]): string | null {
  for (const key of keys) {
    const value = reference.metadata?.[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

function unique(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function buildJainaDataScope(
  accountIds: string[],
  references: AgentMentionReference[],
): { dataScope: ConversationDataScopeV1; hasEntityScope: boolean } {
  const campaigns = unique(
    references.map((reference) =>
      reference.type === 'campaign' ? reference.id : referenceMetadataId(reference, ['campaignId']),
    ),
  );
  const groups = unique(
    references.map((reference) =>
      reference.type === 'adset'
        ? reference.id
        : referenceMetadataId(reference, ['adsetId', 'adSetId']),
    ),
  );
  const ads = unique(references.map((reference) => referenceMetadataId(reference, ['adId'])));
  const hasEntityScope = campaigns.length + groups.length + ads.length > 0;

  return {
    hasEntityScope,
    dataScope: {
      schemaVersion: 1,
      accounts: accountIds.map((accountId) => ({ platform: 'meta', accountId })),
      ...(hasEntityScope
        ? {
            campaigns: { ids: campaigns },
            groups: { ids: groups },
            ads: { ids: ads },
          }
        : {}),
    },
  };
}

export function buildJainaChatStreamRequest(
  input: JainaChatInput,
  timezone = browserTimezone(),
): JainaChatStreamRequest {
  const accountIds = input.adAccountIds ?? [input.adAccountId];
  const references = input.references ?? [];
  const { dataScope, hasEntityScope } = buildJainaDataScope(accountIds, references);
  const includeScope = input.adAccountIds !== undefined || hasEntityScope;

  return jainaChatRequestSchema.parse({
    query: input.query,
    include_thoughts: true,
    force_report_artifact: input.forceReportArtifact,
    message_metadata: references.length > 0 ? { references } : undefined,
    userId: input.userId,
    canvas: input.canvas,
    clarification: input.clarificationId ? { id: input.clarificationId } : undefined,
    ...(input.planAction ? { plan_action: input.planAction } : {}),
    ...(input.scaffoldAction ? { scaffold_action: input.scaffoldAction } : {}),
    ...(input.toolAction ? { tool_action: input.toolAction } : {}),
    context: {
      adAccountId: input.adAccountId,
      ...(includeScope ? { adAccountIds: accountIds, dataScope } : {}),
      brandId: input.brandId,
      sessionId: input.sessionId,
      canvas: input.canvas,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      timezone,
      ...(references.length > 0 ? { references } : {}),
      ...(input.images && input.images.length > 0 ? { images: input.images } : {}),
      ...(input.documents && input.documents.length > 0 ? { documents: input.documents } : {}),
      ...(input.documentScopeKey ? { documentScopeKey: input.documentScopeKey } : {}),
    },
  });
}

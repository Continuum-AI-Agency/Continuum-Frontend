import type { MediaSearchResultsFrame } from '@continuum/contracts';
import type { OrganicSessionMessage } from '@/lib/organic/agent-sessions';
import {
  type ParsedPlanStatus,
  parseOrganicStreamEvent,
  postListCardFromToolResult,
} from './streamEventParser';
import type { ConversationMessage, PipelineCardState, ToolCallEvent, UiCard } from './types';
import type { BulkRunRef } from './useOrganicAgentReducer';

export type RestoredSession = {
  messages: ConversationMessage[];
  pipelineCards: Array<Partial<PipelineCardState> & { jobId: string }>;
  bulkRuns: BulkRunRef[];
  planStatuses: ParsedPlanStatus[];
};

/**
 * Rebuild reducer state from persisted messages. Embedded frames are replayed
 * through the SAME parser used for the live stream and routed exactly as the live
 * dispatcher (useOrganicAgentStream.dispatchParsed) does — plan/bulk/trend/post
 * cards, tool-call thinking trace, and media-search results re-attach to their
 * message; pipeline/bulk-run state is reseeded. One mapping, no drift.
 */
export function restoreSessionFromMessages(msgs: OrganicSessionMessage[]): RestoredSession {
  const pipelineCards: RestoredSession['pipelineCards'] = [];
  const bulkRuns: BulkRunRef[] = [];
  const planStatuses: ParsedPlanStatus[] = [];
  // Storyboard frames arrive from the (separate) blueprint job, usually after the
  // live stream closed, so on reload they're merged into the restored card by draftId.
  const blueprintsByDraftId = new Map<string, string[]>();

  const messages = msgs.map((m) => {
    const uiCards: UiCard[] = [];
    const toolCallsById = new Map<string, ToolCallEvent>();
    const mediaSearchResults: MediaSearchResultsFrame[] = [];

    for (const frame of m.uiCardFrames) {
      const parsed = parseOrganicStreamEvent(frame);
      switch (parsed.kind) {
        case 'uiCard':
          uiCards.push(parsed.card);
          break;
        case 'pipelineCard':
          pipelineCards.push(parsed.card);
          break;
        case 'draftBlueprint':
          if (parsed.previews.length > 0) blueprintsByDraftId.set(parsed.draftId, parsed.previews);
          break;
        case 'bulkRun':
          bulkRuns.push({
            runId: parsed.run.runId,
            planId: parsed.run.planId,
            total: parsed.run.total,
          });
          break;
        case 'planStatus':
          planStatuses.push(parsed.event);
          break;
        case 'toolCall':
          toolCallsById.set(parsed.event.toolCallId, parsed.event);
          break;
        case 'toolResult': {
          const existing = toolCallsById.get(parsed.toolCallId);
          if (existing) {
            existing.result = parsed.result;
            existing.ok = parsed.ok;
            existing.reason = parsed.reason;
          } else {
            toolCallsById.set(parsed.toolCallId, {
              toolCallId: parsed.toolCallId,
              toolName: parsed.toolName,
              args: undefined,
              result: parsed.result,
              ok: parsed.ok,
              reason: parsed.reason,
            });
          }
          const postCard = postListCardFromToolResult(parsed.toolName, parsed.result);
          if (postCard) uiCards.push(postCard);
          break;
        }
        case 'mediaSearchResults':
          mediaSearchResults.push(parsed.frame);
          break;
        default:
          break;
      }
    }

    const toolCalls = Array.from(toolCallsById.values());
    return {
      id: m.id,
      role: m.role,
      content: m.content,
      metadata: m.metadata,
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
      ...(uiCards.length > 0 ? { uiCards } : {}),
      ...(mediaSearchResults.length > 0 ? { mediaSearchResults } : {}),
    } satisfies ConversationMessage;
  });

  // Merge restored storyboard frames onto their card (by draftId) so a reloaded
  // session shows the 512px preview that the blueprint job produced.
  if (blueprintsByDraftId.size > 0) {
    for (const card of pipelineCards) {
      const previews = card.draftId ? blueprintsByDraftId.get(card.draftId) : undefined;
      if (previews && previews.length > 0) {
        card.preview = {
          caption: card.preview?.caption ?? null,
          imageUrl: card.preview?.imageUrl ?? previews[0] ?? null,
          images: previews,
          format: card.preview?.format ?? null,
        };
        card.checkpoint = { ...card.checkpoint, blueprintReady: true };
      }
    }
  }

  return { messages, pipelineCards, bulkRuns, planStatuses };
}

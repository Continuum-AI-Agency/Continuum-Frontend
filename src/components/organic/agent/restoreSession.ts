import type { MediaSearchResultsFrame } from "@continuum/contracts";
import type { OrganicSessionMessage } from "@/lib/organic/agent-sessions";
import { parseOrganicStreamEvent, postListCardFromToolResult } from "./streamEventParser";
import type { BulkRunRef } from "./useOrganicAgentReducer";
import type { ConversationMessage, PipelineCardState, ToolCallEvent, UiCard } from "./types";

export type RestoredSession = {
  messages: ConversationMessage[];
  pipelineCards: Array<Partial<PipelineCardState> & { jobId: string }>;
  bulkRuns: BulkRunRef[];
};

/**
 * Rebuild reducer state from persisted messages. Embedded frames are replayed
 * through the SAME parser used for the live stream and routed exactly as the live
 * dispatcher (useOrganicAgentStream.dispatchParsed) does — plan/bulk/trend/post
 * cards, tool-call thinking trace, and media-search results re-attach to their
 * message; pipeline/bulk-run state is reseeded. One mapping, no drift.
 */
export function restoreSessionFromMessages(msgs: OrganicSessionMessage[]): RestoredSession {
  const pipelineCards: RestoredSession["pipelineCards"] = [];
  const bulkRuns: BulkRunRef[] = [];

  const messages = msgs.map((m) => {
    const uiCards: UiCard[] = [];
    const toolCallsById = new Map<string, ToolCallEvent>();
    const mediaSearchResults: MediaSearchResultsFrame[] = [];

    for (const frame of m.uiCardFrames) {
      const parsed = parseOrganicStreamEvent(frame);
      switch (parsed.kind) {
        case "uiCard":
          uiCards.push(parsed.card);
          break;
        case "pipelineCard":
          pipelineCards.push(parsed.card);
          break;
        case "bulkRun":
          bulkRuns.push({ runId: parsed.run.runId, planId: parsed.run.planId, total: parsed.run.total });
          break;
        case "toolCall":
          toolCallsById.set(parsed.event.toolCallId, parsed.event);
          break;
        case "toolResult": {
          const existing = toolCallsById.get(parsed.toolCallId);
          if (existing) {
            existing.result = parsed.result;
          } else {
            toolCallsById.set(parsed.toolCallId, {
              toolCallId: parsed.toolCallId,
              toolName: parsed.toolName,
              args: undefined,
              result: parsed.result,
            });
          }
          const postCard = postListCardFromToolResult(parsed.toolName, parsed.result);
          if (postCard) uiCards.push(postCard);
          break;
        }
        case "mediaSearchResults":
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

  return { messages, pipelineCards, bulkRuns };
}

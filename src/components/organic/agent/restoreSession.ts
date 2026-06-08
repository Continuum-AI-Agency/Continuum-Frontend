import type { OrganicSessionMessage } from "@/lib/organic/agent-sessions";
import { parseOrganicStreamEvent } from "./streamEventParser";
import type { BulkRunRef } from "./useOrganicAgentReducer";
import type { ConversationMessage, PipelineCardState, UiCard } from "./types";

export type RestoredSession = {
  messages: ConversationMessage[];
  pipelineCards: Array<Partial<PipelineCardState> & { jobId: string }>;
  bulkRuns: BulkRunRef[];
};

/**
 * Rebuild reducer state from persisted messages. Embedded card frames are
 * replayed through the same parser used for the live stream, so plan/bulk/trend
 * cards re-attach to their message and pipeline/bulk-run state is reseeded —
 * one mapping, no drift.
 */
export function restoreSessionFromMessages(msgs: OrganicSessionMessage[]): RestoredSession {
  const pipelineCards: RestoredSession["pipelineCards"] = [];
  const bulkRuns: BulkRunRef[] = [];

  const messages = msgs.map((m) => {
    const uiCards: UiCard[] = [];
    for (const frame of m.uiCardFrames) {
      const parsed = parseOrganicStreamEvent(frame);
      if (parsed.kind === "uiCard") {
        uiCards.push(parsed.card);
      } else if (parsed.kind === "pipelineCard") {
        pipelineCards.push(parsed.card);
      } else if (parsed.kind === "bulkRun") {
        bulkRuns.push({ runId: parsed.run.runId, planId: parsed.run.planId, total: parsed.run.total });
      }
    }
    return {
      id: m.id,
      role: m.role,
      content: m.content,
      metadata: m.metadata,
      ...(uiCards.length > 0 ? { uiCards } : {}),
    } satisfies ConversationMessage;
  });

  return { messages, pipelineCards, bulkRuns };
}

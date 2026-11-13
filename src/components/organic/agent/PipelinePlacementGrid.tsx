'use client';

import { PipelineCard } from './PipelineCard';
import type { PipelineCardState, ToolCallEvent } from './types';

type PipelineMediaActions = {
  /** Stage-2 "Enrich": sketch the blueprint for a text-ready draft. */
  onEnrichDraft?: (draftId: string) => void;
  /** Stage-3 "Generate media": realize a blueprint-ready draft (format-routed). */
  onGenerateMedia?: (draftId: string, format: string, previewRevision: string) => void;
  /** Re-queue a job in place: Retry (failed) and Recreate draft (draft gone). */
  onRetryJob?: (jobId: string) => void;
  /** Open the planner on a draft; `null` opens the planner itself. */
  onOpenDraft?: (draftId: string | null) => void;
};

export function PipelinePlacementGrid({
  cards,
  ...actions
}: { cards: PipelineCardState[] } & PipelineMediaActions) {
  if (cards.length === 0) return null;
  return (
    <div className="grid grid-cols-1 justify-start gap-2 min-[520px]:grid-cols-[repeat(auto-fill,minmax(220px,260px))]">
      {cards.map((card) => (
        <PipelineCard key={card.jobId} card={card} {...actions} />
      ))}
    </div>
  );
}

// Pipeline cards attached to a message's tool calls (matched by the toolCallId
// the backend threads from generatePosts onto its durable frames), so the cards
// render inline under the tool call instead of in a separate track. Cards
// without a toolCallId keep their existing standalone rendering paths.
export function ToolCallPipelineCards({
  toolCalls,
  cardsByToolCallId,
  ...actions
}: {
  toolCalls: ToolCallEvent[];
  cardsByToolCallId: Map<string, PipelineCardState[]>;
} & PipelineMediaActions) {
  const cards = toolCalls.flatMap((toolCall) => cardsByToolCallId.get(toolCall.toolCallId) ?? []);
  return <PipelinePlacementGrid cards={cards} {...actions} />;
}

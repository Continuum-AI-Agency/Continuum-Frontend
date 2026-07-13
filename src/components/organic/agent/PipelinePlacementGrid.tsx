'use client';

import { PipelineCard } from './PipelineCard';
import type { PipelineCardState, ToolCallEvent } from './types';

type PipelineMediaActions = {
  /** Stage-2 "Enrich": sketch the blueprint for a text-ready draft. */
  onEnrichDraft?: (draftId: string) => void;
  /** Stage-3 "Generate media": realize a blueprint-ready draft (format-routed). */
  onGenerateMedia?: (draftId: string, format: string) => void;
};

export function PipelinePlacementGrid({
  cards,
  onEnrichDraft,
  onGenerateMedia,
}: { cards: PipelineCardState[] } & PipelineMediaActions) {
  if (cards.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {cards.map((card) => (
        <PipelineCard
          key={card.jobId}
          card={card}
          onEnrichDraft={onEnrichDraft}
          onGenerateMedia={onGenerateMedia}
        />
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
  onEnrichDraft,
  onGenerateMedia,
}: {
  toolCalls: ToolCallEvent[];
  cardsByToolCallId: Map<string, PipelineCardState[]>;
} & PipelineMediaActions) {
  const cards = toolCalls.flatMap((toolCall) => cardsByToolCallId.get(toolCall.toolCallId) ?? []);
  return (
    <PipelinePlacementGrid
      cards={cards}
      onEnrichDraft={onEnrichDraft}
      onGenerateMedia={onGenerateMedia}
    />
  );
}

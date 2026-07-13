import type { TranscriptAnchor } from '@/components/chat/anchors';
import type { ConversationMessage, PipelineCardState } from './types';

// A milestone the agent reached inside an assistant turn. These are the points a reader wants to
// jump back to. Every one of them is derived from a frame the stream already emits — no new event
// type is introduced to support the minimap.
export type OrganicMilestone = {
  id: string;
  label: string;
};

// Pipeline cards bind to a turn through the tool call that dispatched them, which is the same
// linkage the transcript uses to render a card inline under its tool call.
function cardsForMessage(
  message: ConversationMessage,
  pipeline: Readonly<Record<string, PipelineCardState>>,
): PipelineCardState[] {
  const toolCallIds = new Set((message.toolCalls ?? []).map((call) => call.toolCallId));
  if (toolCallIds.size === 0) return [];

  return Object.values(pipeline).filter(
    (card) => card.toolCallId && toolCallIds.has(card.toolCallId),
  );
}

export function milestonesForMessage(
  message: ConversationMessage,
  pipeline: Readonly<Record<string, PipelineCardState>>,
): OrganicMilestone[] {
  if (message.role !== 'assistant') return [];

  const milestones: OrganicMilestone[] = [];

  if (message.uiCards?.some((card) => card.type === 'plan_card')) {
    milestones.push({ id: `${message.id}::plan`, label: 'Plan ready' });
  }

  const cards = cardsForMessage(message, pipeline);

  if (cards.some((card) => card.checkpoint?.textReady)) {
    milestones.push({ id: `${message.id}::copy`, label: 'Copy ready' });
  }
  if (cards.some((card) => card.checkpoint?.blueprintReady)) {
    milestones.push({ id: `${message.id}::blueprint`, label: 'Blueprint ready' });
  }
  if (cards.some((card) => card.checkpoint?.awaitingMediaChoice)) {
    milestones.push({ id: `${message.id}::media-choice`, label: 'Awaiting media choice' });
  } else if (cards.some((card) => card.checkpoint?.mediaStatus === 'ready')) {
    milestones.push({ id: `${message.id}::media`, label: 'Media ready' });
  }

  return milestones;
}

export function deriveOrganicAnchors(
  messages: readonly ConversationMessage[],
  pipeline: Readonly<Record<string, PipelineCardState>>,
): TranscriptAnchor[] {
  return messages.flatMap((message): TranscriptAnchor[] => [
    { id: message.id, kind: message.role === 'user' ? 'user' : 'assistant' },
    ...milestonesForMessage(message, pipeline).map(
      (milestone): TranscriptAnchor => ({
        id: milestone.id,
        kind: 'milestone',
        label: milestone.label,
      }),
    ),
  ]);
}

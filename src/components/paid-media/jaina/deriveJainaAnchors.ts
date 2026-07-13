import type { TranscriptAnchor } from '@/components/chat/anchors';
import type { JainaChatMessage } from './types';

// Milestones Jaina reached inside an assistant turn. Each maps to state the message already carries
// (checkpoint report, plan, clarification), so the minimap needs no new stream event.
export type JainaMilestone = {
  id: string;
  label: string;
};

export function milestonesForJainaMessage(message: JainaChatMessage): JainaMilestone[] {
  if (message.role !== 'assistant') return [];

  const milestones: JainaMilestone[] = [];

  if (message.plan) {
    milestones.push({ id: `${message.id}::plan`, label: 'Plan ready' });
  }
  if (message.pendingClarification) {
    milestones.push({ id: `${message.id}::clarification`, label: 'Needs your input' });
  }

  const hasReport = Boolean(message.reportV2 ?? message.report ?? message.reportAssembly);
  if (hasReport && message.status === 'done') {
    milestones.push({ id: `${message.id}::analysis`, label: 'Analysis complete' });
  }

  return milestones;
}

export function deriveJainaAnchors(messages: readonly JainaChatMessage[]): TranscriptAnchor[] {
  return messages.flatMap((message): TranscriptAnchor[] => [
    { id: message.id, kind: message.role === 'user' ? 'user' : 'assistant', at: message.createdAt },
    ...milestonesForJainaMessage(message).map(
      (milestone): TranscriptAnchor => ({
        id: milestone.id,
        kind: 'milestone',
        label: milestone.label,
      }),
    ),
  ]);
}

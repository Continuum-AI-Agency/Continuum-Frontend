import type { useTranslations as ScaleTranslationHook } from 'next-intl';

type ScaleCopy = ReturnType<typeof ScaleTranslationHook<'scale'>>;

import type { TranscriptAnchor } from '@/components/chat/anchors';
import type { JainaChatMessage } from './types';

// Milestones Jaina reached inside an assistant turn. Each maps to state the message already carries
// (checkpoint report, plan, clarification), so the minimap needs no new stream event.
export type JainaMilestone = {
  id: string;
  label: string;
};

export function milestonesForJainaMessage(
  message: JainaChatMessage,
  uiTranslate?: ScaleCopy,
): JainaMilestone[] {
  if (message.role !== 'assistant') return [];

  const milestones: JainaMilestone[] = [];

  if (message.plan) {
    milestones.push({
      id: `${message.id}::plan`,
      label: uiTranslate ? uiTranslate('plan_ready_d7b9c87') : 'Plan ready',
    });
  }
  if (message.pendingClarification) {
    milestones.push({ id: `${message.id}::clarification`, label: (uiTranslate?uiTranslate('needs_your_input_b677d37'):'Needs your input') });
  }

  const hasReport = Boolean(message.reportV2 ?? message.report);
  if (hasReport && message.status === 'done') {
    milestones.push({
      id: `${message.id}::analysis`,
      label: uiTranslate ? uiTranslate('analysis_complete_60ffb9b') : 'Analysis complete',
    });
  }

  return milestones;
}

export function deriveJainaAnchors(
  messages: readonly JainaChatMessage[],
  uiTranslate?: ScaleCopy,
): TranscriptAnchor[] {
  return messages.flatMap((message): TranscriptAnchor[] => [
    { id: message.id, kind: message.role === 'user' ? 'user' : 'assistant', at: message.createdAt },
    ...milestonesForJainaMessage(message, uiTranslate).map(
      (milestone): TranscriptAnchor => ({
        id: milestone.id,
        kind: 'milestone',
        label: milestone.label,
      }),
    ),
  ]);
}

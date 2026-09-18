import type { AgentAttachment } from '@continuum/contracts';
import type { AgentMentionReference } from '@/lib/agent-references';

export type QueuedJainaMessage = {
  id: string;
  content: string;
  createdAt: string;
  canvas: boolean;
  images?: AgentAttachment[];
  inlineTextContext?: string;
  references?: AgentMentionReference[];
  forceReportArtifact?: boolean;
  clarificationId?: string;
};

export function shouldQueueSubmission(input: {
  isStreaming: boolean;
  activeResponseId: string | null;
  /**
   * The conversation on screen is still loading, so its session id is not settled. A turn sent now
   * goes out on the throwaway id the surface mounted with; the load then switches to the reader's
   * real conversation, `useChat` swaps its chat instance on the new id, and the turn vanishes from
   * the screen while it keeps streaming into a session nobody is looking at. The drain already
   * waits for the load — this is the other half of that gate.
   */
  isLoadingConversation: boolean;
}): boolean {
  return input.isStreaming || Boolean(input.activeResponseId) || input.isLoadingConversation;
}

export function enqueueMessage(
  queuedMessages: QueuedJainaMessage[],
  queuedMessage: QueuedJainaMessage,
): QueuedJainaMessage[] {
  return [...queuedMessages, queuedMessage];
}

export function updateQueuedMessageContent(
  queuedMessages: QueuedJainaMessage[],
  messageId: string,
  content: string,
): QueuedJainaMessage[] {
  return queuedMessages.map((message) =>
    message.id === messageId ? { ...message, content } : message,
  );
}

export function removeQueuedMessage(
  queuedMessages: QueuedJainaMessage[],
  messageId: string,
): QueuedJainaMessage[] {
  return queuedMessages.filter((message) => message.id !== messageId);
}

export function takeNextQueuedMessage(queuedMessages: QueuedJainaMessage[]): {
  next: QueuedJainaMessage | null;
  remaining: QueuedJainaMessage[];
} {
  if (queuedMessages.length === 0) {
    return { next: null, remaining: queuedMessages };
  }
  const [next, ...remaining] = queuedMessages;
  return { next, remaining };
}

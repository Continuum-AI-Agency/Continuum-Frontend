import type { AgentAttachment } from '@continuum/contracts';
import type { AgentMentionReference } from '@/lib/agent-references';

export type QueuedJainaMessage = {
  id: string;
  content: string;
  createdAt: string;
  canvas: boolean;
  images?: AgentAttachment[];
  references?: AgentMentionReference[];
  forceReportArtifact?: boolean;
  clarificationId?: string;
};

export function shouldQueueSubmission(input: {
  isStreaming: boolean;
  activeResponseId: string | null;
}): boolean {
  return input.isStreaming || Boolean(input.activeResponseId);
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

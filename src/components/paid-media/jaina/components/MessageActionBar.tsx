'use client';

import { useCallback, useState } from 'react';
import {
  emptyFeedback,
  type Feedback,
  type FeedbackRating,
  ResponseFeedback,
} from '@/components/ui/response-feedback';
import { cn } from '@/lib/utils';

type MessageActionBarProps = {
  content: string;
  onRegenerate?: () => void;
  /** The answer being rated, so a vote can be traced back to its message. */
  messageId?: string;
};

type FeedbackEvent =
  | 'jaina_response_rated'
  | 'jaina_response_feedback_sent'
  | 'jaina_response_feedback_undone';

// The sink is PostHog, the same place `jaina_chat_message_sent` lands. Imported lazily: a static
// `posthog-js` import lands in the root bundle on every route.
function trackFeedback(event: FeedbackEvent, props: Record<string, string | null>): void {
  void import('posthog-js')
    .then(({ default: posthog }) => posthog.capture(event, props))
    .catch((error: unknown) => console.warn('[jaina-feedback] capture failed', event, error));
}

export function MessageActionBar({ content, onRegenerate, messageId }: MessageActionBarProps) {
  const [feedback, setFeedback] = useState<Feedback>(emptyFeedback);

  const handleCopy = useCallback(() => {
    navigator.clipboard?.writeText(content).catch(() => {
      // Clipboard not available
    });
  }, [content]);

  const rated = (rating: FeedbackRating) =>
    trackFeedback('jaina_response_rated', {
      message_id: messageId ?? null,
      rating: String(rating),
    });

  return (
    // Hidden until the message is hovered, but a vote in progress stays on screen.
    <div
      className={cn(
        'transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100',
        feedback.rating === null ? 'opacity-0' : 'opacity-100',
      )}
    >
      <ResponseFeedback
        value={feedback}
        onValueChange={setFeedback}
        onRate={rated}
        onSubmit={({ rating, reasons, note }) =>
          trackFeedback('jaina_response_feedback_sent', {
            message_id: messageId ?? null,
            rating: String(rating),
            reasons: reasons.join(','),
            note,
          })
        }
        onUndo={() =>
          trackFeedback('jaina_response_feedback_undone', { message_id: messageId ?? null })
        }
        onCopy={handleCopy}
        onRegenerate={onRegenerate}
      />
    </div>
  );
}

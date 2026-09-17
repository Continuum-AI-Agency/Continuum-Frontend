'use client';

import { Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from '@/components/ui/message';
import { MessageScrollerItem } from '@/components/ui/message-scroller';
import { cn } from '@/lib/utils';

export type ChatRole = 'user' | 'assistant' | 'system';

// The agent's turn is full-bleed text (its cards and reports need the column), so it
// cannot rely on a bubble to say who is speaking. Identity comes from the mark + name
// instead: a reader scanning the transcript sees the question, then who answered it.
const DEFAULT_ASSISTANT_SPEAKER = 'Continuum';

export type ChatMessageProps = {
  id: string;
  role: ChatRole;
  avatar?: ReactNode;
  /** Name shown above an assistant turn. Defaults to the product's agent name. */
  speaker?: string;
  header?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
};

export function ChatMessage({
  id,
  role,
  avatar,
  speaker = DEFAULT_ASSISTANT_SPEAKER,
  header,
  footer,
  className,
  children,
}: ChatMessageProps) {
  const isUser = role === 'user';
  const speakerMark = avatar ?? (isUser ? null : <Sparkles className="size-3.5" aria-hidden />);

  return (
    // No scrollAnchor: an anchored item makes the scroller park it at the top of the viewport and
    // re-park it on every resize, which is what stranded a streaming answer above an empty screen.
    // messageId stays so the minimap can still jump here and report this turn as on-screen.
    <MessageScrollerItem messageId={id}>
      <Message align={isUser ? 'end' : 'start'} className={className}>
        {speakerMark ? (
          // Top-aligned, not bottom: an answer can run for screens, and an avatar parked at
          // its foot no longer marks where the turn began.
          <MessageAvatar
            className={cn(
              'self-start',
              !avatar && !isUser && 'mt-0.5 size-6 min-w-6 bg-primary/10 text-primary',
            )}
          >
            {speakerMark}
          </MessageAvatar>
        ) : null}
        <MessageContent>
          {header ? (
            <MessageHeader>{header}</MessageHeader>
          ) : isUser ? null : (
            <MessageHeader className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground/80">
              {speaker}
            </MessageHeader>
          )}
          {/* Assistant turns render ghost: no bubble chrome, full width, so the inline cards and
              reports below can use the whole column instead of being boxed inside a bubble. The
              user's turn keeps a tinted bubble — the one surface in the transcript that is theirs. */}
          <Bubble
            variant={isUser ? 'tinted' : 'ghost'}
            align={isUser ? 'end' : 'start'}
            className={cn(!isUser && 'w-full max-w-full')}
          >
            <BubbleContent className={cn(!isUser && 'w-full min-w-0')}>{children}</BubbleContent>
          </Bubble>
          {footer ? <MessageFooter>{footer}</MessageFooter> : null}
        </MessageContent>
      </Message>
    </MessageScrollerItem>
  );
}

'use client';

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

export type ChatMessageProps = {
  id: string;
  role: ChatRole;
  // Anchored turns are where the viewport parks on arrival and on resume. The reader's own message
  // is the natural anchor for a turn: it puts the question at the top and the answer beneath it.
  anchor?: boolean;
  avatar?: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
};

export function ChatMessage({
  id,
  role,
  anchor = false,
  avatar,
  header,
  footer,
  className,
  children,
}: ChatMessageProps) {
  const isUser = role === 'user';

  return (
    <MessageScrollerItem messageId={id} scrollAnchor={anchor}>
      <Message align={isUser ? 'end' : 'start'} className={className}>
        {avatar ? <MessageAvatar>{avatar}</MessageAvatar> : null}
        <MessageContent>
          {header ? <MessageHeader>{header}</MessageHeader> : null}
          {/* Assistant turns render ghost: no bubble chrome, full width, so the inline cards and
              reports below can use the whole column instead of being boxed inside a bubble. */}
          <Bubble
            variant={isUser ? 'muted' : 'ghost'}
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

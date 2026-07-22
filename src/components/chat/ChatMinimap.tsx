'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  useMessageScroller,
  useMessageScrollerScrollable,
  useMessageScrollerVisibility,
} from '@/components/ui/message-scroller';
import { cn } from '@/lib/utils';
import { anchorLabel, type TranscriptAnchor, type TranscriptAnchorKind } from './anchors';

const TICK_SIZE: Record<TranscriptAnchorKind, string> = {
  user: 'h-px w-2',
  assistant: 'h-px w-3.5',
  milestone: 'h-0.5 w-5',
};

export type ChatMinimapProps = {
  anchors: readonly TranscriptAnchor[];
  className?: string;
};

export function ChatMinimap({ anchors, className }: ChatMinimapProps) {
  const { scrollToMessage, scrollToStart, scrollToEnd } = useMessageScroller();
  const { currentAnchorId, visibleMessageIds } = useMessageScrollerVisibility();
  const scrollable = useMessageScrollerScrollable();
  const activeTickRef = useRef<HTMLButtonElement>(null);

  // The rail is a scroller in its own right once a session gets long; keep the reader's position
  // on it rather than truncating the tick list and pretending the older turns do not exist.
  useEffect(() => {
    activeTickRef.current?.scrollIntoView({ block: 'nearest' });
  }, []);

  const visible = new Set(visibleMessageIds);

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-y-0 right-0 z-20 flex flex-col items-end justify-center gap-2 py-3 pr-2',
        className,
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Scroll to start of conversation"
        disabled={!scrollable.start}
        onClick={() => scrollToStart()}
        className="pointer-events-auto text-muted-foreground disabled:opacity-0"
      >
        <ChevronUp aria-hidden="true" />
      </Button>

      <nav
        aria-label="Conversation checkpoints"
        className="pointer-events-auto flex min-h-0 flex-col items-end overflow-y-auto scrollbar-none"
      >
        {anchors.map((anchor) => {
          const isCurrent = anchor.id === currentAnchorId;
          const isVisible = visible.has(anchor.id);

          return (
            <button
              key={anchor.id}
              ref={isCurrent ? activeTickRef : undefined}
              type="button"
              aria-label={anchorLabel(anchor)}
              aria-current={isCurrent ? 'true' : undefined}
              onClick={() => scrollToMessage(anchor.id)}
              className="group flex h-2.5 w-6 shrink-0 items-center justify-end"
            >
              <span
                className={cn(
                  'rounded-full transition-all duration-150 group-hover:w-6 group-hover:bg-foreground',
                  TICK_SIZE[anchor.kind],
                  isCurrent
                    ? 'bg-foreground'
                    : isVisible
                      ? 'bg-muted-foreground'
                      : 'bg-muted-foreground/35',
                )}
              />
            </button>
          );
        })}
      </nav>

      <div className="pointer-events-auto flex items-center gap-1.5">
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          aria-label="Scroll to latest"
          disabled={!scrollable.end}
          onClick={() => scrollToEnd()}
          className="rounded-full shadow-sm disabled:opacity-0"
        >
          <ChevronDown aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

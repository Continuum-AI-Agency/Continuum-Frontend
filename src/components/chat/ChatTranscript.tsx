'use client';

import { Loader2 } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScrollerScrollable,
} from '@/components/ui/message-scroller';
import { cn } from '@/lib/utils';
import type { TranscriptAnchor } from './anchors';
import { ChatMinimap } from './ChatMinimap';

// Peek of the previous turn kept above a newly anchored one. Without it a new response lands flush
// against the top edge and the reader loses the question it answers.
const PREVIOUS_ITEM_PEEK_PX = 64;

export type ChatTranscriptProps = {
  anchors: readonly TranscriptAnchor[];
  isStreaming?: boolean;
  showMinimap?: boolean;
  // Older history exists behind a cursor. The transcript renders a sentinel above the first
  // message and asks for the next page when the reader reaches it.
  hasEarlier?: boolean;
  isLoadingEarlier?: boolean;
  onLoadEarlier?: () => void;
  className?: string;
  contentClassName?: string;
  children: ReactNode;
};

export function ChatTranscript({
  anchors,
  isStreaming = false,
  showMinimap = true,
  hasEarlier = false,
  isLoadingEarlier = false,
  onLoadEarlier,
  className,
  contentClassName,
  children,
}: ChatTranscriptProps) {
  return (
    <MessageScrollerProvider
      autoScroll={isStreaming}
      defaultScrollPosition="last-anchor"
      scrollPreviousItemPeek={PREVIOUS_ITEM_PEEK_PX}
    >
      <MessageScroller className={className}>
        {/* preserveScrollOnPrepend keeps the reader's position fixed while an older page is
            spliced in above them, so "load earlier" never yanks the viewport. */}
        <MessageScrollerViewport preserveScrollOnPrepend>
          <MessageScrollerContent
            className={cn(
              'mx-auto w-full max-w-[1600px] gap-6 px-4 py-4 pr-10 md:px-6 md:pr-12 lg:px-8 lg:pr-14',
              contentClassName,
            )}
          >
            {hasEarlier && onLoadEarlier ? (
              <LoadEarlierSentinel loading={isLoadingEarlier} onReached={onLoadEarlier} />
            ) : null}
            {children}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        {showMinimap && anchors.length > 1 ? <ChatMinimap anchors={anchors} /> : null}
      </MessageScroller>
    </MessageScrollerProvider>
  );
}

function LoadEarlierSentinel({ loading, onReached }: { loading: boolean; onReached: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const scrollable = useMessageScrollerScrollable();
  const onReachedRef = useRef(onReached);
  onReachedRef.current = onReached;

  // The sentinel sits at the very top of the content, so on mount — before the scroller has
  // positioned itself at the last anchor — it is briefly on screen and the observer fires
  // immediately, paging in the entire history the reader never asked for. Arm it only once the
  // transcript has actually been scrolled away from the top, and latch that: scrolling back up to
  // the top makes `start` false again, which is exactly when we DO want to load.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (scrollable.start) setArmed(true);
  }, [scrollable.start]);

  useEffect(() => {
    const node = ref.current;
    if (!node || !armed || loading || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onReachedRef.current();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [armed, loading]);

  // A real button, not a passive marker: when the first page does not overflow the viewport there
  // is nothing to scroll, so intersection alone would never let the reader reach older messages.
  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onReachedRef.current()}
      disabled={loading}
      className="flex justify-center py-2 text-xs text-muted-foreground hover:text-foreground"
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          Loading earlier messages…
        </span>
      ) : (
        <span>Load earlier messages</span>
      )}
    </button>
  );
}

'use client';

import { ArrowDown, Loader2 } from 'lucide-react';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type UIEvent as ReactUIEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScrollerScrollable,
} from '@/components/ui/message-scroller';
import { cn } from '@/lib/utils';
import type { TranscriptAnchor } from './anchors';
import { ChatMinimap } from './ChatMinimap';

// How close to the live edge counts as "back at the bottom". Matches the scroller's own
// scrollEdgeThreshold so the two cannot disagree about where the bottom is.
const LIVE_EDGE_PX = 8;

// Keys that move the reader up the transcript. Paging down or hitting End travels toward the
// live edge, so those resume follow through the scroll handler instead of suspending it.
const UPWARD_KEYS = new Set(['ArrowUp', 'PageUp', 'Home']);

export type ChatTranscriptProps = {
  anchors: readonly TranscriptAnchor[];
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
  showMinimap = true,
  hasEarlier = false,
  isLoadingEarlier = false,
  onLoadEarlier,
  className,
  contentClassName,
  children,
}: ChatTranscriptProps) {
  // The gutter exists solely to keep the minimap off the text. Reserving it unconditionally
  // narrowed every transcript that has no minimap — including the composer's own column.
  const hasMinimap = showMinimap && anchors.length > 1;

  // Who owns "follow the live edge".
  //
  // The transcript follows the bottom rather than parking a turn at the top: `last-anchor` put the
  // newest anchored turn flush against the top edge and inflated a spacer beneath it to hold it
  // there, so a short answer read as one line stranded above an empty screen, and every content
  // resize re-anchored it mid-stream.
  //
  // The latch is ours because the scroller's only route back into follow mode fires whenever the
  // viewport is within its 8px edge threshold — and while an answer is still shorter than the
  // viewport, scrollTop 0 IS the bottom. Left to the scroller, a reader who scrolls up in the first
  // moments of a turn has that intent silently discarded and is glued to the live edge for the rest
  // of the run. Suspending on the gesture and resuming only on a deliberate return downward is what
  // makes "scrolled up" stick regardless of how much has been generated so far.
  const [follow, setFollow] = useState(true);
  const lastScrollTopRef = useRef(0);

  const suspendFollow = useCallback(() => setFollow(false), []);

  const suspendOnUpwardWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    if (event.deltaY < 0) setFollow(false);
  }, []);

  const suspendOnUpwardKey = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (UPWARD_KEYS.has(event.key)) setFollow(false);
  }, []);

  const resumeFollowAtLiveEdge = useCallback((event: ReactUIEvent<HTMLDivElement>) => {
    const node = event.currentTarget;
    const movedDown = node.scrollTop > lastScrollTopRef.current + 0.5;
    lastScrollTopRef.current = node.scrollTop;
    // Travelling DOWN to the edge is the resume signal, never proximity on its own: on a short
    // transcript the reader is within the threshold while sitting at the top.
    if (movedDown && node.scrollHeight - node.scrollTop - node.clientHeight <= LIVE_EDGE_PX) {
      setFollow(true);
    }
  }, []);

  return (
    <MessageScrollerProvider autoScroll={follow} defaultScrollPosition="end">
      {/* Mirrors the latch the way the scroller mirrors its own state in data-scrollable, so
          "is this transcript following the live edge" is inspectable rather than inferred. */}
      <MessageScroller className={className} data-follow={follow ? 'true' : 'false'}>
        {/* preserveScrollOnPrepend keeps the reader's position fixed while an older page is
            spliced in above them, so "load earlier" never yanks the viewport. */}
        <MessageScrollerViewport
          preserveScrollOnPrepend
          onKeyDown={suspendOnUpwardKey}
          onScroll={resumeFollowAtLiveEdge}
          onTouchMove={suspendFollow}
          onWheel={suspendOnUpwardWheel}
        >
          <MessageScrollerContent
            className={cn(
              'mx-auto w-full max-w-[1600px] gap-6 px-4 py-4 md:px-6 lg:px-8',
              hasMinimap && 'pr-10 md:pr-12 lg:pr-14',
              contentClassName,
            )}
          >
            {hasEarlier && onLoadEarlier ? (
              <LoadEarlierSentinel loading={isLoadingEarlier} onReached={onLoadEarlier} />
            ) : null}
            {children}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        {hasMinimap ? <ChatMinimap anchors={anchors} /> : null}
        <MessageScrollerButton direction="end" size="sm" className="gap-1.5 rounded-full px-3">
          <ArrowDown className="size-3.5" aria-hidden="true" />
          Jump to latest
        </MessageScrollerButton>
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
  // positioned itself at the bottom — it is briefly on screen and the observer fires
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

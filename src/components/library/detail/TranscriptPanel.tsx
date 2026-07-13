'use client';

// The spoken track of a video, as a scannable list of timecoded lines. Clicking
// a line seeks the stage player to the moment it was said — which is the whole
// point when a search for a spoken phrase is what brought you here. The line
// under the playhead highlights and scrolls itself into view as the video runs.

import { Check, Copy, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatTimecode } from './annotationGeometry';
import type { PlaybackClock } from './playbackClock';
import {
  activeSegmentAt,
  type TranscriptView,
  transcriptClipboardText,
} from './transcriptSegments';

type Props = {
  view: TranscriptView;
  loading: boolean;
  error: string | null;
  source: string | null;
  clock: PlaybackClock;
  onSeek: (timeMs: number) => void;
};

// timeupdate fires ~4x/second; the highlight only ever changes when the playhead
// crosses a line boundary. Coalescing through one rAF and re-rendering only on an
// index CHANGE keeps the panel from re-rendering on ticks that change nothing.
function useActiveSegmentIndex(clock: PlaybackClock, view: TranscriptView): number {
  const [activeIndex, setActiveIndex] = useState(-1);
  const segments = view.status === 'ready' ? view.segments : null;

  useEffect(() => {
    if (!segments || segments.length === 0) {
      setActiveIndex(-1);
      return;
    }
    let frame = 0;
    let pending = clock.get();

    const flush = () => {
      frame = 0;
      const next = activeSegmentAt(pending, segments);
      setActiveIndex((current) => (current === next ? current : next));
    };

    flush();
    const unsubscribe = clock.subscribe((timeMs) => {
      pending = timeMs;
      if (frame === 0) frame = requestAnimationFrame(flush);
    });

    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      unsubscribe();
    };
  }, [clock, segments]);

  return activeIndex;
}

function CopyTranscriptButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="ml-auto h-7 gap-1.5 text-xs text-muted-foreground"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
    >
      {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
      {copied ? 'Copied' : 'Copy transcript'}
    </Button>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-6 text-center text-xs text-muted-foreground">{children}</p>;
}

export function TranscriptPanel({ view, loading, error, source, clock, onSeek }: Props) {
  const activeIndex = useActiveSegmentIndex(clock, view);
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (activeIndex < 0) return;
    lineRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeIndex]);

  const registerLine = useCallback(
    (index: number) => (element: HTMLButtonElement | null) => {
      lineRefs.current[index] = element;
    },
    [],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }
  if (error) {
    return <EmptyState>{error}</EmptyState>;
  }
  if (view.status === 'untranscribed') {
    return <EmptyState>This video hasn&apos;t been transcribed yet.</EmptyState>;
  }
  if (view.status === 'silent') {
    return <EmptyState>Analyzed — no speech in this video.</EmptyState>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5">
        <span className="text-2xs uppercase tracking-wide text-muted-foreground/70">
          {source ?? 'transcript'}
        </span>
        <CopyTranscriptButton text={transcriptClipboardText(view)} />
      </div>

      {view.segments.length === 0 ? (
        // Transcribed without timecodes: readable, but there is no moment to jump to.
        <p className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap px-3 py-2.5 text-xs leading-relaxed text-foreground/90">
          {view.text}
        </p>
      ) : (
        <ol className="min-h-0 flex-1 overflow-y-auto py-1">
          {view.segments.map((segment, index) => (
            <li key={`${segment.startMs}-${index}`}>
              <button
                ref={registerLine(index)}
                type="button"
                onClick={() => onSeek(segment.startMs)}
                aria-current={index === activeIndex ? 'true' : undefined}
                className={cn(
                  'flex w-full gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-muted/60',
                  index === activeIndex && 'bg-primary/10',
                )}
              >
                <span
                  className={cn(
                    'shrink-0 pt-px text-2xs tabular-nums text-muted-foreground',
                    index === activeIndex && 'font-medium text-primary',
                  )}
                >
                  {formatTimecode(segment.startMs)}
                </span>
                <span
                  className={cn(
                    'min-w-0 text-xs leading-relaxed text-muted-foreground',
                    index === activeIndex && 'text-foreground',
                  )}
                >
                  {segment.text}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

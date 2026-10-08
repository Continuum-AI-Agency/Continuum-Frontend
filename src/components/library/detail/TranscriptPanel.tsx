'use client';

// The spoken track of a video or audio file, as a scannable list of timecoded
// lines. Clicking a line seeks the stage player to the moment it was said — which
// is the whole point when a search for a spoken phrase is what brought you here.
// The line under the playhead highlights and scrolls itself into view as it plays.
// Shift+click selects a span of lines, and a range comment can be written on it —
// the same time+endMs comment the player's I/O keys make. Export hands the same
// lines on as SRT / WebVTT captions or plain text.

import { Check, Copy, Loader2, MessageSquarePlus, X } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { type TranscriptExportFormat, toSrt, toTxt, toVtt } from '@/lib/library/transcriptExport';
import { cn } from '@/lib/utils';
import { formatTimecode, formatTimecodeRange } from './annotationGeometry';
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
  /** BCP-47 code of the spoken language, when the transcriber reported one. */
  language?: string | null;
  /** The asset's file name; exports are saved as `<stem>.<ext>`. */
  fileName: string;
  clock: PlaybackClock;
  onSeek: (timeMs: number) => void;
  /** The composer for a comment on the selected lines; omitted, the panel is read-only. */
  renderRangeComposer?: (range: TranscriptRange) => ReactNode;
};

export type TranscriptRange = { timeMs: number; endMs: number | null; clear: () => void };

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

function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(undefined, { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

const EXPORT_MIME: Record<TranscriptExportFormat, string> = {
  srt: 'application/x-subrip',
  vtt: 'text/vtt',
  txt: 'text/plain',
};

function downloadTranscript(
  view: Extract<TranscriptView, { status: 'ready' }>,
  format: TranscriptExportFormat,
  fileName: string,
  language: string | null,
) {
  const body =
    format === 'srt'
      ? toSrt(view.segments)
      : format === 'vtt'
        ? toVtt(view.segments, language)
        : toTxt(view.text, view.segments);
  const url = URL.createObjectURL(
    new Blob([body], { type: `${EXPORT_MIME[format]};charset=utf-8` }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${fileName.replace(/\.[^.]+$/, '') || 'transcript'}.${format}`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-6 text-center text-xs text-muted-foreground">{children}</p>;
}

export function TranscriptPanel({
  view,
  loading,
  error,
  source,
  language = null,
  fileName,
  clock,
  onSeek,
  renderRangeComposer,
}: Props) {
  const activeIndex = useActiveSegmentIndex(clock, view);
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // The last line clicked anchors a Shift+click span.
  const [selection, setSelection] = useState<{ anchor: number; end: number } | null>(null);
  const [composing, setComposing] = useState(false);
  const clearSelection = useCallback(() => {
    setSelection(null);
    setComposing(false);
  }, []);

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
    return <EmptyState>This recording hasn&apos;t been transcribed yet.</EmptyState>;
  }
  if (view.status === 'silent') {
    return <EmptyState>Analyzed — no speech in this recording.</EmptyState>;
  }
  // Captions need timecodes; a transcript without them only exports as text.
  const formats: TranscriptExportFormat[] =
    view.segments.length > 0 ? ['srt', 'vtt', 'txt'] : ['txt'];
  const low = selection ? Math.min(selection.anchor, selection.end) : -1;
  const high = selection ? Math.max(selection.anchor, selection.end) : -1;
  const first = view.segments[low];
  const last = view.segments[high];
  const range =
    first && last
      ? { timeMs: first.startMs, endMs: last.endMs > first.startMs ? last.endMs : null }
      : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5">
        <span className="text-2xs uppercase tracking-wide text-muted-foreground/70">
          {source ?? 'transcript'}
        </span>
        {language ? (
          <span data-testid="transcript-language" className="text-2xs text-muted-foreground">
            {languageName(language)}
          </span>
        ) : null}
        <CopyTranscriptButton text={transcriptClipboardText(view)} />
      </div>
      <fieldset className="flex shrink-0 items-center gap-1 border-b border-border px-3 py-1">
        <legend className="sr-only">Export transcript</legend>
        <span className="text-2xs text-muted-foreground" aria-hidden="true">
          Export
        </span>
        {formats.map((format) => (
          <Button
            key={format}
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-2xs uppercase text-muted-foreground"
            aria-label={`Export transcript as ${format.toUpperCase()}`}
            data-testid={`transcript-export-${format}`}
            onClick={() => downloadTranscript(view, format, fileName, language)}
          >
            {format}
          </Button>
        ))}
      </fieldset>

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
                data-segment-index={index}
                data-selected={index >= low && index <= high ? 'true' : undefined}
                onClick={(event) => {
                  onSeek(segment.startMs);
                  if (!renderRangeComposer) return;
                  setComposing(false);
                  setSelection((current) =>
                    event.shiftKey && current
                      ? { anchor: current.anchor, end: index }
                      : { anchor: index, end: index },
                  );
                }}
                aria-current={index === activeIndex ? 'true' : undefined}
                className={cn(
                  'flex w-full gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-muted/60',
                  index === activeIndex && 'bg-primary/10',
                  index >= low && index <= high && 'bg-amber-400/15 hover:bg-amber-400/20',
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
      {renderRangeComposer && range ? (
        <div
          data-testid="transcript-range-bar"
          data-range-start={range.timeMs}
          data-range-end={range.endMs ?? ''}
          className="shrink-0 border-t border-border px-3 py-2"
        >
          {composing ? (
            renderRangeComposer({ ...range, clear: clearSelection })
          ) : (
            <div className="flex items-center gap-2">
              <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-2xs tabular-nums text-amber-700 dark:text-amber-300">
                {formatTimecodeRange(range.timeMs, range.endMs)}
              </span>
              <span className="text-2xs text-muted-foreground">Shift+click to extend</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="ml-auto h-7 text-xs"
                data-testid="transcript-comment-range"
                onClick={() => setComposing(true)}
              >
                <MessageSquarePlus className="size-3.5" />
                Comment
              </Button>
              <button
                type="button"
                aria-label="Clear the selected lines"
                onClick={clearSelection}
                className="rounded-sm p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

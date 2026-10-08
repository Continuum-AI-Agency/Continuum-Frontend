'use client';

// The comment list an editor keeps beside the NLE. Every timed comment on the
// version, in timeline order, labelled with the file's own SMPTE source timecode
// (start timecode + frame, drop-frame when the file counts that way) so it can be
// typed straight into the editor's timecode field — click one to copy it. Resolve
// boxes write through the same path as the Library, the list updates live, and the
// four marker exports are one click each, on a timeline starting at 01:00:00:00
// or at the clip's own timecode.

import type { MediaComment } from '@continuum/contracts';
import { Check, Copy, Download, ExternalLink } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAssetComments } from '@/components/library/detail/useAssetComments';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/components/ui/toast-imperative';
import {
  COMMENT_EXPORT_FORMATS,
  type CommentExportFormat,
  frameAtMs,
  sourceTimecodeAtMs,
  TIMELINE_STARTS,
  type TimelineStart,
} from '@/lib/library/commentExport';
import {
  buildCommentThreads,
  commentExportHref,
  displayNameFromEmail,
  downloadFromRoute,
} from '@/lib/library/comments';
import { cn } from '@/lib/utils';
import { useAssetTiming } from './useAssetTiming';

const EXPORT_BUTTONS: Record<CommentExportFormat, string> = {
  csv: 'CSV',
  edl: 'Resolve EDL',
  fcpxml: 'FCPXML',
  premiere: 'Premiere XML',
};

const TIMELINE_LABELS: Record<TimelineStart, string> = {
  hour: '01:00:00:00',
  source: 'clip timecode',
};

type Props = { brandId: string; assetId: string; versionId: string | null };

function authorOf(comment: MediaComment): string {
  return comment.authorName ?? displayNameFromEmail(comment.authorEmail) ?? 'Member';
}

export function EditorView({ brandId, assetId, versionId }: Props) {
  const { comments, loading, error, setResolved } = useAssetComments(brandId, assetId);
  const timing = useAssetTiming({ brandId, assetId, versionId });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineStart>('hour');

  // Timed threads of this version. A legacy comment with no version pin belongs to
  // the head, which is what this view shows when no version is named.
  const rows = useMemo(() => {
    const threads = buildCommentThreads(comments);
    const onVersion = (root: MediaComment) =>
      timing
        ? (root.versionId ?? (versionId ? null : timing.versionId)) === timing.versionId
        : false;
    return [...threads.open, ...threads.resolved]
      .filter((thread) => thread.root.annotation?.kind === 'time' && onVersion(thread.root))
      .sort((a, b) => {
        const at = a.root.annotation?.kind === 'time' ? a.root.annotation.timeMs : 0;
        const bt = b.root.annotation?.kind === 'time' ? b.root.annotation.timeMs : 0;
        return at - bt;
      });
  }, [comments, timing, versionId]);

  const source = timing ? { startFrame: timing.startFrame, dropFrame: timing.dropFrame } : null;
  const tc = (ms: number) =>
    timing && source ? sourceTimecodeAtMs(ms, timing.frameRate, source) : '—';

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1500);
    } catch {
      toast.error('Copying needs clipboard permission in this window');
    }
  };

  const exportAs = (format: CommentExportFormat) =>
    downloadFromRoute(
      commentExportHref({
        brandId,
        assetId,
        versionId: timing?.versionId ?? versionId,
        format,
        timeline,
      }),
    ).catch((err: unknown) => toast.error(`Export failed · ${(err as Error).message}`));

  const openCount = rows.filter((row) => !row.root.resolvedAt).length;

  return (
    <main
      className="flex min-h-dvh flex-col bg-background text-foreground"
      data-testid="editor-view"
      data-start-timecode={timing?.startTimecode ?? ''}
    >
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-3 py-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">
            {timing?.assetName ?? 'Loading…'}
          </h1>
          <a
            href={`/library?assetId=${assetId}`}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground"
            title="Open in the Library"
          >
            <ExternalLink className="size-3.5" />
          </a>
        </div>
        <p className="mt-0.5 text-2xs tabular-nums text-muted-foreground">
          {timing
            ? `${(timing.frameRate.num / timing.frameRate.den).toFixed(3)} fps · starts ${timing.startTimecode}${timing.dropFrame ? ' (drop-frame)' : ''}`
            : 'Reading the file’s timecode…'}{' '}
          · {openCount} open
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <label className="inline-flex items-center gap-1 text-2xs text-muted-foreground">
            Timeline starts at
            <select
              data-testid="editor-timeline-start"
              value={timeline}
              onChange={(event) => setTimeline(event.target.value as TimelineStart)}
              className="rounded-md border border-border bg-background px-1 py-0.5 text-2xs text-foreground"
            >
              {TIMELINE_STARTS.map((start) => (
                <option key={start} value={start}>
                  {TIMELINE_LABELS[start]}
                </option>
              ))}
            </select>
          </label>
          {COMMENT_EXPORT_FORMATS.map((format) => (
            <button
              key={format}
              type="button"
              data-editor-export={format}
              disabled={!timing}
              onClick={() => void exportAs(format)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-2xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              <Download className="size-3" />
              {EXPORT_BUTTONS[format]}
            </button>
          ))}
        </div>
      </header>

      {error ? <p className="px-3 py-2 text-xs text-destructive">{error}</p> : null}
      {loading ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">Loading comments…</p>
      ) : rows.length === 0 ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">
          No timed comments on this version.
        </p>
      ) : (
        <ol className="divide-y divide-border">
          {rows.map(({ root, replies }) => {
            if (root.annotation?.kind !== 'time') return null;
            const { timeMs, endMs } = root.annotation;
            const tcIn = tc(timeMs);
            const resolved = Boolean(root.resolvedAt);
            return (
              <li
                key={root.id}
                data-editor-comment-id={root.id}
                data-timecode={tcIn}
                data-frame={timing ? frameAtMs(timeMs, timing.frameRate) : ''}
                className={cn('flex gap-2 px-3 py-2', resolved && 'opacity-60')}
              >
                <Checkbox
                  aria-label={resolved ? 'Reopen comment' : 'Resolve comment'}
                  checked={resolved}
                  onCheckedChange={(checked) => void setResolved(root.id, checked === true)}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    data-copy-timecode={tcIn}
                    onClick={() => void copy(root.id, tcIn)}
                    title="Copy timecode"
                    className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs tabular-nums text-primary hover:bg-primary/20"
                  >
                    {tcIn}
                    {endMs ? <span className="text-primary/70">–{tc(endMs)}</span> : null}
                    {copiedId === root.id ? (
                      <Check className="size-3" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                  </button>
                  <p className="mt-1 whitespace-pre-wrap break-words text-xs">
                    <span className="font-medium">{authorOf(root)}:</span> {root.body}
                  </p>
                  {replies.length > 0 ? (
                    <p className="mt-0.5 text-2xs text-muted-foreground">
                      {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}

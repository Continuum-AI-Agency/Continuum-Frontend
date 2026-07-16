'use client';

import type { VideoCreativeInsights } from '@continuum/contracts';

function timecode(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function VideoInsightsPanel({
  insights,
  onSeek,
}: {
  insights: VideoCreativeInsights;
  onSeek: (ms: number) => void;
}) {
  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
      <section>
        <p className="text-3xs uppercase tracking-wide text-muted-foreground">Creative summary</p>
        <p className="mt-1 text-xs leading-relaxed text-foreground">{insights.summary}</p>
      </section>

      <section className="rounded-md border border-border p-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-foreground">Opening hook</p>
          <button
            type="button"
            className="text-2xs tabular-nums text-muted-foreground hover:text-foreground"
            onClick={() => onSeek(insights.hook.startMs)}
          >
            {timecode(insights.hook.startMs)}–{timecode(insights.hook.endMs)}
          </button>
        </div>
        {insights.hook.archetype ? (
          <p className="mt-1 text-3xs uppercase tracking-wide text-muted-foreground">
            {insights.hook.archetype.replaceAll('_', ' ')}
          </p>
        ) : null}
        {insights.hook.text ? (
          <p className="mt-1.5 text-xs leading-relaxed text-foreground">“{insights.hook.text}”</p>
        ) : null}
        {insights.hook.strengths.length > 0 ? (
          <p className="mt-2 text-2xs text-emerald-600 dark:text-emerald-400">
            Strengths: {insights.hook.strengths.join(' · ')}
          </p>
        ) : null}
        {insights.hook.risks.length > 0 ? (
          <p className="mt-1 text-2xs text-amber-600 dark:text-amber-400">
            Risks: {insights.hook.risks.join(' · ')}
          </p>
        ) : null}
      </section>

      {insights.chapters.length > 0 ? (
        <section>
          <p className="text-3xs uppercase tracking-wide text-muted-foreground">Chapters</p>
          <ol className="mt-1.5 space-y-1">
            {insights.chapters.map((chapter) => (
              <li key={`${chapter.startMs}:${chapter.title}`}>
                <button
                  type="button"
                  className="w-full rounded-md border border-border p-2 text-left hover:bg-muted/50"
                  onClick={() => onSeek(chapter.startMs)}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-medium text-foreground">{chapter.title}</span>
                    <span className="text-3xs tabular-nums text-muted-foreground">
                      {timecode(chapter.startMs)}
                    </span>
                  </span>
                  {chapter.summary ? (
                    <span className="mt-0.5 block text-2xs leading-relaxed text-muted-foreground">
                      {chapter.summary}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

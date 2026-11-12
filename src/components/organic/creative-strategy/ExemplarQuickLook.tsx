'use client';

import { useLocale, useTranslations } from 'next-intl';

// Hover-card body for a single top creative behind a "What's Working" insight.
// Self-contained: renders straight from the joined ExemplarView (thumbnail +
// caption snippet + its own measured metric + captured date + live permalink).
// PostQuickLook can't be reused here — an exemplar has no full OrganicPost.

import { ExternalLink } from 'lucide-react';
import type { UiLocale } from '@/i18n/config';
import type { ExemplarView } from '@/lib/organic/creative-strategy-rows';
import { formatMetricValue } from '@/lib/organic/creative-strategy-rows';

function formatCaptured(capturedAt: string | null, locale: UiLocale): string | null {
  if (!capturedAt) return null;
  const date = new Date(capturedAt);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(locale);
}

export function ExemplarQuickLook({ exemplar }: { exemplar: ExemplarView }) {
  const uiText = useTranslations('organic');
  const uiLocale = useLocale();
  const captured = formatCaptured(exemplar.capturedAt, uiLocale);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="rounded bg-accent/15 px-1.5 py-0.5 text-2xs font-medium uppercase tracking-wide text-accent">
            {uiText('contentKindLabel', { kind: exemplar.kind })}
          </span>
          {exemplar.surface ? (
            <span className="text-2xs uppercase tracking-wide text-muted-foreground">
              {uiText('creativeSurface', { surface: exemplar.surface })}
            </span>
          ) : null}
        </div>
        {captured ? <span className="text-2xs text-muted-foreground">{captured}</span> : null}
      </div>

      {exemplar.thumbnailUrl ? (
        // biome-ignore lint/performance/noImgElement: transient signed thumbnails, not Next-optimizable
        <img
          src={exemplar.thumbnailUrl}
          alt={exemplar.snippet ?? uiText('topContentKind', { kind: exemplar.kind })}
          className="max-h-44 w-full rounded-md border border-subtle object-cover"
          loading="lazy"
        />
      ) : null}

      {exemplar.metricValueLabel ? (
        <div className="flex items-baseline justify-between gap-2 border-t border-subtle pt-2">
          <span className="text-xs capitalize text-muted-foreground">
            {exemplar.metricName ?? uiText('metric_2d275a7')}
          </span>
          <span className="text-sm font-semibold tabular-nums">
            {formatMetricValue(exemplar.metric, uiLocale) ?? exemplar.metricValueLabel}
          </span>
        </div>
      ) : null}

      {exemplar.snippet?.trim().length ? (
        <p className="line-clamp-3 text-pretty text-xs leading-snug text-secondary">
          {exemplar.snippet}
        </p>
      ) : null}

      {exemplar.permalinkUrl ? (
        <a
          href={exemplar.permalinkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-accent transition-colors hover:text-foreground"
        >
          {uiText('open_post_92a0ae1')}
          <ExternalLink className="size-3" aria-hidden />
        </a>
      ) : null}
    </div>
  );
}

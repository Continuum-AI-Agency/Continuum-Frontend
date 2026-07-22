'use client';

import {
  BookOpen,
  FileText,
  ImageIcon,
  Lightbulb,
  LineChart,
  Sparkles,
  Target,
  TrendingUp,
  Video,
  Workflow,
} from 'lucide-react';
import React from 'react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import type { AgentMentionReference } from '@/lib/agent-references';
import { cn } from '@/lib/utils';

const URL_SPLIT_RE = /(https?:\/\/[^\s<>"]+)/;

type MentionifiedTextProps = {
  text: string;
  references?: AgentMentionReference[];
  className?: string;
  linkClassName?: string;
};

function buildMentionSplitRe(references: AgentMentionReference[]): RegExp | null {
  if (!references.length) return null;
  const tokens = [...new Set(references.map((r) => `@${r.label.trim().replace(/\s+/g, ' ')}`))];
  tokens.sort((a, b) => b.length - a.length);
  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`(${escaped.join('|')})`);
}

function readMetaString(meta: Record<string, unknown> | undefined, key: string): string | null {
  const value = meta?.[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function readMetaNumber(meta: Record<string, unknown> | undefined, key: string): number | null {
  const value = meta?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function typeLabel(type: AgentMentionReference['type']): string {
  switch (type) {
    case 'media_asset':
      return 'Media';
    case 'canvas_node':
      return 'Canvas';
    case 'skill':
      return 'Skill';
    case 'document':
      return 'Document';
    case 'trend':
      return 'Trend';
    case 'event':
      return 'Event';
    case 'question':
      return 'Question';
    case 'draft':
      return 'Draft';
    case 'campaign':
      return 'Campaign';
    case 'adset':
      return 'Ad set';
    case 'creative_insight':
      return "What's Working";
    case 'organic_insight':
      return 'Insight';
    case 'kpi':
      return 'Metric';
    case 'link':
      return 'Link';
    default:
      return 'Reference';
  }
}

function TypeIcon({
  type,
  className,
}: {
  type: AgentMentionReference['type'];
  className?: string;
}) {
  const cls = cn('size-3.5 shrink-0', className);
  switch (type) {
    case 'media_asset':
      return <ImageIcon className={cls} />;
    case 'canvas_node':
      return <Workflow className={cls} />;
    case 'skill':
      return <Sparkles className={cls} />;
    case 'document':
      return <BookOpen className={cls} />;
    case 'trend':
    case 'event':
      return <TrendingUp className={cls} />;
    case 'question':
      return <Lightbulb className={cls} />;
    case 'draft':
      return <FileText className={cls} />;
    case 'campaign':
    case 'adset':
      return <Target className={cls} />;
    case 'creative_insight':
    case 'organic_insight':
    case 'kpi':
      return <LineChart className={cls} />;
    default:
      return <FileText className={cls} />;
  }
}

function previewFromReference(ref: AgentMentionReference): {
  url: string | null;
  kind: 'image' | 'video' | 'canvas' | null;
} {
  const meta = ref.metadata as Record<string, unknown> | undefined;
  const url =
    readMetaString(meta, 'previewUrl') ??
    readMetaString(meta, 'thumbnailUrl') ??
    readMetaString(meta, 'signedUrl') ??
    null;
  const rawKind =
    readMetaString(meta, 'previewKind') ??
    readMetaString(meta, 'kind') ??
    readMetaString(meta, 'outputKind');
  const kind =
    rawKind === 'video' ? 'video' : rawKind === 'canvas' ? 'canvas' : url ? 'image' : null;
  return { url, kind };
}

function isVisualReference(ref: AgentMentionReference): boolean {
  return ref.type === 'media_asset' || ref.type === 'canvas_node';
}

function MentionHoverBody({ reference }: { reference: AgentMentionReference }) {
  const meta = (reference.metadata ?? {}) as Record<string, unknown>;
  const preview = previewFromReference(reference);
  const description =
    readMetaString(meta, 'description') ??
    readMetaString(meta, 'text') ??
    readMetaString(meta, 'recommendation') ??
    readMetaString(meta, 'performanceSummary') ??
    readMetaString(meta, 'relevanceToBrand') ??
    readMetaString(meta, 'summary') ??
    readMetaString(meta, 'captionPreview');
  const recommendation = readMetaString(meta, 'recommendation');
  const metricKey = readMetaString(meta, 'metricKey') ?? readMetaString(meta, 'metric');
  const metricLabel = readMetaString(meta, 'metricLabel');
  const value = readMetaNumber(meta, 'value');
  const delta = readMetaNumber(meta, 'delta') ?? readMetaNumber(meta, 'percentageChange');
  const platform = readMetaString(meta, 'platform');
  const category = readMetaString(meta, 'category');
  const severity = readMetaString(meta, 'severity');
  const kind = readMetaString(meta, 'kind');
  const surface = readMetaString(meta, 'surface');
  const intent = readMetaString(meta, 'intent');
  const tags = Array.isArray(meta.tags)
    ? (meta.tags as unknown[]).filter((t): t is string => typeof t === 'string').slice(0, 8)
    : [];
  const exemplarSnippets = Array.isArray(meta.exemplarSnippets)
    ? (meta.exemplarSnippets as unknown[])
        .filter((t): t is string => typeof t === 'string')
        .slice(0, 4)
    : [];
  const exemplarPermalinks = Array.isArray(meta.exemplarPermalinks)
    ? (meta.exemplarPermalinks as unknown[])
        .filter((t): t is string => typeof t === 'string' && t.startsWith('http'))
        .slice(0, 4)
    : [];
  const exemplarThumbnails = Array.isArray(meta.exemplarThumbnails)
    ? (meta.exemplarThumbnails as unknown[])
        .filter((t): t is string => typeof t === 'string')
        .slice(0, 4)
    : [];

  return (
    <div className="flex flex-col gap-2.5">
      {preview.url ? (
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
          {preview.kind === 'video' ? (
            <video
              src={preview.url}
              muted
              playsInline
              preload="metadata"
              className="h-full w-full object-cover"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary signed/CDN URLs
            <img src={preview.url} alt="" className="h-full w-full object-cover" />
          )}
        </div>
      ) : null}

      {exemplarThumbnails.length > 0 ? (
        <div className="flex gap-1.5 overflow-x-auto">
          {exemplarThumbnails.map((thumb, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${thumb}-${i}`}
              src={thumb}
              alt=""
              className="size-12 shrink-0 rounded-md border border-border/60 object-cover"
            />
          ))}
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium leading-snug text-foreground">
            {reference.label}
          </p>
          <p className="mt-0.5 text-2xs uppercase tracking-wide text-muted-foreground">
            {typeLabel(reference.type)}
            {kind ? ` · ${kind}` : null}
            {category ? ` · ${category}` : null}
          </p>
        </div>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <TypeIcon type={reference.type} />
        </span>
      </div>

      {description ? (
        <p className="line-clamp-4 text-xs leading-relaxed text-muted-foreground">{description}</p>
      ) : null}

      {recommendation && recommendation !== description ? (
        <p className="line-clamp-3 rounded-md bg-muted/60 px-2 py-1.5 text-xs leading-relaxed text-foreground/90">
          {recommendation}
        </p>
      ) : null}

      {/* KPI / metric snapshot */}
      {(reference.type === 'kpi' || metricKey || value != null || delta != null) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {intent === 'optimize_for' ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-2xs font-medium text-primary">
              Optimize for
            </span>
          ) : null}
          {metricLabel || metricKey ? (
            <span className="font-medium text-foreground">{metricLabel ?? metricKey}</span>
          ) : null}
          {value != null ? (
            <span className="tabular-nums text-muted-foreground">{value.toLocaleString()}</span>
          ) : null}
          {delta != null ? (
            <span
              className={cn(
                'tabular-nums',
                delta >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400',
              )}
            >
              {delta >= 0 ? '+' : ''}
              {delta.toFixed(1)}%
            </span>
          ) : null}
          {platform ? <span className="text-muted-foreground capitalize">{platform}</span> : null}
        </div>
      )}

      {/* What's Working / insight chips */}
      <div className="flex flex-wrap gap-1.5">
        {severity ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-2xs uppercase text-muted-foreground">
            {severity}
          </span>
        ) : null}
        {surface ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-2xs uppercase text-muted-foreground">
            {surface}
          </span>
        ) : null}
        {tags.map((tag) => (
          <span
            key={tag}
            className="rounded-md bg-muted/70 px-1.5 py-0.5 text-2xs text-muted-foreground"
          >
            {tag}
          </span>
        ))}
      </div>

      {exemplarSnippets.length > 0 ? (
        <div className="space-y-1 border-t border-border/60 pt-2">
          <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            Top creatives
          </p>
          {exemplarSnippets.map((snippet, i) => (
            <p key={`${snippet}-${i}`} className="line-clamp-2 text-xs text-muted-foreground">
              “{snippet}”
              {exemplarPermalinks[i] ? (
                <>
                  {' '}
                  <a
                    href={exemplarPermalinks[i]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-500 underline-offset-2 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    open
                  </a>
                </>
              ) : null}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function InlineMention({
  reference,
  fallbackLabel,
}: {
  reference?: AgentMentionReference;
  fallbackLabel: string;
}) {
  const label = reference?.label ?? fallbackLabel.replace(/^@/, '');
  const preview = reference ? previewFromReference(reference) : { url: null, kind: null };
  const visual = reference ? isVisualReference(reference) : false;
  const showInlineThumb = Boolean(visual && preview.url);

  const trigger = (
    <span className={cn('mention-inline', showInlineThumb && 'mention-inline--media')}>
      {showInlineThumb && preview.url ? (
        preview.kind === 'video' ? (
          <video
            src={preview.url}
            muted
            playsInline
            preload="metadata"
            className="mention-inline__thumb"
            aria-hidden
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- signed/CDN URLs
          <img src={preview.url} alt="" className="mention-inline__thumb" />
        )
      ) : reference ? (
        <span className="mention-inline__icon" aria-hidden>
          {preview.kind === 'video' ? (
            <Video className="size-3" />
          ) : (
            <TypeIcon type={reference.type} className="size-3" />
          )}
        </span>
      ) : null}
      <span className="mention-inline__label">{label}</span>
    </span>
  );

  if (!reference) return trigger;

  return (
    <HoverCard openDelay={160} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="inline align-baseline border-0 bg-transparent p-0 text-left"
          aria-label={`${typeLabel(reference.type)}: ${label}`}
        >
          {trigger}
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        side="top"
        className={cn(
          'w-80 p-3',
          (reference.type === 'media_asset' || reference.type === 'canvas_node') && 'p-3',
        )}
      >
        <MentionHoverBody reference={reference} />
      </HoverCardContent>
    </HoverCard>
  );
}

export function MentionifiedText({
  text,
  references,
  className,
  linkClassName,
}: MentionifiedTextProps) {
  const byToken = React.useMemo(() => {
    const map = new Map<string, AgentMentionReference>();
    for (const ref of references ?? []) {
      map.set(`@${ref.label.trim().replace(/\s+/g, ' ')}`, ref);
    }
    return map;
  }, [references]);

  const mentionSplitRe = React.useMemo(
    () => (references?.length ? buildMentionSplitRe(references) : null),
    [references],
  );

  const urlParts = React.useMemo(() => text.split(URL_SPLIT_RE), [text]);

  return (
    <span className={className}>
      {urlParts.flatMap((part, urlIdx) => {
        if (urlIdx % 2 === 1) {
          return (
            <a
              key={`u${urlIdx}`}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'break-all text-sky-500 underline underline-offset-2 hover:text-sky-400',
                linkClassName,
              )}
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
          );
        }

        if (!mentionSplitRe) return [part];

        return part.split(mentionSplitRe).map((seg, mIdx) => {
          if (mIdx % 2 !== 1) return seg;
          const ref = byToken.get(seg);
          return <InlineMention key={`u${urlIdx}m${mIdx}`} reference={ref} fallbackLabel={seg} />;
        });
      })}
    </span>
  );
}

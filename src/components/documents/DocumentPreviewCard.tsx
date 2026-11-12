'use client';

import { useLocale, useTranslations } from 'next-intl';

// Two coordinated Radix primitives drive the preview:
// - HoverCard renders a lightweight peek on mouseover/focus.
// - Popover renders the pinned, scrollable card on click; while pinned the
//   peek is suppressed so only one surface is ever visible.
// Both share a single trigger element (passed in as children).

import type { LucideIcon } from 'lucide-react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  Loader2,
  Trash2,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { DocumentView, ProgressLabel } from './types';
import { describeStep, formatBytes, kindLabel } from './types';

type DocumentPreviewCardProps = {
  doc: DocumentView;
  isPinned: boolean;
  onPinnedChange: (pinned: boolean) => void;
  onOpenInline: (storagePath: string) => void;
  onDownload: (storagePath: string) => void;
  onRemove: (documentId: string) => void;
  /** Single element: it becomes the hover-card trigger via Base UI `render`. */
  children: React.ReactElement;
};

export function DocumentPreviewCard({
  doc,
  isPinned,
  onPinnedChange,
  onOpenInline,
  onDownload,
  onRemove,
  children,
}: DocumentPreviewCardProps) {
  const [peekOpen, setPeekOpen] = useState(false);

  return (
    <Popover open={isPinned} onOpenChange={onPinnedChange} modal={false}>
      <HoverCard
        open={peekOpen && !isPinned}
        onOpenChange={setPeekOpen}
        openDelay={180}
        closeDelay={120}
      >
        {/* One element is both triggers. The Popover trigger must be the INNER render: with
            PopoverTrigger on the outside the two Base UI triggers fight over the same node and
            re-render each other forever. */}
        <HoverCardTrigger render={<PopoverTrigger render={children} />} />

        <HoverCardContent
          align="start"
          side="bottom"
          sideOffset={8}
          collisionPadding={16}
          className="w-80 space-y-2 rounded-xl p-3"
        >
          <PeekBody doc={doc} />
        </HoverCardContent>

        <PopoverContent
          align="start"
          side="bottom"
          sideOffset={8}
          collisionPadding={16}
          className="flex max-h-[min(60vh,520px)] w-[440px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden p-0"
        >
          <PinnedBody
            doc={doc}
            onClose={() => onPinnedChange(false)}
            onOpenInline={onOpenInline}
            onDownload={onDownload}
            onRemove={onRemove}
          />
        </PopoverContent>
      </HoverCard>
    </Popover>
  );
}

function metaLine(
  doc: DocumentView,
  t: ReturnType<typeof useTranslations<'common'>>,
  locale: string,
): string {
  const parts: string[] = [];
  if (typeof doc.size === 'number') parts.push(formatBytes(doc.size, locale));
  if (doc.pageCount) parts.push(t('m_5c0451aaed', { count: doc.pageCount }));
  parts.push(sourceLabel(doc.source, t));
  return parts.join(' · ');
}

function sourceLabel(
  source: DocumentView['source'],
  t: ReturnType<typeof useTranslations<'common'>>,
): string {
  if (source === 'upload') return t('uploaded_3cc3767');
  if (source === 'google-drive') return 'Google Drive';
  return source.charAt(0).toUpperCase() + source.slice(1);
}

function KindBadge({ doc }: { doc: DocumentView }) {
  const docT = useTranslations('common');

  return (
    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-2xs font-medium uppercase tracking-wide text-muted-foreground">
      {kindLabel(doc, docT)}
    </span>
  );
}

function StatusChip({ label }: { label: ProgressLabel }) {
  const Icon: LucideIcon =
    label.tone === 'success' ? CheckCircle2 : label.tone === 'error' ? AlertCircle : Loader2;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs',
        label.tone === 'success' && 'text-emerald-600 dark:text-emerald-400',
        label.tone === 'error' && 'text-rose-600',
        (label.tone === 'progress' || label.tone === 'neutral') && 'text-muted-foreground',
      )}
    >
      <Icon className={cn('h-3 w-3', label.tone === 'progress' && 'animate-spin')} aria-hidden />
      {label.text}
    </span>
  );
}

function PeekBody({ doc }: { doc: DocumentView }) {
  const tUi = useTranslations('common');
  const uiLocale = useLocale();

  const label = describeStep(doc, tUi, uiLocale);
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{doc.name}</p>
        <KindBadge doc={doc} />
      </div>
      <p className="font-mono text-xs text-muted-foreground">{metaLine(doc, tUi, uiLocale)}</p>
      <StatusChip label={label} />
      {doc.textExcerpt ? (
        <p className="line-clamp-4 border-t border-border/60 pt-2 text-xs leading-relaxed text-muted-foreground">
          {doc.textExcerpt}
        </p>
      ) : (
        <p className="border-t border-border/60 pt-2 text-xs italic text-muted-foreground/70">
          {tUi('m_9eff7e80fa')}
        </p>
      )}
    </>
  );
}

function PinnedBody({
  doc,
  onClose,
  onOpenInline,
  onDownload,
  onRemove,
}: {
  doc: DocumentView;
  onClose: () => void;
  onOpenInline: (storagePath: string) => void;
  onDownload: (storagePath: string) => void;
  onRemove: (documentId: string) => void;
}) {
  const uiText = useTranslations('common');
  const uiLocale = useLocale();
  const label = describeStep(doc, uiText, uiLocale);
  const storagePath = doc.storagePath;
  return (
    <>
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border/70 px-4 py-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <p className="min-w-0 truncate text-sm font-semibold text-foreground">{doc.name}</p>
            <KindBadge doc={doc} />
          </div>
          <StatusChip label={label} />
        </div>
        <button
          type="button"
          aria-label={uiText('close_preview_7d8ab36')}
          onClick={onClose}
          className="-mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 px-4 py-3">
          <MetaGrid doc={doc} />
          <ExcerptBlock doc={doc} />
        </div>
      </ScrollArea>

      <footer className="flex shrink-0 items-center gap-2 border-t border-border/70 px-4 py-2.5">
        {storagePath ? (
          <ActionButton
            icon={ExternalLink}
            label={uiText('open_ed077f3')}
            tone="primary"
            onClick={() => onOpenInline(storagePath)}
          />
        ) : null}
        {storagePath ? (
          <ActionButton
            icon={Download}
            label={uiText('download_d6eafe8')}
            tone="ghost"
            onClick={() => onDownload(storagePath)}
          />
        ) : null}
        <ActionButton
          icon={Trash2}
          label={uiText('remove_c3812fc')}
          tone="danger"
          className="ml-auto"
          onClick={() => onRemove(doc.id)}
        />
      </footer>
    </>
  );
}

function MetaGrid({ doc }: { doc: DocumentView }) {
  const docT = useTranslations('common');

  const uiLocale = useLocale();

  const rows: Array<[string, string]> = [
    [docT('m_3deb745651'), kindLabel(doc, docT)],
    [docT('m_b7152342a2'), typeof doc.size === 'number' ? formatBytes(doc.size, uiLocale) : '—'],
    [
      docT('m_600584c2d5'),
      doc.pageCount ? new Intl.NumberFormat(uiLocale).format(doc.pageCount) : '—',
    ],
    [docT('m_6da13addb0'), sourceLabel(doc.source, docT)],
    [docT('m_b68734c259'), formatDate(doc.createdAt, uiLocale)],
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
      {rows.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="text-muted-foreground">{key}</dt>
          <dd className="truncate text-right font-medium text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ExcerptBlock({ doc }: { doc: DocumentView }) {
  const tUi = useTranslations('common');

  if (doc.textExcerpt) {
    return (
      <div className="space-y-1.5 border-t border-border/60 pt-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {tUi('m_960373f325')}
        </p>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          {doc.textExcerpt}
        </p>
      </div>
    );
  }
  return (
    <div className="border-t border-border/60 pt-3 text-sm text-muted-foreground">
      <p>{tUi('m_d082accf39')}</p>
      {doc.storagePath ? (
        <p className="mt-1 text-xs text-muted-foreground/70">{tUi('m_ebb43dfa69')}</p>
      ) : null}
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  tone,
  onClick,
  className,
}: {
  icon: LucideIcon;
  label: string;
  tone: 'primary' | 'ghost' | 'danger';
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
        tone === 'primary' && 'bg-primary text-primary-foreground hover:bg-primary/90',
        tone === 'ghost' && 'border border-border/70 bg-background text-foreground hover:bg-muted',
        tone === 'danger' && 'text-rose-600 hover:bg-rose-500/10',
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </button>
  );
}

function formatDate(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

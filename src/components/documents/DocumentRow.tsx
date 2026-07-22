'use client';

import type { DocumentCategory } from '@continuum/contracts';
import type { LucideIcon } from 'lucide-react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  FileType,
  Image as ImageIcon,
  Loader2,
  Presentation,
  RotateCw,
  X,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import { DocumentCategorySelect } from './DocumentCategorySelect';
import { DocumentPreviewCard } from './DocumentPreviewCard';
import type { DocumentView } from './types';
import { describeStep, documentCategoryOf, formatBytes, kindLabel } from './types';
import type { UploadEntry } from './useDocumentMutations';

export const ROW_EASE = [0.2, 0.8, 0.2, 1] as const;
const ROW_TRANSITION = { duration: 0.24, ease: ROW_EASE };

const KIND_ICON: Record<string, LucideIcon> = {
  pdf: FileType,
  docx: FileText,
  pptx: Presentation,
  xlsx: FileSpreadsheet,
  image: ImageIcon,
  text: FileText,
  markdown: FileText,
  csv: FileSpreadsheet,
  json: FileText,
  html: FileText,
  unknown: FileText,
};

function iconFor(doc: DocumentView): LucideIcon {
  if (doc.kind && KIND_ICON[doc.kind]) return KIND_ICON[doc.kind];
  const lower = doc.name.toLowerCase();
  if (lower.endsWith('.pdf')) return FileType;
  if (lower.endsWith('.pptx') || lower.endsWith('.ppt')) return Presentation;
  if (lower.endsWith('.xlsx') || lower.endsWith('.csv')) return FileSpreadsheet;
  if (/\.(png|jpe?g|webp|gif)$/.test(lower)) return ImageIcon;
  return FileText;
}

export function PendingRow({
  entry,
  onRetry,
  onDiscard,
}: {
  entry: UploadEntry;
  onRetry: (key: string) => void;
  onDiscard: (key: string) => void;
}) {
  const reduceMotion = useReducedMotion();
  const isError = entry.status === 'error';
  return (
    <motion.li
      layout
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
      transition={ROW_TRANSITION}
      className={cn(
        'flex min-h-12 items-center justify-between gap-3 border-b border-border/70 py-2.5 last:border-0',
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
            isError ? 'bg-rose-500/10 text-rose-600' : 'bg-muted text-muted-foreground',
          )}
        >
          {isError ? <AlertCircle className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
        </span>
        <span className="shrink-0 font-mono text-sm text-muted-foreground">
          {formatBytes(entry.file.size)}
        </span>
        <span className="min-w-0 flex-1 truncate">
          <span className="block truncate text-sm font-medium text-primary">{entry.file.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {isError ? (entry.error ?? 'Failed') : 'Uploading…'}
          </span>
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {isError ? (
          <>
            <CircleAction
              ariaLabel="Retry upload"
              tone="neutral"
              icon={RotateCw}
              onClick={() => onRetry(entry.key)}
            />
            <CircleAction
              ariaLabel="Discard upload"
              tone="muted"
              icon={X}
              onClick={() => onDiscard(entry.key)}
            />
          </>
        ) : (
          <CircleAction ariaLabel="Uploading" tone="progress" icon={Loader2} spin disabled />
        )}
      </div>
    </motion.li>
  );
}

export function DocumentRow({
  doc,
  isPinned,
  onPinnedChange,
  onOpenInline,
  onDownload,
  onRemove,
  onCategoryChange,
}: {
  doc: DocumentView;
  isPinned: boolean;
  onPinnedChange: (pinned: boolean) => void;
  onOpenInline: (storagePath: string) => void;
  onDownload: (storagePath: string) => Promise<void>;
  onRemove: (documentId: string) => void;
  onCategoryChange?: (documentId: string, category: DocumentCategory) => void;
}) {
  const reduceMotion = useReducedMotion();
  const label = describeStep(doc);
  const Icon = iconFor(doc);
  const codeParts: string[] = [kindLabel(doc).toUpperCase()];
  if (doc.pageCount) codeParts.push(`${doc.pageCount} pp`);
  else if (doc.size) codeParts.push(formatBytes(doc.size));

  const subtitle =
    label.tone === 'progress' && typeof doc.progressPercent === 'number'
      ? `${label.text}`
      : label.text;

  const statusIcon =
    label.tone === 'success' ? CheckCircle2 : label.tone === 'error' ? AlertCircle : Loader2;
  const statusTone: ActionTone =
    label.tone === 'success' ? 'success' : label.tone === 'error' ? 'error' : 'progress';

  return (
    <motion.li
      layout
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
      transition={ROW_TRANSITION}
      aria-busy={label.tone === 'progress' ? true : undefined}
      className="group flex min-h-12 items-center justify-between gap-3 border-b border-border/70 py-2.5 last:border-0"
    >
      <DocumentPreviewCard
        doc={doc}
        isPinned={isPinned}
        onPinnedChange={onPinnedChange}
        onOpenInline={onOpenInline}
        onDownload={(storagePath) => void onDownload(storagePath)}
        onRemove={onRemove}
      >
        <button
          type="button"
          aria-label={`Preview ${doc.name}`}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Icon className="h-4 w-4" />
          </span>
          <span className="shrink-0 font-mono text-sm text-muted-foreground">
            {codeParts.join(' · ')}
          </span>
          <span className="min-w-0 flex-1 truncate">
            <span className="block truncate text-sm font-medium text-primary">{doc.name}</span>
            <span
              className={cn(
                'block truncate text-xs',
                label.tone === 'error' ? 'text-rose-600' : 'text-muted-foreground',
              )}
            >
              {subtitle}
            </span>
            {label.tone === 'progress' && typeof doc.progressPercent === 'number' ? (
              <span
                aria-hidden
                className="mt-1 block h-[2px] w-full overflow-hidden rounded-full bg-muted"
              >
                <span
                  className="block h-full rounded-full bg-emerald-500/60 transition-[width]"
                  style={{ width: `${Math.max(2, doc.progressPercent)}%` }}
                />
              </span>
            ) : null}
          </span>
        </button>
      </DocumentPreviewCard>
      <div className="flex shrink-0 items-center gap-1.5">
        {/* Category tag — always visible so brand_guidelines can be set/seen at a glance */}
        {onCategoryChange ? (
          <DocumentCategorySelect
            value={documentCategoryOf(doc)}
            onChange={(category) => onCategoryChange(doc.id, category)}
            ariaLabel={`Category for ${doc.name}`}
          />
        ) : null}
        {/* Download, remove — revealed on hover (always visible for errors) */}
        <div
          className={cn(
            'flex items-center gap-0.5 motion-safe:transition-opacity',
            label.tone === 'error'
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
          )}
        >
          {doc.storagePath ? (
            <CircleAction
              ariaLabel="Download"
              tone="muted"
              icon={Download}
              onClick={() => void onDownload(doc.storagePath ?? '')}
            />
          ) : null}
          <CircleAction
            ariaLabel="Remove document"
            tone="muted"
            icon={X}
            onClick={() => onRemove(doc.id)}
          />
        </div>
        {/* Ingestion status badge — independent of preview */}
        <StatusBadge tone={statusTone} icon={statusIcon} spin={label.tone === 'progress'} />
      </div>
    </motion.li>
  );
}

type ActionTone = 'success' | 'error' | 'progress' | 'neutral' | 'muted';

function StatusBadge({
  tone,
  icon: Icon,
  spin,
}: {
  tone: ActionTone;
  icon: LucideIcon;
  spin?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-full',
        tone === 'success' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        tone === 'error' && 'bg-rose-500/10 text-rose-600',
        tone === 'progress' && 'bg-emerald-500/5 text-emerald-600 dark:text-emerald-400',
      )}
    >
      <Icon className={cn('h-4 w-4', spin && 'animate-spin')} />
    </span>
  );
}

function CircleAction({
  ariaLabel,
  tone,
  icon: Icon,
  onClick,
  disabled,
  spin,
}: {
  ariaLabel: string;
  tone: ActionTone;
  icon: LucideIcon;
  onClick?: () => void;
  disabled?: boolean;
  spin?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        tone === 'success' &&
          'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400',
        tone === 'error' && 'bg-rose-500/10 text-rose-600 hover:bg-rose-500/20',
        tone === 'progress' &&
          'bg-emerald-500/5 text-emerald-600 cursor-wait dark:text-emerald-400',
        tone === 'neutral' && 'bg-muted text-foreground hover:bg-muted/70',
        tone === 'muted' && 'text-muted-foreground hover:bg-muted hover:text-foreground',
        disabled && tone !== 'progress' && 'cursor-not-allowed opacity-50',
      )}
    >
      <Icon className={cn('h-4 w-4', spin && 'animate-spin')} />
    </button>
  );
}

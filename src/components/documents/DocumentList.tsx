'use client';

import {
  DOCUMENT_CATEGORY_DEFAULT,
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_CATEGORY_VALUES,
  type DocumentCategory,
} from '@continuum/contracts';
import { FileText, Loader2, Plus, Upload } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useMemo, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/ToastProvider';
import type { OnboardingState } from '@/lib/onboarding/state';
import { cn } from '@/lib/utils';
import { DocumentCategorySelect } from './DocumentCategorySelect';
import { DocumentRow, PendingRow, ROW_EASE } from './DocumentRow';
import type { CategoryFilter, DocumentDensity, DocumentView } from './types';
import { filterDocumentsByCategory } from './types';
import { useDocumentMutations } from './useDocumentMutations';
import { useDocuments } from './useDocuments';

const ACCEPT = '.pdf,.docx,.pptx,.xlsx,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.webp,.gif';

const PANEL_TRANSITION = { duration: 0.24, ease: ROW_EASE };

type DocumentManagerProps = {
  brandId: string;
  seed: DocumentView[];
  density: DocumentDensity;
  onStateChange?: (state: OnboardingState) => void;
  emptyHint?: string;
};

export function DocumentManager({
  brandId,
  seed,
  density,
  onStateChange,
  emptyHint = 'PDFs, slides, sheets, docs, and images become brand context once indexed.',
}: DocumentManagerProps) {
  const { show } = useToast();
  const reduceMotion = useReducedMotion();
  const documents = useDocuments(brandId, seed);
  const mutations = useDocumentMutations(brandId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [uploadCategory, setUploadCategory] = useState<DocumentCategory>(DOCUMENT_CATEGORY_DEFAULT);

  const compact = density === 'compact';
  const visibleDocuments = useMemo(
    () => filterDocumentsByCategory(documents, categoryFilter),
    [documents, categoryFilter],
  );
  const hasItems = visibleDocuments.length > 0 || mutations.uploads.length > 0;
  const anyUploading = mutations.uploads.some((u) => u.status === 'uploading');
  const readyCount = documents.filter((d) => (d.progressStep ?? d.status) === 'ready').length;
  const processingCount =
    documents.length -
    readyCount +
    mutations.uploads.filter((u) => u.status === 'uploading').length;
  const errorCount = documents.filter((d) => (d.progressStep ?? d.status) === 'error').length;

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;
    const result = await mutations.uploadFiles(files, onStateChange, uploadCategory);
    if (result.succeeded > 0) {
      show({
        title:
          result.succeeded === 1 ? 'Document uploaded' : `${result.succeeded} documents uploaded`,
        description: 'Indexing has started.',
        variant: 'success',
      });
    }
    if (result.failed > 0) {
      show({
        title: 'Upload failed',
        description: `${result.failed} file${result.failed === 1 ? '' : 's'} could not be uploaded.`,
        variant: 'error',
      });
    }
  };

  const handleDownload = async (storagePath: string) => {
    if (!storagePath) return;
    try {
      const signedUrl = await mutations.openSignedUrl(storagePath);
      window.open(signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate download link.';
      show({ title: 'Download failed', description: message, variant: 'error' });
    }
  };

  const handleOpenInline = async (storagePath: string) => {
    if (!storagePath) return;
    try {
      const url = await mutations.openInlineUrl(storagePath);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to open document.';
      show({ title: 'Open failed', description: message, variant: 'error' });
    }
  };

  const handleRemove = async (documentId: string) => {
    try {
      await mutations.removeDocument(documentId, onStateChange);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not remove document.';
      show({ title: 'Remove failed', description: message, variant: 'error' });
    }
  };

  const handleCategoryChange = async (documentId: string, category: DocumentCategory) => {
    try {
      await mutations.updateCategory(documentId, category, onStateChange);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not update category.';
      show({ title: 'Update failed', description: message, variant: 'error' });
    }
  };

  const handleInputChange: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length > 0) await handleFiles(files);
    if (inputRef.current) inputRef.current.value = '';
  };

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) setDragActive(true);
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) setDragActive(false);
  };
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length > 0) await handleFiles(files);
  };

  return (
    <div
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={handleInputChange}
      />
      <Card
        className={cn(
          'w-full gap-4 rounded-lg bg-card p-3 shadow-sm motion-safe:transition-colors',
          compact ? 'max-w-[560px]' : 'max-w-none',
          dragActive && 'ring-2 ring-emerald-500/30',
        )}
      >
        <CardContent className="space-y-3 p-0">
          <SyncBar
            onUploadClick={() => inputRef.current?.click()}
            uploading={anyUploading}
            ready={readyCount}
            processing={processingCount}
            errors={errorCount}
            categoryFilter={categoryFilter}
            onCategoryFilterChange={setCategoryFilter}
            uploadCategory={uploadCategory}
            onUploadCategoryChange={setUploadCategory}
          />
          <ItemPanel
            hasItems={hasItems}
            maxHeight={compact ? 280 : 480}
            reduceMotion={reduceMotion ?? false}
            emptyState={
              <EmptyState
                hint={emptyHint}
                dragActive={dragActive}
                onBrowse={() => inputRef.current?.click()}
              />
            }
          >
            <ul className="flex flex-col">
              <AnimatePresence initial={false}>
                {mutations.uploads.map((entry) => (
                  <PendingRow
                    key={entry.key}
                    entry={entry}
                    onRetry={(key) => void mutations.retryUpload(key, onStateChange)}
                    onDiscard={mutations.discardUpload}
                  />
                ))}
                {visibleDocuments.map((doc) => (
                  <DocumentRow
                    key={doc.id}
                    doc={doc}
                    isPinned={pinnedId === doc.id}
                    onPinnedChange={(pinned) => setPinnedId(pinned ? doc.id : null)}
                    onOpenInline={(storagePath) => void handleOpenInline(storagePath)}
                    onDownload={handleDownload}
                    onRemove={(id) => void handleRemove(id)}
                    onCategoryChange={(id, category) => void handleCategoryChange(id, category)}
                  />
                ))}
              </AnimatePresence>
            </ul>
          </ItemPanel>
        </CardContent>
      </Card>
    </div>
  );
}

function SyncBar({
  onUploadClick,
  uploading,
  ready,
  processing,
  errors,
  categoryFilter,
  onCategoryFilterChange,
  uploadCategory,
  onUploadCategoryChange,
}: {
  onUploadClick: () => void;
  uploading: boolean;
  ready: number;
  processing: number;
  errors: number;
  categoryFilter: CategoryFilter;
  onCategoryFilterChange: (filter: CategoryFilter) => void;
  uploadCategory: DocumentCategory;
  onUploadCategoryChange: (category: DocumentCategory) => void;
}) {
  const summary = formatSummary({ ready, processing, errors });
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-muted/30 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <CategoryFilterSelect value={categoryFilter} onChange={onCategoryFilterChange} />
        <span className="truncate text-xs text-muted-foreground">{summary}</span>
      </div>
      <div className="flex items-center gap-2">
        <DocumentCategorySelect
          value={uploadCategory}
          onChange={onUploadCategoryChange}
          ariaLabel="Category for new uploads"
        />
        <button
          type="button"
          onClick={onUploadClick}
          disabled={uploading}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-sm outline-none transition-colors',
            'hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
            uploading && 'cursor-wait opacity-70',
          )}
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          {uploading ? 'Uploading…' : 'Upload document'}
        </button>
      </div>
    </div>
  );
}

function CategoryFilterSelect({
  value,
  onChange,
}: {
  value: CategoryFilter;
  onChange: (filter: CategoryFilter) => void;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as CategoryFilter)}>
      <SelectTrigger
        size="sm"
        aria-label="Filter documents by category"
        className="h-7 gap-1 rounded-full px-2.5 text-xs font-medium"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all" className="text-xs">
          All categories
        </SelectItem>
        {DOCUMENT_CATEGORY_VALUES.map((category) => (
          <SelectItem key={category} value={category} className="text-xs">
            {DOCUMENT_CATEGORY_LABELS[category]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function formatSummary({
  ready,
  processing,
  errors,
}: {
  ready: number;
  processing: number;
  errors: number;
}): string {
  const total = ready + processing + errors;
  if (total === 0) return 'Add files available to this brand.';
  const parts: string[] = [];
  if (ready > 0) parts.push(`${ready} ready`);
  if (processing > 0) parts.push(`${processing} processing`);
  if (errors > 0) parts.push(`${errors} error${errors === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

function ItemPanel({
  hasItems,
  maxHeight,
  reduceMotion,
  emptyState,
  children,
}: {
  hasItems: boolean;
  maxHeight: number;
  reduceMotion: boolean;
  emptyState: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden" style={{ height: maxHeight, minHeight: 200 }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={hasItems ? 'list' : 'empty'}
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -14 }}
          transition={PANEL_TRANSITION}
          className="absolute inset-0 flex flex-col"
        >
          {hasItems ? (
            <ScrollArea className="min-h-0 flex-1 px-3 pr-2">{children}</ScrollArea>
          ) : (
            <div className="flex flex-1 items-center justify-center px-4 py-6 text-center">
              {emptyState}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function EmptyState({
  hint,
  dragActive,
  onBrowse,
}: {
  hint: string;
  dragActive: boolean;
  onBrowse: () => void;
}) {
  return (
    <div
      className={cn(
        'mx-auto flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-dashed px-5 py-8',
        dragActive ? 'border-emerald-500/60 bg-emerald-500/5' : 'border-border/70 bg-muted/20',
      )}
    >
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <FileText className="h-5 w-5" aria-hidden />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">No documents yet</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <button
        type="button"
        onClick={onBrowse}
        className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-sm outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Upload className="h-3.5 w-3.5" />
        Browse files
      </button>
      <p className="text-xs text-muted-foreground">…or drop them anywhere on this card.</p>
    </div>
  );
}

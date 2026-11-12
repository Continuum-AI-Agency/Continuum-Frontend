'use client';

import {
  DOCUMENT_CATEGORY_DEFAULT,
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_CATEGORY_VALUES,
  type DocumentCategory,
  type DocumentScope,
} from '@continuum/contracts';
import { FileText, Loader2, Plus, Upload } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { useUiErrorMessage } from '@/i18n/errors';
import type { OnboardingState } from '@/lib/onboarding/state';
import { cn } from '@/lib/utils';
import { DocumentCategorySelect } from './DocumentCategorySelect';
import { DocumentRow, PendingRow, ROW_EASE } from './DocumentRow';
import { DocumentScopeSelect } from './DocumentScopeSelect';
import type { CategoryFilter, DocumentDensity, DocumentView } from './types';
import {
  categoryLabel,
  filterDocumentsByCategory,
  filterDocumentsByScope,
  isEphemeral,
} from './types';
import { useDocumentActions } from './useDocumentActions';
import { useDocumentMutations } from './useDocumentMutations';
import { useDocuments } from './useDocuments';

const EXPIRY_TICK_MS = 60_000;

/**
 * Ticking clock for retention countdowns. Only runs while a temporary document is on
 * screen — a library of permanent documents has nothing to count down, so it costs
 * nothing there.
 */
function useNowTicker(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), EXPIRY_TICK_MS);
    return () => clearInterval(id);
  }, [enabled]);
  return now;
}

const ACCEPT = '.pdf,.docx,.pptx,.xlsx,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.webp,.gif';

const PANEL_TRANSITION = { duration: 0.24, ease: ROW_EASE };

type DocumentManagerProps = {
  brandId: string;
  seed: DocumentView[];
  density: DocumentDensity;
  onStateChange?: (state: OnboardingState) => void;
  emptyHint?: string;
  /** Files picked before this list mounted (onboarding's first screen); uploaded once on mount. */
  initialFiles?: File[];
  onInitialFilesTaken?: () => void;
};

export function DocumentManager({
  brandId,
  seed,
  density,
  onStateChange,
  emptyHint: providedEmptyHint,
  initialFiles,
  onInitialFilesTaken,
}: DocumentManagerProps) {
  const getUiErrorMessage = useUiErrorMessage();

  const uiText = useTranslations('common');
  const emptyHint = providedEmptyHint ?? uiText('documentDefaultHint');
  const { show } = useToast();
  const reduceMotion = useReducedMotion();
  const { documents } = useDocuments(brandId, seed);
  const mutations = useDocumentMutations(brandId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [scope, setScope] = useState<DocumentScope>('active');
  const [uploadCategory, setUploadCategory] = useState<DocumentCategory>(DOCUMENT_CATEGORY_DEFAULT);

  const compact = density === 'compact';

  // One clock for the whole list rather than a timer per row. Also drives the
  // client-side expiry hide, so the UI is correct even when the nightly sweep is
  // hours away from running.
  const now = useNowTicker(documents.some(isEphemeral));

  // Scope first, then category — so switching to Archived does not silently keep a
  // category filter that makes the list look empty.
  const scopedDocuments = useMemo(
    () => filterDocumentsByScope(documents, scope, now),
    [documents, scope, now],
  );
  const visibleDocuments = useMemo(
    () => filterDocumentsByCategory(scopedDocuments, categoryFilter),
    [scopedDocuments, categoryFilter],
  );
  const actions = useDocumentActions(mutations, onStateChange);

  const hasItems = visibleDocuments.length > 0 || mutations.uploads.length > 0;
  const anyUploading = mutations.uploads.some((u) => u.status === 'uploading');
  // Counts describe what is on screen. Computing them over ALL documents would claim
  // "12 ready" above a list showing 9.
  const readyCount = scopedDocuments.filter((d) => (d.progressStep ?? d.status) === 'ready').length;
  const processingCount =
    scopedDocuments.length -
    readyCount +
    mutations.uploads.filter((u) => u.status === 'uploading').length;
  const errorCount = scopedDocuments.filter((d) => (d.progressStep ?? d.status) === 'error').length;

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;
    const result = await mutations.uploadFiles(files, onStateChange, uploadCategory);
    if (result.succeeded > 0) {
      show({
        title:
          result.succeeded === 1
            ? uiText('m_2c6594a2af')
            : uiText('m_c967b54992', { v0: String(result.succeeded) }),
        description: uiText('m_24fd6b25bd'),
        variant: 'success',
      });
    }
    if (result.failed > 0) {
      show({
        title: uiText('upload_failed_6efc5d2'),
        description: uiText('m_a5eeb0e47f', { v0: result.failed }),
        variant: 'error',
      });
    }
  };

  const initialFilesTakenRef = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: upload the handed-over files once, on mount.
  useEffect(() => {
    if (initialFilesTakenRef.current || !initialFiles?.length) return;
    initialFilesTakenRef.current = true;
    onInitialFilesTaken?.();
    void handleFiles(initialFiles);
  }, []);

  const handleDownload = async (storagePath: string) => {
    if (!storagePath) return;
    try {
      const signedUrl = await mutations.openSignedUrl(storagePath);
      window.open(signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      const message = getUiErrorMessage(err);
      show({
        title: uiText('download_failed_eae34cc'),
        description: message,
        variant: 'error',
      });
    }
  };

  const handleOpenInline = async (storagePath: string) => {
    if (!storagePath) return;
    try {
      const url = await mutations.openInlineUrl(storagePath);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      const message = getUiErrorMessage(err);
      show({
        title: uiText('m_cdf689c09c'),
        description: message,
        variant: 'error',
      });
    }
  };

  // Take-down is now reversible: the row survives, its chunks are purged so it leaves
  // every agent surface immediately, and the file is retained for a recovery window.
  const handleRemove = async (documentId: string) => {
    try {
      await mutations.archiveDocument(documentId, onStateChange);
      show({
        title: uiText('m_66558a531a'),
        description: uiText('m_df02900aa7'),
        variant: 'success',
        action: {
          label: uiText('undo_a8283ad'),
          onClick: () => {
            void mutations
              .restoreDocument(documentId, onStateChange)
              .catch(() => show({ title: uiText('m_de0bc6bc5c'), variant: 'error' }));
          },
        },
      });
    } catch (err) {
      const message = getUiErrorMessage(err);
      show({
        title: uiText('m_17af345542'),
        description: message,
        variant: 'error',
      });
    }
  };

  const handleCategoryChange = async (documentId: string, category: DocumentCategory) => {
    try {
      await mutations.updateCategory(documentId, category, onStateChange);
    } catch (err) {
      const message = getUiErrorMessage(err);
      show({
        title: uiText('update_failed_e58282f'),
        description: message,
        variant: 'error',
      });
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
    // A labelled section rather than a bare div: drag-and-drop is a pointer-only
    // convenience here, and the keyboard-accessible path is the Upload button inside.
    <section
      aria-label={uiText('brand_documents_7bc955e')}
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
            scope={scope}
            onScopeChange={setScope}
            showScope={!compact}
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
                    now={now}
                    actions={actions}
                    onPinnedChange={(pinned) => setPinnedId(pinned ? doc.id : null)}
                    onOpenInline={(storagePath) => void handleOpenInline(storagePath)}
                    onDownload={handleDownload}
                    brandId={brandId}
                    onRemove={(id) => void handleRemove(id)}
                    onCategoryChange={(id, category) => void handleCategoryChange(id, category)}
                  />
                ))}
              </AnimatePresence>
            </ul>
          </ItemPanel>
        </CardContent>
      </Card>
    </section>
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
  scope,
  onScopeChange,
  showScope,
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
  scope: DocumentScope;
  onScopeChange: (scope: DocumentScope) => void;
  /** Hidden in the compact onboarding surface, whose uploads are always permanent. */
  showScope: boolean;
}) {
  const uiText = useTranslations('common');
  const summary =
    ready + processing + errors === 0
      ? uiText('m_b05a4927a0')
      : uiText('m_aab232a7d4', { ready, processing, errors });
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-muted/30 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        {showScope ? <DocumentScopeSelect value={scope} onChange={onScopeChange} /> : null}
        <CategoryFilterSelect value={categoryFilter} onChange={onCategoryFilterChange} />
        <span className="truncate text-xs text-muted-foreground">{summary}</span>
      </div>
      <div className="flex items-center gap-2">
        <DocumentCategorySelect
          value={uploadCategory}
          onChange={onUploadCategoryChange}
          ariaLabel={uiText('documentNewUploadCategory')}
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
          {uploading ? uiText('uploading_5ce44dd') : uiText('m_73183a7050')}
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
  const tUi = useTranslations('common');

  return (
    <Select value={value} onValueChange={(next) => onChange(next as CategoryFilter)}>
      <SelectTrigger
        size="sm"
        aria-label={tUi('m_4c37133b5a')}
        className="h-7 gap-1 rounded-full px-2.5 text-xs font-medium"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all" className="text-xs">
          {tUi('m_060be00f4f')}
        </SelectItem>
        {DOCUMENT_CATEGORY_VALUES.map((category) => (
          <SelectItem key={category} value={category} className="text-xs">
            {categoryLabel(category, tUi)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
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
  const tUi = useTranslations('common');

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
        <p className="text-sm font-medium text-foreground">{tUi('m_1837bb9991')}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <button
        type="button"
        onClick={onBrowse}
        className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-sm outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Upload className="h-3.5 w-3.5" />
        {tUi('m_524932e050')}
      </button>
      <p className="text-xs text-muted-foreground">{tUi('m_ad4c78b7ee')}</p>
    </div>
  );
}

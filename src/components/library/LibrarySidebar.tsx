'use client';

import type {
  LibraryBrowseQuery,
  LibraryMediaType,
  LibrarySavedView,
  LibrarySort,
  MediaCollection,
  MediaReviewStatus,
} from '@continuum/contracts';
import {
  Bookmark,
  BookmarkPlus,
  Clock3,
  Film,
  Folder,
  FolderOpen,
  FolderPlus,
  HardDrive,
  ImageIcon,
  LayoutGrid,
  Loader2,
  PackageOpen,
  Pencil,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  createLibraryCollectionOperation,
  createLibrarySavedViewOperation,
  deleteLibraryCollectionOperation,
  deleteLibrarySavedViewOperation,
  updateLibraryCollectionOperation,
} from '@/lib/library/creativeOperations';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

export type LibraryBrowseDestination =
  | 'all'
  | 'recent'
  | 'images'
  | 'videos'
  | 'project_files'
  | 'needs_review';

type Props = {
  brandId: string;
  collections: MediaCollection[];
  savedViews: LibrarySavedView[];
  currentQuery: LibraryBrowseQuery;
  onSelectSavedView: (view: LibrarySavedView) => void;
  selectedCollectionId: string | null;
  onSelectCollection: (id: string | null) => void;
  selectedMediaType: LibraryMediaType;
  selectedSort: LibrarySort;
  selectedReviewStatuses: readonly MediaReviewStatus[];
  onSelectDestination: (destination: LibraryBrowseDestination) => void;
  storageUsedBytes: number;
};

// The permanent sidebar answers "what is it?" only. Creation methods such as
// Reel, Clip, HyperFrame, and Canvas live in the filter popover so the browse
// tree stays short even as Continuum adds new generators.
const BROWSE_FOLDERS: {
  value: LibraryBrowseDestination;
  label: string;
  icon: typeof Folder;
}[] = [
  { value: 'all', label: 'All assets', icon: LayoutGrid },
  { value: 'recent', label: 'Recent', icon: Clock3 },
  { value: 'images', label: 'Images', icon: ImageIcon },
  { value: 'videos', label: 'Videos', icon: Film },
  { value: 'project_files', label: 'Project files', icon: PackageOpen },
  { value: 'needs_review', label: 'Needs review', icon: ShieldAlert },
];

function activeDestination(
  mediaType: LibraryMediaType,
  sort: LibrarySort,
  reviewStatuses: readonly MediaReviewStatus[],
): LibraryBrowseDestination | null {
  if (reviewStatuses.includes('in_review') || reviewStatuses.includes('needs_changes')) {
    return 'needs_review';
  }
  if (mediaType === 'image') return 'images';
  if (mediaType === 'video') return 'videos';
  if (mediaType === 'project_file') return 'project_files';
  if (mediaType === 'all' && sort === 'updated_desc') return 'recent';
  if (mediaType === 'all') return 'all';
  return null;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
}

function withoutCursor(query: LibraryBrowseQuery): Omit<LibraryBrowseQuery, 'cursor'> {
  const copy = { ...query };
  delete copy.cursor;
  return copy;
}

function CollectionRow({
  selected,
  label,
  kind,
  onClick,
  onRename,
  onDelete,
}: {
  selected: boolean;
  label: string;
  kind: MediaCollection['kind'];
  onClick: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group flex items-center gap-0.5">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-accent',
          selected && 'bg-accent font-medium',
        )}
      >
        {kind === 'smart' ? (
          <Sparkles className="size-4 shrink-0 text-violet-500" />
        ) : selected ? (
          <FolderOpen className="size-4 shrink-0 text-primary" />
        ) : (
          <Folder className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate">{label}</span>
      </button>
      <button
        type="button"
        onClick={onRename}
        aria-label={`Rename collection ${label}`}
        className="flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 hover:bg-accent group-focus-within:opacity-100 group-hover:opacity-100"
      >
        <Pencil className="size-3" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete collection ${label}`}
        className="flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 hover:bg-accent hover:text-destructive group-focus-within:opacity-100 group-hover:opacity-100"
      >
        <Trash2 className="size-3" />
      </button>
    </div>
  );
}

function BrowseRow({
  selected,
  label,
  icon: Icon,
  onClick,
}: {
  selected: boolean;
  label: string;
  icon: typeof Folder;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-accent',
        selected && 'bg-accent font-medium',
      )}
    >
      <Icon
        className={cn('size-4 shrink-0', selected ? 'text-primary' : 'text-muted-foreground')}
      />
      <span className="truncate">{label}</span>
    </button>
  );
}

export function LibrarySidebar({
  brandId,
  collections,
  savedViews,
  currentQuery,
  onSelectSavedView,
  selectedCollectionId,
  onSelectCollection,
  selectedMediaType,
  selectedSort,
  selectedReviewStatuses,
  onSelectDestination,
  storageUsedBytes,
}: Props) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [createKind, setCreateKind] = useState<MediaCollection['kind']>('manual');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [creatingSavedView, setCreatingSavedView] = useState(false);
  const [savedViewName, setSavedViewName] = useState('');
  const [savingView, setSavingView] = useState(false);
  const selectedDestination = activeDestination(
    selectedMediaType,
    selectedSort,
    selectedReviewStatuses,
  );

  async function submitCreate() {
    const trimmed = name.trim();
    if (!trimmed) {
      setCreating(false);
      return;
    }
    setSubmitting(true);
    try {
      await createLibraryCollectionOperation(createSupabaseBrowserClient(), {
        brandId,
        name: trimmed,
        kind: createKind,
        ...(createKind === 'smart'
          ? { smartQuery: withoutCursor({ ...currentQuery, brandId }) }
          : {}),
      });
      setName('');
      setCreating(false);
      setCreateKind('manual');
      router.refresh();
    } catch (err) {
      console.error('[LibrarySidebar] create collection failed', err);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitRename(collectionId: string) {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenamingId(null);
      return;
    }
    try {
      await updateLibraryCollectionOperation(createSupabaseBrowserClient(), {
        brandId,
        collectionId,
        name: trimmed,
      });
      setRenamingId(null);
      router.refresh();
    } catch (error) {
      console.error('[LibrarySidebar] rename collection failed', error);
    }
  }

  async function removeCollection(collection: MediaCollection) {
    if (!window.confirm(`Delete “${collection.name}”? Assets will stay in Library.`)) return;
    try {
      await deleteLibraryCollectionOperation(createSupabaseBrowserClient(), {
        brandId,
        collectionId: collection.id,
      });
      if (selectedCollectionId === collection.id) onSelectCollection(null);
      router.refresh();
    } catch (error) {
      console.error('[LibrarySidebar] delete collection failed', error);
    }
  }

  async function submitSavedView() {
    const trimmed = savedViewName.trim();
    if (!trimmed) {
      setCreatingSavedView(false);
      return;
    }
    setSavingView(true);
    try {
      await createLibrarySavedViewOperation(createSupabaseBrowserClient(), {
        brandId,
        name: trimmed,
        query: { ...currentQuery, cursor: null },
      });
      setSavedViewName('');
      setCreatingSavedView(false);
      router.refresh();
    } catch (error) {
      console.error('[LibrarySidebar] save view failed', error);
    } finally {
      setSavingView(false);
    }
  }

  async function removeSavedView(savedViewId: string) {
    try {
      await deleteLibrarySavedViewOperation(createSupabaseBrowserClient(), {
        brandId,
        savedViewId,
      });
      router.refresh();
    } catch (error) {
      console.error('[LibrarySidebar] delete view failed', error);
    }
  }

  // Focus the rename field the moment it opens (a11y-clean alternative to
  // autoFocus): a stable callback ref fires once on mount, never on re-render.
  const focusRenameInput = useCallback((el: HTMLInputElement | null) => el?.focus(), []);

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-border/50 bg-muted/30">
      <ScrollArea className="min-h-0 flex-1 px-1.5 pt-2">
        <div className="px-2 pb-1 pt-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Browse
          </span>
        </div>
        {BROWSE_FOLDERS.map((folder) => (
          <BrowseRow
            key={folder.value}
            selected={selectedCollectionId === null && selectedDestination === folder.value}
            label={folder.label}
            icon={folder.icon}
            onClick={() => onSelectDestination(folder.value)}
          />
        ))}

        <div className="mt-3 flex items-center justify-between px-2 pb-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Saved views
          </span>
          <button
            type="button"
            onClick={() => setCreatingSavedView((value) => !value)}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Save current view"
          >
            <BookmarkPlus className="size-4" />
          </button>
        </div>

        {creatingSavedView ? (
          <div className="px-1 pb-2">
            <input
              ref={focusRenameInput}
              value={savedViewName}
              disabled={savingView}
              onChange={(event) => setSavedViewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submitSavedView();
                if (event.key === 'Escape') setCreatingSavedView(false);
              }}
              onBlur={() => void submitSavedView()}
              placeholder="View name…"
              className="w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm outline-none focus:border-border"
            />
          </div>
        ) : null}

        {savedViews.length === 0 && !creatingSavedView ? (
          <p className="px-2 py-1 text-xs text-muted-foreground/70">No saved views yet.</p>
        ) : (
          savedViews.map((view) => (
            <div key={view.id} className="group flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => onSelectSavedView(view)}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-accent"
              >
                <Bookmark className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{view.name}</span>
              </button>
              <button
                type="button"
                onClick={() => void removeSavedView(view.id)}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 hover:bg-accent hover:text-destructive group-focus-within:opacity-100 group-hover:opacity-100"
                aria-label={`Delete saved view ${view.name}`}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))
        )}

        <div className="mt-3 flex items-center justify-between px-2 pb-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Collections
          </span>
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-[0.96] [transition-property:scale,color,background-color]"
            title="New collection"
          >
            <FolderPlus className="size-4" />
          </button>
        </div>

        {creating && (
          <div className="px-1 pb-2">
            <div className="mb-1 flex rounded-md border border-border/60 bg-background p-0.5">
              {(['manual', 'smart'] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setCreateKind(kind)}
                  className={cn(
                    'flex-1 rounded px-1.5 py-1 text-2xs capitalize text-muted-foreground',
                    createKind === kind && 'bg-muted font-medium text-foreground',
                  )}
                >
                  {kind}
                </button>
              ))}
            </div>
            <input
              ref={focusRenameInput}
              value={name}
              disabled={submitting}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitCreate();
                if (e.key === 'Escape') {
                  setName('');
                  setCreating(false);
                }
              }}
              onBlur={() => void submitCreate()}
              placeholder="Collection name…"
              className="w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm outline-none focus:border-border"
            />
          </div>
        )}

        {collections.length === 0 && !creating ? (
          <p className="px-2 py-1 text-xs text-muted-foreground/70">No collections yet.</p>
        ) : (
          collections.map((col) => (
            <div key={col.id}>
              {renamingId === col.id ? (
                <input
                  ref={focusRenameInput}
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void submitRename(col.id);
                    if (event.key === 'Escape') setRenamingId(null);
                  }}
                  onBlur={() => void submitRename(col.id)}
                  className="w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm outline-none"
                />
              ) : (
                <CollectionRow
                  selected={selectedCollectionId === col.id}
                  label={col.name}
                  kind={col.kind}
                  onClick={() => onSelectCollection(col.id)}
                  onRename={() => {
                    setRenamingId(col.id);
                    setRenameValue(col.name);
                  }}
                  onDelete={() => void removeCollection(col)}
                />
              )}
            </div>
          ))
        )}
      </ScrollArea>

      <Separator />

      <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-muted-foreground/70">
        {submitting ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin" />
        ) : (
          <HardDrive className="size-3.5 shrink-0" />
        )}
        <span className="tabular-nums">{formatBytes(storageUsedBytes)} used</span>
      </div>
    </aside>
  );
}

'use client';

import {
  type ApiRenderJobListResponse,
  FORGE_RENDER_SET_MAX_DESCRIPTION,
  type ForgeRenderSet,
} from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import { defaultFilter } from 'cmdk';
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  FolderOpen,
  History,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  Share2,
  Text,
  Trash2,
} from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { ActionMenuItems, type GridAction } from '@/components/forge/gridActions';
import { NameDialog } from '@/components/forge/RenderSetMenu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast-imperative';
import { getApiBaseUrl } from '@/lib/api/config';
import { ApiError } from '@/lib/api/errors';
import { pluralize } from '@/lib/format/pluralize';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { cn } from '@/lib/utils';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';

// The template's render sets as tabs over the grid: which one the rows came from, one click to
// another, and — under the strip — what the open one is for, whether it has been rendered, and
// where it delivers. Anything that replaces the rows on screen goes through the grid's
// `confirmDiscard`, the one place that asks first when they hold unsaved edits.

export type SetRenders = { count: number; lastAt: string };

/**
 * Renders per set in one page of this template's jobs. `complete` only when that page is every job
 * the template has — otherwise a count is of recent renders, never a total.
 */
export function rendersBySet(
  response: ApiRenderJobListResponse,
  templateKey: string,
): { bySet: Map<string, SetRenders>; complete: boolean } {
  const bySet = new Map<string, SetRenders>();
  for (const job of response.items) {
    // Filtered again: a server that has not learned `templateKey` answers with the brand's latest.
    if (job.templateKey !== templateKey || !job.renderSetId) continue;
    const seen = bySet.get(job.renderSetId);
    bySet.set(job.renderSetId, {
      count: (seen?.count ?? 0) + 1,
      lastAt:
        seen && Date.parse(seen.lastAt) >= Date.parse(job.createdAt) ? seen.lastAt : job.createdAt,
    });
  }
  return { bySet, complete: response.nextCursor === null };
}

/** `18 renders · 9h ago`, or what the loaded page can honestly say about a set it does not hold. */
export function rendersLine(
  renders: SetRenders | undefined,
  complete: boolean,
  now = Date.now(),
): string {
  if (!renders) return complete ? 'No renders yet' : 'No recent renders';
  const noun = `${complete ? '' : 'recent '}render${renders.count === 1 ? '' : 's'}`;
  return `${renders.count} ${noun} · ${formatRelativeTime(renders.lastAt, now)}`;
}

/**
 * The template's recent renders, read through the SAME cached query template detail owns (key,
 * fetcher and freshness identical), so the tabs never cost a jobs read of their own.
 */
export const templateJobsKey = (brandId: string, templateKey: string) =>
  ['forge-template-frame', brandId, templateKey] as const;

function useSetRenders(brandId: string, templateKey: string) {
  return useQuery({
    queryKey: templateJobsKey(brandId, templateKey),
    queryFn: () => apiRendersApi.listJobs(brandId, 10, { templateKey }),
    staleTime: 60_000,
    select: (response) => rendersBySet(response, templateKey),
  });
}

/** One line of text that turns into a field: Enter saves, Esc or leaving cancels. */
function SetDescription({
  name,
  description,
  editRequest,
  onSave,
}: {
  name: string;
  description: string | null;
  /** Bumped by the set's menu to open the field, as a click on the text does. */
  editRequest: number;
  onSave: (description: string | null) => Promise<void>;
}) {
  // `null` while not editing; the text being sent shows until the save settles.
  const [draft, setDraft] = useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new request opens the field.
  useEffect(() => {
    if (editRequest > 0) setDraft(description ?? '');
  }, [editRequest]);
  const [sending, setSending] = useState<{ text: string | null } | null>(null);
  const shown = sending ? sending.text : description;

  if (draft !== null) {
    return (
      <div className="flex min-w-64 flex-1 flex-col gap-0.5">
        <Textarea
          autoFocus
          aria-label={`Description of ${name}`}
          value={draft}
          maxLength={FORGE_RENDER_SET_MAX_DESCRIPTION}
          rows={1}
          className="min-h-0 resize-none px-2 py-1 text-xs md:text-xs"
          // One line: a pasted line break reads as a space.
          onChange={(event) => setDraft(event.target.value.replace(/\s*[\r\n]+\s*/g, ' '))}
          onBlur={() => setDraft(null)}
          onKeyDown={async (event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setDraft(null);
            }
            if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
            event.preventDefault();
            const next = draft.trim() || null;
            setDraft(null);
            if (next === description) return;
            setSending({ text: next });
            try {
              await onSave(next);
            } finally {
              setSending(null);
            }
          }}
        />
        <p className="flex justify-between gap-2 font-mono text-3xs tabular-nums text-muted-foreground">
          <span>Enter saves · Esc cancels</span>
          <span>
            {draft.length}/{FORGE_RENDER_SET_MAX_DESCRIPTION}
          </span>
        </p>
      </div>
    );
  }

  return (
    <button
      type="button"
      title={shown ?? undefined}
      disabled={sending !== null}
      onClick={() => setDraft(description ?? '')}
      className={cn(
        'min-w-0 max-w-[40ch] truncate rounded px-1 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        shown ? 'text-muted-foreground' : 'text-muted-foreground/60',
        sending && 'opacity-60',
      )}
    >
      {shown || 'Add a description'}
    </button>
  );
}

/**
 * Downloads the set as one zip: each row's newest finished render, retries folded in, with a
 * manifest that also lists the rows that did not finish.
 */
async function downloadRenderSet(brandId: string, set: ForgeRenderSet) {
  try {
    const share = await apiRendersApi.shareRenderSetZip(brandId, set.id);
    window.location.assign(`${getApiBaseUrl()}${share.path}`);
  } catch (error) {
    toast.error(
      error instanceof ApiError && error.payload?.error === 'render_batch_not_ready'
        ? `Nothing from “${set.name}” has finished rendering yet.`
        : 'Could not prepare the download. Try again.',
    );
  }
}

/**
 * Shares the set as its Library collection: a link that anyone can open and anyone on the brand can
 * revoke from the Library. Minted per click — the link is the credential, so it is never cached.
 */
async function shareRenderSet(brandId: string, set: ForgeRenderSet) {
  try {
    const share = await apiRendersApi.shareRenderSet(brandId, set.id);
    const url = `${window.location.origin}${share.path}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(
        `Link copied — ${pluralize(share.assetCount, 'render')}, revocable from the Library`,
      );
    } catch {
      // Safari refuses a clipboard write that follows a network round trip.
      window.prompt('Copy this link. It can be revoked from the Library.', url);
    }
  } catch (error) {
    toast.error(
      error instanceof ApiError && error.payload?.error === 'render_set_not_in_library'
        ? `Nothing from “${set.name}” is in the Library yet. Render it first, then share.`
        : 'Could not make the link. Try again.',
    );
  }
}

type SetsDialog =
  | { kind: 'new' }
  | { kind: 'rename'; set: ForgeRenderSet }
  | { kind: 'delete'; set: ForgeRenderSet };

const UNSAVED = '__unsaved__';

/** A tab's name turned into a field by a double-click: Enter saves, Esc or leaving cancels. */
function TabRename({
  set,
  onDone,
  onRename,
}: {
  set: ForgeRenderSet;
  onDone: () => void;
  onRename: (name: string) => void;
}) {
  const [text, setText] = useState(set.name);
  return (
    <Input
      autoFocus
      value={text}
      maxLength={200}
      aria-label={`Rename ${set.name}`}
      className="h-7 w-40 shrink-0 text-xs"
      onChange={(event) => setText(event.target.value)}
      onBlur={onDone}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onDone();
        }
        if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
        event.preventDefault();
        onDone();
        const next = text.trim();
        if (next && next !== set.name) onRename(next);
      }}
    />
  );
}

export function RenderSetTabs({
  brandId,
  templateKey,
  contractHash,
  sets,
  activeSet,
  activeRows,
  dirty,
  confirmDiscard,
  canCreate,
  draftAvailable,
  delivery,
  onSwitch,
  onNew,
  onRename,
  onDescribe,
  onDelete,
  onDuplicate,
  onHistory,
  onUpdate,
  onSettings,
  onImportDraft,
}: {
  brandId: string;
  templateKey: string;
  /** The template as it is now; a set saved against another version says so. */
  contractHash: string;
  sets: ForgeRenderSet[];
  activeSet: ForgeRenderSet | null;
  /** Rows on screen, which is what the active set's count means while it is being edited. */
  activeRows: number;
  /** The rows on screen differ from what the open set saved. */
  dirty: boolean;
  /** Runs `action` now, or after the person agrees to lose the unsaved edits on screen. */
  confirmDiscard: (action: () => void) => void;
  canCreate: boolean;
  /** An unsaved browser draft exists that is not on screen. */
  draftAvailable: boolean;
  /** Where the open set's renders go, said in one line beside it. */
  delivery?: ReactNode;
  onSwitch: (set: ForgeRenderSet) => void;
  onNew: (name: string) => Promise<void>;
  onRename: (set: ForgeRenderSet, name: string) => Promise<void>;
  onDescribe: (set: ForgeRenderSet, description: string | null) => Promise<void>;
  onDelete: (set: ForgeRenderSet) => Promise<void>;
  onDuplicate: (set: ForgeRenderSet) => void;
  onHistory: (set: ForgeRenderSet) => void;
  /** Saves the open set onto the current template; any other set opens first. */
  onUpdate: (set: ForgeRenderSet) => void;
  /** Where this set's renders go: its default ad set, rooms, Proof or Final. */
  onSettings: (set: ForgeRenderSet) => void;
  onImportDraft: () => void;
}) {
  const [dialog, setDialog] = useState<SetsDialog | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [describing, setDescribing] = useState(0);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [jumpOpen, setJumpOpen] = useState(false);
  const renders = useSetRenders(brandId, templateKey);
  const listRef = useRef<HTMLDivElement>(null);
  const activeId = activeSet?.id ?? UNSAVED;

  // The open set's tab is always in view, however many sets sit to either side of it.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-set-id="${activeId}"]`)
      ?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
  }, [activeId]);

  const open = (set: ForgeRenderSet) =>
    set.id === activeSet?.id ? undefined : confirmDiscard(() => onSwitch(set));

  /** One set's actions, for the open set's ⋯ button and a right-click on any tab alike. */
  const setActions = (set: ForgeRenderSet): GridAction[][] => {
    const active = set.id === activeSet?.id;
    return [
      [
        {
          id: 'open',
          label: 'Open',
          icon: FolderOpen,
          disabledReason: active ? 'Already open' : null,
          run: () => open(set),
        },
        {
          id: 'settings',
          label: 'Settings…',
          icon: Settings2,
          hint: 'Where this set’s renders go: a default ad set, Slack, approval, Proof or Final',
          disabledReason: active ? null : 'Open the set first',
          run: () => onSettings(set),
        },
        {
          id: 'rename',
          label: 'Rename…',
          icon: Pencil,
          run: () => setDialog({ kind: 'rename', set }),
        },
        {
          id: 'describe',
          label: 'Edit description',
          icon: Text,
          disabledReason: active ? null : 'Open the set first',
          run: () => setDescribing((current) => current + 1),
        },
        { id: 'duplicate', label: 'Duplicate', icon: Copy, run: () => onDuplicate(set) },
        {
          id: 'download',
          label: 'Download set',
          icon: Download,
          hint: 'One zip of every row’s newest render, with a manifest',
          run: () => void downloadRenderSet(brandId, set),
        },
        {
          id: 'share',
          label: 'Share render set',
          icon: Share2,
          hint: 'Copies a link to its renders in the Library',
          run: () => void shareRenderSet(brandId, set),
        },
        { id: 'history', label: 'Version history…', icon: History, run: () => onHistory(set) },
        ...(set.contractHash === contractHash
          ? []
          : [
              {
                id: 'update',
                label: 'Update to current template',
                icon: RefreshCw,
                run: () => (active ? onUpdate(set) : confirmDiscard(() => onSwitch(set))),
              },
            ]),
      ],
      [
        {
          id: 'delete',
          label: 'Delete…',
          icon: Trash2,
          destructive: true,
          run: () => setDialog({ kind: 'delete', set }),
        },
      ],
    ];
  };

  const rowsOf = (set: ForgeRenderSet) => (set.id === activeSet?.id ? activeRows : set.rows.length);

  return (
    <section aria-label="Render sets" className="flex shrink-0 flex-col gap-1">
      <div className="flex min-w-0 items-end gap-1 border-b border-border">
        <Tabs
          value={activeId}
          onValueChange={(value) => {
            const set = sets.find((item) => item.id === value);
            if (set) open(set);
          }}
          className="min-w-0 flex-1 gap-0"
        >
          <TabsList
            ref={listRef}
            variant="line"
            aria-label="Render sets"
            // Wider than the pane once there are enough sets: it scrolls sideways, never wraps.
            className="h-9 w-full max-w-full justify-start overflow-x-auto overflow-y-hidden [scrollbar-width:thin]"
          >
            {activeSet ? null : (
              <TabsTrigger value={UNSAVED} data-set-id={UNSAVED} className="flex-none text-xs">
                <span className="italic">Unsaved set</span>
                <span className="font-mono text-2xs tabular-nums text-muted-foreground">
                  {activeRows}
                </span>
              </TabsTrigger>
            )}
            {sets.map((set) => {
              if (renaming === set.id)
                return (
                  <TabRename
                    key={set.id}
                    set={set}
                    onDone={() => setRenaming(null)}
                    onRename={(name) => void onRename(set, name)}
                  />
                );
              const active = set.id === activeSet?.id;
              const older = set.contractHash !== contractHash;
              const unsaved = active && dirty;
              return (
                <ContextMenu key={set.id}>
                  <ContextMenuTrigger
                    render={
                      <TabsTrigger
                        value={set.id}
                        data-set-id={set.id}
                        title={[
                          set.name,
                          set.description,
                          older ? 'Saved for an earlier version of this template' : null,
                          unsaved ? 'Unsaved changes' : null,
                        ]
                          .filter(Boolean)
                          .join(' — ')}
                        className="max-w-56 flex-none text-xs"
                        onDoubleClick={() => setRenaming(set.id)}
                      />
                    }
                  >
                    {older ? (
                      <>
                        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-warning" />
                        <span className="sr-only">Older template</span>
                      </>
                    ) : null}
                    <span className="truncate">{set.name}</span>
                    <span className="font-mono text-2xs tabular-nums text-muted-foreground">
                      {rowsOf(set)}
                    </span>
                    {unsaved ? (
                      <>
                        <span aria-hidden className="text-primary">
                          •
                        </span>
                        <span className="sr-only">Unsaved changes</span>
                      </>
                    ) : null}
                  </ContextMenuTrigger>
                  <ContextMenuContent className="min-w-56">
                    <ActionMenuItems kind="context" groups={setActions(set)} />
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}
          </TabsList>
        </Tabs>
        <div className="flex shrink-0 items-center gap-0.5 pb-1">
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label="New render set"
            title="New render set"
            disabled={!canCreate}
            onClick={() => confirmDiscard(() => setDialog({ kind: 'new' }))}
          >
            <Plus aria-hidden />
          </Button>
          <Popover open={jumpOpen} onOpenChange={setJumpOpen}>
            <PopoverTrigger
              disabled={sets.length === 0}
              render={
                <Button type="button" size="xs" variant="ghost" className="gap-1">
                  All sets <ChevronDown aria-hidden />
                </Button>
              }
            />
            <PopoverContent align="end" className="w-80 p-0">
              <Command
                filter={(_id, search, keywords = []) => defaultFilter(keywords.join(' '), search)}
              >
                <CommandInput placeholder="Filter sets" aria-label="Filter render sets" />
                <CommandList>
                  <CommandEmpty>No set matches.</CommandEmpty>
                  {sets.map((set) => (
                    <CommandItem
                      key={set.id}
                      value={set.id}
                      keywords={[set.name, set.description ?? '']}
                      onSelect={() => {
                        setJumpOpen(false);
                        open(set);
                      }}
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate">{set.name}</span>
                        <span className="truncate text-2xs text-muted-foreground">
                          {[
                            `${rowsOf(set)} row${rowsOf(set) === 1 ? '' : 's'}`,
                            renders.data
                              ? rendersLine(renders.data.bySet.get(set.id), renders.data.complete)
                              : null,
                            set.description,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      {set.id === activeSet?.id ? <Check aria-hidden /> : null}
                    </CommandItem>
                  ))}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* The open set in one line: what it is for, whether it has rendered, where it delivers. */}
      <div className="flex min-h-6 min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-2xs">
        {activeSet ? (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Actions for ${activeSet.name}`}
                    className="text-muted-foreground"
                  >
                    <MoreHorizontal aria-hidden />
                  </Button>
                }
              />
              <DropdownMenuContent align="start" className="w-56">
                <ActionMenuItems kind="dropdown" groups={setActions(activeSet)} />
              </DropdownMenuContent>
            </DropdownMenu>
            <SetDescription
              name={activeSet.name}
              description={activeSet.description}
              editRequest={describing}
              onSave={(description) => onDescribe(activeSet, description)}
            />
            <span aria-hidden className="text-muted-foreground/50">
              ·
            </span>
            <span className="font-mono tabular-nums text-muted-foreground">
              {renders.data
                ? rendersLine(renders.data.bySet.get(activeSet.id), renders.data.complete)
                : renders.isError
                  ? 'Renders unavailable'
                  : ' '}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">
            Not saved yet — name the set with + to keep these rows.
          </span>
        )}
        {delivery ? <span className="ml-auto flex min-w-0 items-center">{delivery}</span> : null}
        {draftAvailable ? (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className={delivery ? undefined : 'ml-auto'}
            onClick={() => confirmDiscard(onImportDraft)}
          >
            <History data-icon="inline-start" /> Import browser draft
          </Button>
        ) : null}
      </div>

      <NameDialog
        open={dialog?.kind === 'new'}
        title="New render set"
        description="Starts from one row seeded with the designer's values."
        initialName="Untitled set"
        confirmLabel="Create"
        onOpenChange={(open) => !open && setDialog(null)}
        onConfirm={async (name) => {
          await onNew(name);
          setDialog(null);
        }}
      />
      <NameDialog
        open={dialog?.kind === 'rename'}
        title="Rename render set"
        initialName={dialog?.kind === 'rename' ? dialog.set.name : ''}
        confirmLabel="Rename"
        onOpenChange={(open) => !open && setDialog(null)}
        onConfirm={async (name) => {
          if (dialog?.kind === 'rename') await onRename(dialog.set, name);
          setDialog(null);
        }}
      />
      <AlertDialog
        open={dialog?.kind === 'delete'}
        onOpenChange={(open) => !open && !deleting && setDialog(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete “{dialog?.kind === 'delete' ? dialog.set.name : ''}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The saved rows go. Renders already made from this set stay in Render ledger.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={async () => {
                if (dialog?.kind !== 'delete') return;
                setDeleting(true);
                try {
                  await onDelete(dialog.set);
                } finally {
                  setDeleting(false);
                  setDialog(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

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
import { useLocale, type useTranslations, useTranslations as useUiTranslations } from 'next-intl';
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
import type { UiLocale } from '@/i18n/config';
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
  locale: UiLocale = 'en',
  labels?: {
    empty: string;
    recentEmpty: string;
    count: (count: number, recent: boolean) => string;
  },
): string {
  if (!renders)
    return labels
      ? complete
        ? labels.empty
        : labels.recentEmpty
      : complete
        ? 'No renders yet'
        : 'No recent renders';
  const noun = `${complete ? '' : 'recent '}render${renders.count === 1 ? '' : 's'}`;
  const summary = labels ? labels.count(renders.count, !complete) : `${renders.count} ${noun}`;
  return `${summary} · ${formatRelativeTime(renders.lastAt, now, locale)}`;
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
  const translateUi = useUiTranslations('forge');

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
          aria-label={translateUi('description_of_value0_3bcccf41', { value0: String(name) })}
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
          <span>{translateUi('enter_saves_esc_cancels_301611b3')}</span>
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
      {shown || translateUi('add_a_description_e707b452')}
    </button>
  );
}

/**
 * Downloads the set as one zip: each row's newest finished render, retries folded in, with a
 * manifest that also lists the rows that did not finish.
 */
async function downloadRenderSet(
  brandId: string,
  set: ForgeRenderSet,
  translate: ReturnType<typeof useTranslations<'forge'>>,
) {
  try {
    const share = await apiRendersApi.shareRenderSetZip(brandId, set.id);
    window.location.assign(`${getApiBaseUrl()}${share.path}`);
  } catch (error) {
    toast.error(
      error instanceof ApiError && error.payload?.error === 'render_batch_not_ready'
        ? translate('setNothingFinished', { name: set.name })
        : translate('setDownloadFailed'),
    );
  }
}

/**
 * Shares the set as its Library collection: a link that anyone can open and anyone on the brand can
 * revoke from the Library. Minted per click — the link is the credential, so it is never cached.
 */
async function shareRenderSet(
  brandId: string,
  set: ForgeRenderSet,
  translate: ReturnType<typeof useTranslations<'forge'>>,
) {
  try {
    const share = await apiRendersApi.shareRenderSet(brandId, set.id);
    const url = `${window.location.origin}${share.path}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(translate('setLinkCopied', { count: share.assetCount }));
    } catch {
      // Safari refuses a clipboard write that follows a network round trip.
      window.prompt(translate('setCopyLink'), url);
    }
  } catch (error) {
    toast.error(
      error instanceof ApiError && error.payload?.error === 'render_set_not_in_library'
        ? translate('setNothingInLibrary', { name: set.name })
        : translate('setShareFailed'),
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
  const translateUi = useUiTranslations('forge');

  const [text, setText] = useState(set.name);
  return (
    <Input
      autoFocus
      value={text}
      maxLength={200}
      aria-label={translateUi('rename_value0_bb7a240d', { value0: String(set.name) })}
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
  const translateUi = useUiTranslations('forge');
  const locale = useLocale();
  const renderLabels = {
    empty: translateUi('noRenders'),
    recentEmpty: translateUi('noRecentRenders'),
    count: (count: number, recent: boolean) =>
      translateUi(recent ? 'recentRenderCount' : 'renderCount', { count }),
  };

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
          label: translateUi('open_ed077f3d'),
          icon: FolderOpen,
          disabledReason: active ? 'Already open' : null,
          run: () => open(set),
        },
        {
          id: 'settings',
          label: translateUi('settings_7a04083b'),
          icon: Settings2,
          hint: 'Where this set’s renders go: a default ad set, Slack, approval, Proof or Final',
          disabledReason: active ? null : 'Open the set first',
          run: () => onSettings(set),
        },
        {
          id: 'rename',
          label: translateUi('rename_6fa62b3d'),
          icon: Pencil,
          run: () => setDialog({ kind: 'rename', set }),
        },
        {
          id: 'describe',
          label: translateUi('edit_description_3495f1b0'),
          icon: Text,
          disabledReason: active ? null : 'Open the set first',
          run: () => setDescribing((current) => current + 1),
        },
        {
          id: 'duplicate',
          label: translateUi('duplicate_02cdaabf'),
          icon: Copy,
          run: () => onDuplicate(set),
        },
        {
          id: 'download',
          label: translateUi('download_set_5bfdcac2'),
          icon: Download,
          hint: 'One zip of every row’s newest render, with a manifest',
          run: () => void downloadRenderSet(brandId, set, translateUi),
        },
        {
          id: 'share',
          label: translateUi('share_render_set_ecf2c04f'),
          icon: Share2,
          hint: 'Copies a link to its renders in the Library',
          run: () => void shareRenderSet(brandId, set, translateUi),
        },
        {
          id: 'history',
          label: translateUi('version_history_ac3fc859'),
          icon: History,
          run: () => onHistory(set),
        },
        ...(set.contractHash === contractHash
          ? []
          : [
              {
                id: 'update',
                label: translateUi('update_to_current_template_12c0a8ec'),
                icon: RefreshCw,
                run: () => (active ? onUpdate(set) : confirmDiscard(() => onSwitch(set))),
              },
            ]),
      ],
      [
        {
          id: 'delete',
          label: translateUi('delete_9ce78fe3'),
          icon: Trash2,
          destructive: true,
          run: () => setDialog({ kind: 'delete', set }),
        },
      ],
    ];
  };

  const rowsOf = (set: ForgeRenderSet) => (set.id === activeSet?.id ? activeRows : set.rows.length);

  return (
    <section
      aria-label={translateUi('render_sets_00d1ed04')}
      className="flex shrink-0 flex-col gap-1"
    >
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
            aria-label={translateUi('render_sets_00d1ed04')}
            // Wider than the pane once there are enough sets: it scrolls sideways, never wraps.
            className="h-9 w-full max-w-full justify-start overflow-x-auto overflow-y-hidden [scrollbar-width:thin]"
          >
            {activeSet ? null : (
              <TabsTrigger value={UNSAVED} data-set-id={UNSAVED} className="flex-none text-xs">
                <span className="italic">{translateUi('unsaved_set_fe567ee3')}</span>
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
                        <span className="sr-only">{translateUi('older_template_631ab51f')}</span>
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
                        <span className="sr-only">{translateUi('unsaved_changes_a710c2b9')}</span>
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
            aria-label={translateUi('new_render_set_33ea6e8b')}
            title={translateUi('new_render_set_33ea6e8b')}
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
                  {' '}
                  {translateUi('all_sets_9d5e2c25')} <ChevronDown aria-hidden />
                </Button>
              }
            />
            <PopoverContent align="end" className="w-80 p-0">
              <Command
                filter={(_id, search, keywords = []) => defaultFilter(keywords.join(' '), search)}
              >
                <CommandInput
                  placeholder={translateUi('filter_sets_ab8b91c7')}
                  aria-label={translateUi('filter_render_sets_db155c60')}
                />
                <CommandList>
                  <CommandEmpty>{translateUi('no_set_matches_8259c4f4')}</CommandEmpty>
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
                            translateUi('rowCount', { count: rowsOf(set) }),
                            renders.data
                              ? rendersLine(
                                  renders.data.bySet.get(set.id),
                                  renders.data.complete,
                                  undefined,
                                  locale,
                                  renderLabels,
                                )
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
                    aria-label={translateUi('actions_for_value0_33da220b', {
                      value0: String(activeSet.name),
                    })}
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
                ? rendersLine(
                    renders.data.bySet.get(activeSet.id),
                    renders.data.complete,
                    undefined,
                    locale,
                    renderLabels,
                  )
                : renders.isError
                  ? translateUi('renders_unavailable_d1a44614')
                  : ' '}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">
            {' '}
            {translateUi('not_saved_yet_name_the_set_with_to__73205d6b')}{' '}
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
            <History data-icon="inline-start" /> {translateUi('import_browser_draft_0694875c')}{' '}
          </Button>
        ) : null}
      </div>

      <NameDialog
        open={dialog?.kind === 'new'}
        title={translateUi('new_render_set_33ea6e8b')}
        description={translateUi('starts_from_one_row_seeded_with_the_a68310fc')}
        initialName="Untitled set"
        confirmLabel={translateUi('create_4759498a')}
        onOpenChange={(open) => !open && setDialog(null)}
        onConfirm={async (name) => {
          await onNew(name);
          setDialog(null);
        }}
      />
      <NameDialog
        open={dialog?.kind === 'rename'}
        title={translateUi('rename_render_set_f8b05ccf')}
        initialName={dialog?.kind === 'rename' ? dialog.set.name : ''}
        confirmLabel={translateUi('rename_3064d79a')}
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
              {' '}
              {translateUi('delete_fdd77e66')}
              {dialog?.kind === 'delete' ? dialog.set.name : ''}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {' '}
              {translateUi('the_saved_rows_go_renders_already_m_8314b90e')}{' '}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {translateUi('cancel_19766ed6')}
            </AlertDialogCancel>
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
              {' '}
              {translateUi('delete_e2d0a549')}{' '}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

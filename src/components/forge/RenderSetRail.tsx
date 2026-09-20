'use client';

import {
  type ApiRenderJobListResponse,
  FORGE_RENDER_SET_MAX_DESCRIPTION,
  type ForgeRenderSet,
} from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import {
  Copy,
  FolderOpen,
  History,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  RefreshCw,
  Text,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { ActionMenuItems, type GridAction } from '@/components/forge/gridActions';
import { NameDialog } from '@/components/forge/RenderSetMenu';
import { InlineRename } from '@/components/forge/TemplateCard';
import { Pill } from '@/components/kibo-ui/pill';
import { SectionHeader } from '@/components/shared/SectionHeader';
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
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { cn } from '@/lib/utils';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';

// The template's render sets, always on screen beside the grid: which one the rows came from, what
// each is for, and whether it has been rendered. Anything that replaces the rows on screen goes
// through the grid's `confirmDiscard`, the one place that asks first when they hold unsaved edits.

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

const rowCount = (count: number) => `${count} row${count === 1 ? '' : 's'}`;

/**
 * The template's recent renders, read through the SAME cached query template detail owns (key,
 * fetcher and freshness identical), so the rail never costs a jobs read of its own.
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
      <div className="pointer-events-auto relative z-10 flex flex-col gap-0.5">
        <Textarea
          // biome-ignore lint/a11y/noAutofocus: the person just asked to edit this description
          autoFocus
          aria-label={`Description of ${name}`}
          value={draft}
          maxLength={FORGE_RENDER_SET_MAX_DESCRIPTION}
          rows={2}
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
        // As wide as its text, so the rest of the line still opens the set.
        'pointer-events-auto relative z-10 -mx-1 max-w-full self-start truncate rounded px-1 text-left text-2xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        shown ? 'text-muted-foreground' : 'text-muted-foreground/60',
        sending && 'opacity-60',
      )}
    >
      {shown || 'Add a description'}
    </button>
  );
}

type RailDialog =
  | { kind: 'new' }
  | { kind: 'rename'; set: ForgeRenderSet }
  | { kind: 'delete'; set: ForgeRenderSet };

export function RenderSetRail({
  brandId,
  templateKey,
  contractHash,
  sets,
  activeSet,
  activeRows,
  confirmDiscard,
  canCreate,
  draftAvailable,
  collapsed,
  onCollapsedChange,
  onSwitch,
  onNew,
  onRename,
  onDescribe,
  onDelete,
  onDuplicate,
  onHistory,
  onUpdate,
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
  /** Runs `action` now, or after the person agrees to lose the unsaved edits on screen. */
  confirmDiscard: (action: () => void) => void;
  canCreate: boolean;
  /** An unsaved browser draft exists that is not on screen. */
  draftAvailable: boolean;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onSwitch: (set: ForgeRenderSet) => void;
  onNew: (name: string) => Promise<void>;
  onRename: (set: ForgeRenderSet, name: string) => Promise<void>;
  onDescribe: (set: ForgeRenderSet, description: string | null) => Promise<void>;
  onDelete: (set: ForgeRenderSet) => Promise<void>;
  onDuplicate: (set: ForgeRenderSet) => void;
  onHistory: (set: ForgeRenderSet) => void;
  /** Saves the open set onto the current template; any other set opens first. */
  onUpdate: (set: ForgeRenderSet) => void;
  onImportDraft: () => void;
}) {
  const [dialog, setDialog] = useState<RailDialog | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [describing, setDescribing] = useState<{ id: string; request: number } | null>(null);
  const [filter, setFilter] = useState('');
  const renders = useSetRenders(brandId, templateKey);

  /** One set's actions, for its ⋯ button and a right-click on it alike. */
  const setActions = (set: ForgeRenderSet): GridAction[][] => {
    const active = set.id === activeSet?.id;
    return [
      [
        {
          id: 'open',
          label: 'Open',
          icon: FolderOpen,
          disabledReason: active ? 'Already open' : null,
          run: () => confirmDiscard(() => onSwitch(set)),
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
          run: () =>
            setDescribing((current) => ({ id: set.id, request: (current?.request ?? 0) + 1 })),
        },
        { id: 'duplicate', label: 'Duplicate', icon: Copy, run: () => onDuplicate(set) },
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
  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? sets.filter((set) => `${set.name} ${set.description ?? ''}`.toLowerCase().includes(needle))
    : sets;

  const dialogs = (
    <>
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
    </>
  );

  if (collapsed) {
    return (
      <aside className="flex h-full min-h-0 flex-col items-center gap-2 py-1.5">
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label="Show render sets"
          onClick={() => onCollapsedChange(false)}
        >
          <PanelLeftOpen aria-hidden />
        </Button>
        {/* Still says which set the rows are from, sideways, so folding the rail hides nothing. */}
        <span className="min-h-0 rotate-180 truncate text-2xs text-muted-foreground [writing-mode:vertical-rl]">
          {activeSet?.name ?? 'Unsaved set'}
        </span>
        {dialogs}
      </aside>
    );
  }

  return (
    <aside className="flex h-full min-h-0 flex-col">
      <SectionHeader
        title="Sets"
        className="py-1"
        action={
          <div className="flex items-center gap-0.5">
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={!canCreate}
              onClick={() => confirmDiscard(() => setDialog({ kind: 'new' }))}
            >
              <Plus data-icon="inline-start" /> New set
            </Button>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label="Hide render sets"
              onClick={() => onCollapsedChange(true)}
            >
              <PanelLeftClose aria-hidden />
            </Button>
          </div>
        }
      />
      {sets.length > 8 ? (
        <div className="shrink-0 border-b border-border px-[var(--card-pad)] py-1">
          <Input
            type="search"
            aria-label="Filter render sets"
            placeholder="Filter sets"
            className="h-7 text-xs"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </div>
      ) : null}
      <ul
        aria-label="Render sets"
        className="min-h-0 flex-1 divide-y divide-border overflow-y-auto"
      >
        {activeSet ? null : (
          <li className="relative flex flex-col gap-0.5 bg-muted/60 py-2 pr-2 pl-[var(--card-pad)]">
            <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-primary" />
            <p className="flex min-w-0 items-center gap-1.5 text-xs" aria-current="true">
              <span className="truncate font-medium">Unsaved set</span>
              <span className="ml-auto shrink-0 font-mono text-2xs tabular-nums text-muted-foreground">
                {rowCount(activeRows)}
              </span>
            </p>
            <p className="text-2xs text-muted-foreground">Save keeps these rows as a set.</p>
          </li>
        )}
        {shown.map((set) => {
          const active = set.id === activeSet?.id;
          const open = () => (active ? undefined : confirmDiscard(() => onSwitch(set)));
          return (
            <ContextMenu key={set.id}>
              <ContextMenuTrigger
                render={
                  // biome-ignore lint/a11y/useKeyWithClickEvents: a pointer shortcut over the row; the Open button under it is the keyboard path
                  <li
                    className={cn(
                      'relative flex min-w-0 flex-col gap-0.5 py-1.5 pr-2 pl-[var(--card-pad)] select-text hover:bg-muted/40',
                      active && 'bg-muted/60 hover:bg-muted/60',
                    )}
                    onClick={(event) => {
                      // The name's own text opens the set too; only the controls keep their clicks.
                      if (
                        (event.target as Element).closest('button, input, textarea, [role="menu"]')
                      )
                        return;
                      open();
                    }}
                  />
                }
              >
                {active ? (
                  <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-primary" />
                ) : null}
                {/* The whole row opens the set; its rename, description and menu controls sit above. */}
                <button
                  type="button"
                  aria-label={`Open ${set.name}`}
                  aria-current={active ? 'true' : undefined}
                  onClick={open}
                  className="absolute inset-0 z-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                />
                <div className="pointer-events-none relative flex min-w-0 items-center gap-1">
                  <InlineRename
                    value={set.name}
                    onRename={(name) => void onRename(set, name)}
                    className="h-6 min-w-0 text-xs font-medium"
                  />
                  {set.contractHash === contractHash ? null : (
                    <Pill
                      variant="warning"
                      title="Saved for an earlier version of this template. Saving updates it."
                      className="shrink-0 text-3xs"
                    >
                      Older template
                    </Pill>
                  )}
                  <span className="ml-auto shrink-0 font-mono text-2xs tabular-nums text-muted-foreground">
                    {rowCount(active ? activeRows : set.rows.length)}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          aria-label={`Actions for ${set.name}`}
                          className="pointer-events-auto relative z-10 shrink-0 text-muted-foreground"
                        >
                          <MoreHorizontal aria-hidden />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end" className="w-56">
                      <ActionMenuItems kind="dropdown" groups={setActions(set)} />
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <SetDescription
                  name={set.name}
                  description={set.description}
                  editRequest={describing?.id === set.id ? describing.request : 0}
                  onSave={(description) => onDescribe(set, description)}
                />
                <p className="pointer-events-none relative truncate font-mono text-3xs tabular-nums text-muted-foreground">
                  {renders.data
                    ? rendersLine(renders.data.bySet.get(set.id), renders.data.complete)
                    : renders.isError
                      ? 'Renders unavailable'
                      : ' '}
                </p>
              </ContextMenuTrigger>
              <ContextMenuContent className="min-w-56">
                <ActionMenuItems kind="context" groups={setActions(set)} />
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </ul>
      {draftAvailable ? (
        <div className="shrink-0 border-t border-border px-[var(--card-pad)] py-1">
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="-mx-2"
            onClick={() => confirmDiscard(onImportDraft)}
          >
            <History data-icon="inline-start" /> Import browser draft
          </Button>
        </div>
      ) : null}
      {dialogs}
    </aside>
  );
}

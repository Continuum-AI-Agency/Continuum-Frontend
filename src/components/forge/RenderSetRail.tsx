'use client';

import {
  type ApiRenderJobListResponse,
  FORGE_RENDER_SET_MAX_DESCRIPTION,
  type ForgeRenderSet,
} from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import {
  History,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { NameDialog } from '@/components/forge/RenderSetMenu';
import { InlineRename } from '@/components/forge/TemplateCard';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  onSave,
}: {
  name: string;
  description: string | null;
  onSave: (description: string | null) => Promise<void>;
}) {
  // `null` while not editing; the text being sent shows until the save settles.
  const [draft, setDraft] = useState<string | null>(null);
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
  onImportDraft,
}: {
  brandId: string;
  templateKey: string;
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
  onImportDraft: () => void;
}) {
  const [dialog, setDialog] = useState<RailDialog | null>(null);
  const [deleting, setDeleting] = useState(false);
  const renders = useSetRenders(brandId, templateKey);

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
        {sets.map((set) => {
          const active = set.id === activeSet?.id;
          const open = () => (active ? undefined : confirmDiscard(() => onSwitch(set)));
          return (
            // biome-ignore lint/a11y/useKeyWithClickEvents: a pointer shortcut over the row; the Open button under it is the keyboard path
            <li
              key={set.id}
              className={cn(
                'relative flex min-w-0 flex-col gap-0.5 py-1.5 pr-2 pl-[var(--card-pad)] hover:bg-muted/40',
                active && 'bg-muted/60 hover:bg-muted/60',
              )}
              onClick={(event) => {
                // The name's own text opens the set too; only the controls keep their clicks.
                if ((event.target as Element).closest('button, input, textarea, [role="menu"]'))
                  return;
                open();
              }}
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
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuGroup>
                      <DropdownMenuItem onClick={() => setDialog({ kind: 'rename', set })}>
                        <Pencil aria-hidden /> Rename…
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setDialog({ kind: 'delete', set })}
                      >
                        <Trash2 aria-hidden /> Delete…
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <SetDescription
                name={set.name}
                description={set.description}
                onSave={(description) => onDescribe(set, description)}
              />
              <p className="pointer-events-none relative truncate font-mono text-3xs tabular-nums text-muted-foreground">
                {renders.data
                  ? rendersLine(renders.data.bySet.get(set.id), renders.data.complete)
                  : renders.isError
                    ? 'Renders unavailable'
                    : ' '}
              </p>
            </li>
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

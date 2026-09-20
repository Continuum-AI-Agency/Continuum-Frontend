'use client';

import {
  API_RENDER_MEDIA_LIST_MAX,
  type ApiRenderBatchRecord,
  type ApiRenderInputSet,
  type ApiRenderInputValue,
  type ApiRenderSuggestRowsResponse,
  type ApiRenderTemplateContract,
  type ApiRenderTemplateSummary,
  type ApiRenderVariable,
  apiRenderPreflightResponseSchema,
  FORGE_RENDER_SET_MAX_DESCENDANT_DEPTH,
  type ForgeRenderSet,
  type ForgeRenderSetRevision,
  type ForgeRenderSetRow,
  type MediaAsset,
  readableLayerName,
  templateRefOf,
} from '@continuum/contracts';
import {
  type Announcements,
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragMoveEvent,
  type KeyboardCoordinateGetter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { useQueryClient } from '@tanstack/react-query';
import {
  type ColumnDef,
  type ExpandedState,
  getCoreRowModel,
  getExpandedRowModel,
  type RowSelectionState,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table';
import { ChevronDown, ChevronRight, Loader2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDefaultLayout, usePanelRef } from 'react-resizable-panels';
import { AiDraftDialog, type AiDraftParent } from '@/components/forge/AiVariationsDialog';
import { DataGrid, KIND_ICONS, STICKY_LEFT, selectColumn } from '@/components/forge/DataGrid';
import {
  ActionMenuItems,
  type GridActionContext,
  menuFor,
  selectionActions,
  takeFocusAfter,
} from '@/components/forge/gridActions';
import { isStillsOnly } from '@/components/forge/OutputSettingsPanel';
import { FORGE_STALE_MS, forgeQueryKeys } from '@/components/forge/queryKeys';
import { RenderPreviewPanel } from '@/components/forge/RenderPreviewPanel';
import { RenderReviewTray } from '@/components/forge/RenderReviewTray';
import {
  downloadTemplateCsv,
  fetchLibraryAsset,
  RenderRowsImport,
} from '@/components/forge/RenderRowsImport';
import { NameDialog } from '@/components/forge/RenderSetMenu';
import { RenderSetRail, templateJobsKey } from '@/components/forge/RenderSetRail';
import { RenderToolbar, templateLabel } from '@/components/forge/RenderToolbar';
import {
  addSibling,
  applyFormats,
  applyValue,
  clearKey,
  descendantsOf,
  discardProposed,
  draftStorageKey,
  duplicateLabel,
  effectiveEncode,
  effectiveOutputIds,
  effectiveValues,
  emptyHistory,
  forkLabel,
  fromRenderSetRows,
  keepProposed,
  MAX_BATCH_ROWS,
  mergeSetRows,
  missingInputs,
  moveRow,
  nestRows,
  newRowId,
  PREFLIGHT_DEBOUNCE_MS,
  parseDelimited,
  proposedIds,
  pushHistory,
  type RequestRow,
  type RowDrop,
  rebaseRows,
  renderedRatios,
  resetKey,
  restoreRows,
  reviewSignature,
  rootRowId,
  rowBreadcrumb,
  rowDepth,
  rowFileCount,
  rowMediaOf,
  rowsFromSuggestion,
  seedRow,
  toPreflightDelivery,
  toRenderSetRows,
  toVariableMap,
  validateRow,
} from '@/components/forge/renderRequestRows';
import {
  DragHandleCell,
  EncodeCell,
  FormatsCell,
  LabelCell,
  type RequestGridMeta,
  type RequestRowActions,
  RowDropHintContext,
  RowFields,
  SortableRequestRow,
  StatusCell,
  VariableCell,
  type VariableColumnMeta,
} from '@/components/forge/requestCells';
import { SetHistoryDialog } from '@/components/forge/SetHistoryDialog';
import { useActiveBrandContext } from '@/components/providers/ActiveBrandProvider';
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
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { toast } from '@/components/ui/toast-imperative';
import { ApiError } from '@/lib/api/errors';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';
import { pickedPins, pinFromAsset } from '@/StudioCanvas/nodes/api-render/RenderVariableFields';
import { describeRenderDiscoveryFailure } from '@/StudioCanvas/nodes/api-render/renderDiscoveryCopy';

// Render requests as a spreadsheet.
//
// One row per render, one column per variable the template exposes. The canvas node fills ONE
// of these per node; a campaign fills fifty, and fifty forms is what NocoBase offered. Every
// cell validates as you type, every row is dry-run against the server the moment it is
// complete, and the selection renders as one batch — the same `records[]` the node sends, so
// there is one batching model and this is only a wider view of it.
//
// Named sets persist on the server; localStorage is only an unsaved-draft recovery copy.
// Confirmed inputs are immutable requests, with independent job attempts.
//
// Columns are built from the CONTRACT alone and their cells are module-level components
// (requestCells.tsx): anything that changes per keystroke reaches them through the table's
// `meta`. A column set that depended on `rows` remounted every cell on every keystroke.

/** The review tray folded down to its one strip: the readiness line. Render opens it. */
const TRAY_COLLAPSED_SIZE = '2.5rem';
const TRAY_OPEN_SIZE = '40%';
/** The sets rail folded to its one button and the open set's name, set on its side. */
const RAIL_COLLAPSED_SIZE = '2.25rem';
/** How long an edit settles before autosave writes it; how long after a failed save it retries. */
const AUTOSAVE_MS = 1500;
const AUTOSAVE_RETRY_MS = 5000;
/** A third of a row per arrow press, so the keyboard reaches before, inside and after a row. */
const KEYBOARD_DROP_STEP_PX = 12;

type Persisted = { rows: RequestRow[]; rowsWithLabel?: never };

function readDrafts(key: string): RequestRow[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Persisted;
    if (!Array.isArray(parsed.rows)) return null;
    // The server's verdict does not survive a reload — tokens expire, contracts move.
    return parsed.rows.map((row, index) => ({
      ...row,
      parentId: row.parentId ?? null,
      clearedKeys: row.clearedKeys ?? [],
      outputIds: row.outputIds ?? [],
      label: row.label || (index === 0 ? 'Base' : `Render ${index + 1}`),
      check: { state: 'idle' },
    }));
  } catch {
    return null;
  }
}

const allOutputIdsOf = (contract: ApiRenderTemplateContract | null) =>
  contract?.outputs.map((output) => output.id) ?? [];

/** A fresh set: one base row carrying the designer's own values, in every format. */
const seededRows = (contract: ApiRenderTemplateContract): RequestRow[] => [
  { ...seedRow(contract.variables, 'Base'), outputIds: allOutputIdsOf(contract) },
];

/** What "saved" is compared against: the rows exactly as a render set would store them. */
const signatureOf = (rows: RequestRow[], contract: ApiRenderTemplateContract | null) =>
  JSON.stringify(toRenderSetRows(rows, allOutputIdsOf(contract)));

/** Inputs, not a render, so the snapshot is everything the dry-run is asked about. */
const preflightSnapshot = (rows: RequestRow[], id: string) =>
  JSON.stringify([effectiveValues(rows, id), effectiveEncode(rows, id) ?? null]);

const rowStepCoordinates: KeyboardCoordinateGetter = (event, { currentCoordinates }) => {
  if (event.code === 'ArrowDown')
    return { ...currentCoordinates, y: currentCoordinates.y + KEYBOARD_DROP_STEP_PX };
  if (event.code === 'ArrowUp')
    return { ...currentCoordinates, y: currentCoordinates.y - KEYBOARD_DROP_STEP_PX };
  return undefined;
};

/** The row under the dragged row's centre, and whether that centre is on its edge or middle. */
function dropFor(event: DragMoveEvent | DragEndEvent): RowDrop | null {
  const { active, over } = event;
  const rect = active.rect.current.translated;
  if (!over || !rect || over.id === active.id || over.rect.height === 0) return null;
  const ratio = (rect.top + rect.height / 2 - over.rect.top) / over.rect.height;
  return {
    rowId: String(over.id),
    position: ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'inside',
  };
}

function buildColumns(contract: ApiRenderTemplateContract | null): ColumnDef<RequestRow>[] {
  if (!contract) return [];
  const perVariable = contract.variables.map((variable): ColumnDef<RequestRow> => {
    const Icon = variable.reserved ? KIND_ICONS.reserved : KIND_ICONS[variable.kind];
    return {
      id: variable.key,
      meta: { variable } satisfies VariableColumnMeta,
      header: () => (
        <span className="flex items-center gap-1">
          <Icon className="size-3" aria-hidden />
          {readableLayerName(variable.label)}
          {variable.required && !variable.reserved ? ' *' : ''}
        </span>
      ),
      cell: VariableCell,
    };
  });
  return [
    // The row's handle, checkbox and name stay in view while the variables scroll past.
    { id: 'drag', size: 28, header: '', cell: DragHandleCell, meta: STICKY_LEFT },
    selectColumn<RequestRow>(),
    { id: 'label', size: 232, header: 'Name', cell: LabelCell, meta: STICKY_LEFT },
    // The values come first: they are what a person edits row after row. Formats and output
    // settings are set once, so they wait at the end of the row.
    ...perVariable,
    // A template that publishes no outputs still renders its source's ratios, all together.
    ...(contract.outputs.length || contract.template.ratios.length
      ? [{ id: 'outputs', size: 150, header: 'Formats', cell: FormatsCell }]
      : []),
    ...(contract.encode && !isStillsOnly(contract)
      ? [{ id: 'encode', size: 160, header: 'Output', cell: EncodeCell }]
      : []),
    { id: 'status', size: 110, header: 'Status', cell: StatusCell },
  ];
}

/** "4 of 6 rows ready to render · 1 needs fixing · 1 still checking" — no state word to decode. */
function readinessSummary(
  counts: { ready: number; blocked: number; needsInput: number; review: number; checking: number },
  total: number,
): string {
  const needs = (count: number, what: string) =>
    count ? `${count} ${count === 1 ? 'needs' : 'need'} ${what}` : null;
  return [
    total === 0
      ? 'No rows to render'
      : counts.ready === total
        ? `${total === 1 ? 'The row is' : `All ${total} rows are`} ready to render`
        : `${counts.ready} of ${total} ${total === 1 ? 'row' : 'rows'} ready to render`,
    needs(counts.needsInput, 'input'),
    needs(counts.blocked, 'fixing'),
    needs(counts.review, 'a review'),
    counts.checking ? `${counts.checking} still checking` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** "Deleted 3 rows, 2 variations included" — variations are named only when nobody picked them. */
function deletedMessage(picked: number, all: number): string {
  const extra = all - picked;
  return `Deleted ${picked} ${picked === 1 ? 'row' : 'rows'}${
    extra ? `, ${extra} ${extra === 1 ? 'variation' : 'variations'} included` : ''
  }`;
}

/** Hidden columns and the Fields drawer are how one person likes the grid; this browser keeps them. */
const columnsStorageKey = (brandId: string, templateKey: string) =>
  `forge:render-columns:${brandId}:${templateKey}`;
const FIELDS_OPEN_KEY = 'forge:render-fields-open';

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or private mode: the preference lasts until the page closes.
  }
}

/** The columns that say which row you are looking at stay; every other one can be hidden. */
const HIDEABLE = (columnId: string) => !['drag', 'select', 'label'].includes(columnId);

/**
 * "Open this in Render": which template, and optionally which saved render set, to land on — and
 * whether to open the AI draft there, where its rows will land.
 */
export type ForgeRenderIntent = {
  templateKey: string;
  /**
   * Which binding the key belongs to. Optional only for callers that cannot know one — a link, a
   * gallery card from a single-binding brand — and resolved against the list when omitted. A key
   * alone is NOT an identity: 133 exists in two sub-apps and means two different templates.
   */
  bindingId?: string;
  renderSetId?: string;
  draftWithAi?: boolean;
};

type NameRequest = {
  title: string;
  description?: string;
  initialName: string;
  confirmLabel: string;
  onConfirm: (name: string) => Promise<void>;
  onCancel?: () => void;
};

export function RenderRequestsGrid({
  brandId,
  onFired,
  intent,
  onIntentConsumed,
  active = true,
}: {
  brandId: string;
  /**
   * Whether the Render tab is showing. The grid stays mounted across tabs (unsaved rows live
   * here), so a rename, publish or adoption made on Templates reaches the picker only by
   * re-listing templates when the tab comes back.
   */
  active?: boolean;
  /**
   * Called with a queued batch's job ids when the person opens the Render ledger from the review
   * tray — the tab shell switches to it. Queuing alone keeps the Render tab, where the tray follows
   * the jobs.
   */
  onFired?: (jobIds: string[]) => void;
  /** Each new intent selects its template and loads its render set, over the newest-set default. */
  intent?: ForgeRenderIntent;
  /** The grid has taken `intent`; the shell drops it so a remount never replays it. */
  onIntentConsumed?: () => void;
}) {
  const queryClient = useQueryClient();
  // A Final is the fleet's `test: false`; the backend refuses it to anyone but an owner or admin.
  const brandRole = useActiveBrandContext().permissions.find(
    (permission) => permission.brand_profile_id === brandId,
  )?.role;
  const finalBlocked =
    brandRole === 'owner' || brandRole === 'admin'
      ? null
      : 'Only a brand owner or admin can render a Final.';
  const [templates, setTemplates] = useState<ApiRenderTemplateSummary[]>([]);
  // Which template, and optionally which saved set, the rows come from. A new object is a new
  // load, so an intent for another set of the same template still reloads.
  const [selection, setSelection] = useState<ForgeRenderIntent>({ templateKey: '' });
  const { templateKey } = selection;
  /**
   * The binding is READ OFF THE CHOSEN TEMPLATE, never chosen separately.
   *
   * The list is merged across every binding the brand holds, and a template key is unique only
   * within a sub-app — 133 exists twice and means two different templates — so the template a
   * person picked already names the only binding its contract, preflight and job can use. Asking
   * for it as a second question could only ever produce a pair that does not exist.
   */
  const bindingId =
    selection.bindingId ??
    templates.find((template) => template.key === templateKey)?.bindingId ??
    null;
  const [contract, setContract] = useState<ApiRenderTemplateContract | null>(null);
  const [inputSets, setInputSets] = useState<ApiRenderInputSet[]>([]);
  const [renderSets, setRenderSets] = useState<ForgeRenderSet[]>([]);
  const [activeSet, setActiveSet] = useState<ForgeRenderSet | null>(null);
  const [draftOffer, setDraftOffer] = useState<RequestRow[] | null>(null);
  /** What opening a set saved for an earlier template trimmed off; saving it makes that final. */
  const [rebaseDrops, setRebaseDrops] = useState<string[]>([]);
  const [saveState, setSaveState] = useState<{ phase: 'idle' | 'saving' | 'failed' }>({
    phase: 'idle',
  });
  /** Someone else's version of the open set, when it and the rows on screen changed one row two ways. */
  const [conflict, setConflict] = useState<ForgeRenderSet | null>(null);
  const [historyFor, setHistoryFor] = useState<ForgeRenderSet | null>(null);
  /** The AI draft dialog: open for new rows (`parent: null`) or for variations of one row. */
  const [aiDraft, setAiDraft] = useState<{
    parent: AiDraftParent | null;
    varyKeys?: string[];
    count?: number;
  } | null>(null);
  /** A menu-driven draft in flight: what the banner says, and what blocks a second click. */
  const [generating, setGenerating] = useState<{ count: number; of: string } | null>(null);
  /** A template whose Render tab was opened to draft with AI, until its contract has loaded. */
  const [draftFor, setDraftFor] = useState<string | null>(null);
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [savedSignature, setSavedSignature] = useState('');
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [expanded, setExpanded] = useState<ExpandedState>(true);
  const [previewRowId, setPreviewRowId] = useState<string | null>(null);
  const [busy, setBusy] = useState<'loading' | 'saving' | 'firing' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pendingDiscard, setPendingDiscard] = useState<(() => void) | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [pasted, setPasted] = useState<{ text: string } | null>(null);
  const [nameRequest, setNameRequest] = useState<NameRequest | null>(null);
  const [dropHint, setDropHint] = useState<RowDrop | null>(null);
  // The open review: `key` is the snapshot the tray reviews, `signature` what it was taken of.
  const [review, setReview] = useState<{ key: number; signature: string } | null>(null);
  const trayPanel = usePanelRef();
  const railPanel = usePanelRef();
  const [railCollapsed, setRailCollapsed] = useState(false);
  // Panel widths, and whether the sets rail is folded, are the person's — remembered in this browser.
  const panelsLayout = useDefaultLayout({
    id: 'forge-render-panels',
    storage: typeof window === 'undefined' ? undefined : localStorage,
  });
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [fieldsOpen, setFieldsOpen] = useState(() => readStored(FIELDS_OPEN_KEY, false));
  /** Where a menu's picked action wants focus once the menu has closed. */
  const menuFocus = useRef<(() => HTMLElement | null) | null>(null);
  const gridBox = useRef<HTMLDivElement>(null);
  /** A row just added, whose name field takes focus once it is on screen. */
  const focusRowId = useRef<string | null>(null);

  const latestRows = useRef(rows);
  latestRows.current = rows;
  // The open set as the server last answered, read by saves that outlive the render that began them.
  const activeSetRef = useRef(activeSet);
  activeSetRef.current = activeSet;
  /** The rows both sides of a conflict started from: the set as last loaded or saved. */
  const savedBase = useRef<ForgeRenderSetRow[]>([]);
  /** The save in flight; the next one, and any rename, waits for it. */
  const inFlight = useRef<Promise<void> | null>(null);
  /** Undo for row edits in this sitting; loading other rows starts it over. */
  const history = useRef(emptyHistory());
  /** The rows as they were, as the next undo step. Called before an edit, never inside setRows. */
  const record = (key: string | null = null) => {
    history.current = pushHistory(history.current, latestRows.current, key, Date.now());
  };
  const replaceRows = (next: RequestRow[]) => {
    latestRows.current = next;
    setRows(next);
    setPreviewRowId((current) =>
      current && next.some((row) => row.id === current) ? current : null,
    );
    setRowSelection((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([id]) => next.some((row) => row.id === id)),
      ),
    );
  };
  const step = (from: 'past' | 'future') => {
    const { past, future } = history.current;
    const stack = from === 'past' ? past : future;
    const snapshot = stack.at(-1);
    if (!snapshot) return false;
    const current = latestRows.current;
    history.current = {
      past: from === 'past' ? past.slice(0, -1) : [...past, current],
      future: from === 'past' ? [...future, current] : future.slice(0, -1),
      lastKey: null,
      lastAt: 0,
    };
    replaceRows(restoreRows(snapshot, current));
    return true;
  };
  const undo = () => step('past');
  const redo = () => step('future');
  /** A change to many rows at once, as one undo step. Nothing changed, nothing recorded. */
  const editRows = (change: (current: RequestRow[]) => RequestRow[]) => {
    const current = latestRows.current;
    const next = change(current);
    if (next.length === current.length && next.every((row, index) => row === current[index]))
      return;
    record();
    replaceRows(next);
  };
  // Read when a template's sets load, which must not itself reload them as the binding settles.
  const bindingRef = useRef(bindingId);
  bindingRef.current = bindingId;

  // --- discovery ---------------------------------------------------------------------------
  // Bumped each time the tab comes back into view; checks the cached template list without
  // touching rows, and re-lists only when that cache is stale or a template mutation invalidated it.
  const [templatesEpoch, setTemplatesEpoch] = useState(0);
  const wasActive = useRef(active);
  useEffect(() => {
    if (active && !wasActive.current) setTemplatesEpoch((epoch) => epoch + 1);
    wasActive.current = active;
  }, [active]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: templatesEpoch is the re-list trigger.
  useEffect(() => {
    let cancelled = false;
    setBusy('loading');
    queryClient
      .fetchQuery({
        // No binding: one merged list of everything this brand may render, from every binding.
        queryKey: forgeQueryKeys.templateList(brandId, null),
        queryFn: () => apiRendersApi.listTemplates(brandId, null),
        staleTime: FORGE_STALE_MS.lists,
      })
      .then((response) => {
        if (cancelled) return;
        setTemplates(response.items);
        setProblem(null);
        // One template is not a decision.
        const only = response.items.length === 1 ? response.items[0] : null;
        if (only)
          setSelection((current) =>
            current.templateKey === only.key && current.bindingId === only.bindingId
              ? current
              : { templateKey: only.key, bindingId: only.bindingId },
          );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setTemplates([]);
        setProblem(describeRenderDiscoveryFailure(error instanceof Error ? error.message : ''));
      })
      .finally(() => {
        if (!cancelled) setBusy(null);
      });
    return () => {
      cancelled = true;
    };
  }, [brandId, queryClient, templatesEpoch]);

  // A loaded set or draft carries Library pins but not their thumbnails or pixel sizes — those
  // are browser-side facts. Look each asset up once so cells, fit checks and the preview have
  // them again.
  const rehydrateMedia = useCallback(
    async (loaded: RequestRow[]) => {
      const wanted = loaded.flatMap((row) =>
        Object.entries(row.values).flatMap(([key, value]) => {
          const pin = pickedPins(value)[0];
          return pin && !row.media[key]?.thumbnailUrl
            ? [{ rowId: row.id, key, assetId: pin.assetId }]
            : [];
        }),
      );
      if (wanted.length === 0) return;
      const ids = [...new Set(wanted.map((item) => item.assetId))];
      const assets = new Map(
        await Promise.all(
          ids.map(
            async (id) =>
              [
                id,
                await queryClient.fetchQuery({
                  queryKey: forgeQueryKeys.mediaAsset(brandId, id),
                  queryFn: () => fetchLibraryAsset(brandId, id),
                  staleTime: FORGE_STALE_MS.lists,
                }),
              ] as const,
          ),
        ),
      );
      setRows((current) =>
        current.map((row) => {
          const found = wanted.filter((item) => item.rowId === row.id && assets.get(item.assetId));
          if (found.length === 0) return row;
          const media = { ...row.media };
          for (const item of found) media[item.key] = rowMediaOf(assets.get(item.assetId)!);
          return { ...row, media };
        }),
      );
    },
    [brandId, queryClient],
  );

  const showRows = useCallback(
    (next: RequestRow[], saved: RequestRow[] | null, forContract: ApiRenderTemplateContract) => {
      history.current = emptyHistory();
      setRows(next);
      // A browser draft was never saved anywhere, so it starts out as unsaved edits.
      setSavedSignature(saved ? signatureOf(saved, forContract) : '');
      setRowSelection({});
      setPreviewRowId(null);
      setExpanded(true);
      setReview(null);
      void rehydrateMedia(next);
    },
    [rehydrateMedia],
  );

  /**
   * A saved set's rows on screen. One saved for an earlier version of the template is trimmed to
   * this one first — a field or format it no longer has would fail every dry-run — and what that
   * dropped is said before anything saves it.
   */
  const openSet = useCallback(
    (set: ForgeRenderSet, forContract: ApiRenderTemplateContract) => {
      activeSetRef.current = set;
      savedBase.current = set.rows;
      setActiveSet(set);
      setConflict(null);
      const loaded = fromRenderSetRows(set.rows);
      const { rows: rebased, dropped } =
        set.contractHash === forContract.template.contractHash
          ? { rows: loaded, dropped: [] }
          : rebaseRows(loaded, forContract);
      setRebaseDrops(dropped);
      showRows(rebased, rebased, forContract);
    },
    [showRows],
  );

  // Only a binding the request actually names reloads the contract: a single environment settling
  // its id must not replace rows someone has started editing.
  const contractBindingId = bindingId;
  useEffect(() => {
    if (!templateKey) {
      setContract(null);
      setRows([]);
      return;
    }
    let cancelled = false;
    Promise.all([
      queryClient.fetchQuery({
        queryKey: forgeQueryKeys.contract(brandId, contractBindingId, templateKey),
        queryFn: () => apiRendersApi.getContract(brandId, templateKey, contractBindingId),
        staleTime: FORGE_STALE_MS.contract,
      }),
      queryClient
        .fetchQuery({
          queryKey: forgeQueryKeys.inputSets(brandId, templateKey),
          queryFn: () => apiRendersApi.listInputSets(brandId, templateKey),
          staleTime: FORGE_STALE_MS.lists,
        })
        .catch(() => ({ items: [] })),
      queryClient
        .fetchQuery({
          queryKey: forgeQueryKeys.renderSetList(brandId, templateKey),
          queryFn: () => apiRendersApi.listRenderSets(brandId, templateKey),
          staleTime: FORGE_STALE_MS.lists,
        })
        .catch(() => ({ items: [] })),
    ])
      .then(([next, sets, savedSets]) => {
        if (cancelled) return;
        setContract(next);
        setInputSets(sets.items);
        // A set belongs to the environment it was saved in; one from another would refuse to render.
        const binding = bindingRef.current;
        const inBinding = savedSets.items.filter((set) => !binding || set.bindingId === binding);
        setRenderSets(inBinding);
        const draft = readDrafts(draftStorageKey(brandId, templateKey));
        const saved =
          inBinding.find((set) => set.id === selection.renderSetId) ?? inBinding[0] ?? null;
        setDraftOffer(saved ? draft : null);
        if (saved) openSet(saved, next);
        else {
          activeSetRef.current = null;
          savedBase.current = [];
          setActiveSet(null);
          setRebaseDrops([]);
          if (draft) showRows(draft, null, next);
          else {
            const seeded = seededRows(next);
            showRows(seeded, seeded, next);
          }
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        toast.error(describeRenderDiscoveryFailure(error instanceof Error ? error.message : ''));
      });
    return () => {
      cancelled = true;
    };
  }, [brandId, selection, templateKey, contractBindingId, queryClient, showRows, openSet]);

  // --- row edits ---------------------------------------------------------------------------
  // biome-ignore lint/correctness/useExhaustiveDependencies: `record` reads refs only.
  const updateRow = useCallback(
    (id: string, patch: (row: RequestRow) => RequestRow, coalesce?: string) => {
      record(coalesce ?? null);
      setRows((current) => {
        const affected = descendantsOf(current, [id]);
        return current.map((row) =>
          row.id === id
            ? { ...patch(row), check: { state: 'idle' } }
            : affected.has(row.id)
              ? { ...row, check: { state: 'idle' } }
              : row,
        );
      });
    },
    [],
  );

  const setValue = useCallback(
    (id: string, key: string, value: ApiRenderInputValue | undefined) =>
      updateRow(
        id,
        (row) => {
          const values = { ...row.values };
          const clearedKeys = row.clearedKeys.filter((item) => item !== key);
          if (value !== undefined) {
            values[key] = value;
            return { ...row, values, clearedKeys };
          }
          delete values[key];
          // Emptying a fork's cell blanks it. Dropping only the override would put the parent's
          // value straight back under the cursor, and the next keystroke would append to it.
          // Going back to inherited is the reset button's job.
          return {
            ...row,
            values,
            clearedKeys: row.parentId ? [...clearedKeys, key] : clearedKeys,
          };
        },
        // Typing in one cell is one undo step, not one per keystroke.
        `value:${id}:${key}`,
      ),
    [updateRow],
  );

  const clearValue = useCallback(
    (id: string, key: string) =>
      updateRow(id, (row) => {
        const values = { ...row.values };
        const media = { ...row.media };
        delete values[key];
        delete media[key];
        return {
          ...row,
          values,
          media,
          clearedKeys: row.clearedKeys.includes(key) ? row.clearedKeys : [...row.clearedKeys, key],
        };
      }),
    [updateRow],
  );

  const resetValue = useCallback(
    (id: string, key: string) =>
      updateRow(id, (row) => {
        const values = { ...row.values };
        const media = { ...row.media };
        delete values[key];
        delete media[key];
        return {
          ...row,
          values,
          media,
          clearedKeys: row.clearedKeys.filter((item) => item !== key),
        };
      }),
    [updateRow],
  );

  const pickMedia = useCallback(
    (id: string, variable: ApiRenderVariable, assets: MediaAsset[]) =>
      updateRow(id, (row) => {
        const pins = assets
          .slice(0, variable.multiple ? API_RENDER_MEDIA_LIST_MAX : 1)
          .map(pinFromAsset);
        if (pins.length === 0) return row;
        return {
          ...row,
          values: { ...row.values, [variable.key]: variable.multiple ? pins : pins[0]! },
          clearedKeys: row.clearedKeys.filter((key) => key !== variable.key),
          // No recorded size is not zero: leaving `w`/`h` out makes the fit read `unknown`, which
          // is what sends the finished frame to the judge.
          media: { ...row.media, [variable.key]: rowMediaOf(assets[0]!) },
        };
      }),
    [updateRow],
  );

  const clearMedia = useCallback(
    (id: string, key: string) =>
      updateRow(id, (row) => {
        const { [key]: _v, ...values } = row.values;
        const { [key]: _m, ...media } = row.media;
        return { ...row, values, media };
      }),
    [updateRow],
  );

  // --- server preflight, per dirty row, debounced ---------------------------------------
  // ponytail: one preflight per dirty row, no concurrency cap; throttle to 3 like the poll if
  // the backend complains.
  const timers = useRef(
    new Map<string, { timer: ReturnType<typeof setTimeout>; snapshot: string }>(),
  );
  const variables = contract?.variables;
  const clientErrors = useMemo(
    () =>
      new Map(
        rows.map((row) => {
          const errors = validateRow(variables ?? [], effectiveValues(rows, row.id));
          if (row.check.state === 'ready' || row.check.state === 'error')
            for (const finding of row.check.guardrails ?? []) {
              if (finding.severity === 'block')
                errors[finding.variableKey ?? finding.code] = finding.message;
            }
          return [row.id, errors] as const;
        }),
      ),
    [rows, variables],
  );
  const readiness = useMemo(() => {
    const findings = new Map<string, { message: string; rows: string[] }>();
    let blocked = 0;
    let needsInput = 0;
    let review = 0;
    let checking = 0;
    let ready = 0;
    for (const row of rows) {
      const errors = clientErrors.get(row.id) ?? {};
      const unknown =
        row.check.state === 'ready'
          ? (row.check.guardrails ?? []).filter((finding) => finding.severity === 'unknown')
          : [];
      for (const item of unknown) {
        const finding = findings.get(item.code) ?? { message: item.message, rows: [] };
        finding.rows.push(row.label || 'Untitled');
        findings.set(item.code, finding);
      }
      if (Object.keys(errors).length > 0 || row.check.state === 'error') {
        const missing = missingInputs(variables ?? [], effectiveValues(rows, row.id));
        const blank =
          row.check.state !== 'error' && Object.keys(errors).every((key) => missing.includes(key));
        if (blank) needsInput += 1;
        else blocked += 1;
        for (const [key, message] of Object.entries(errors)) {
          const finding = findings.get(key) ?? { message, rows: [] };
          finding.rows.push(row.label || 'Untitled');
          findings.set(key, finding);
        }
        if (row.check.state === 'error') {
          const finding = findings.get('server') ?? { message: row.check.message, rows: [] };
          finding.rows.push(row.label || 'Untitled');
          findings.set('server', finding);
        }
      } else if (
        unknown.length ||
        (row.check.state === 'ready' &&
          row.check.fit?.slots.some((slot) => slot.state === 'unknown'))
      )
        review += 1;
      else if (row.check.state === 'ready') ready += 1;
      else checking += 1;
    }
    return { blocked, needsInput, review, checking, ready, findings: [...findings.entries()] };
  }, [rows, clientErrors, variables]);

  useEffect(() => {
    if (!contract) return;
    const { key, contractHash } = contract.template;
    const pending = timers.current;
    for (const row of rows) {
      const snapshot = preflightSnapshot(rows, row.id);
      const scheduled = pending.get(row.id);
      // A true debounce: an edit restarts the wait instead of racing a timer armed for older values.
      if (scheduled?.snapshot === snapshot) continue;
      if (scheduled) {
        clearTimeout(scheduled.timer);
        pending.delete(row.id);
      }
      if (row.check.state !== 'idle') continue;
      if (Object.keys(clientErrors.get(row.id) ?? {}).length > 0) continue;
      const resolved = effectiveValues(rows, row.id);
      const encode = effectiveEncode(rows, row.id);
      // Both updates return `current` untouched when the row moved on: a no-op must not be a new
      // array, or every stale response re-renders the grid under the person typing in it.
      const settle = (next: RequestRow['check'], from: RequestRow['check']['state']) =>
        setRows((current) => {
          const target = current.find((item) => item.id === row.id);
          if (
            !target ||
            target.check.state !== from ||
            preflightSnapshot(current, row.id) !== snapshot
          )
            return current;
          return current.map((item) => (item === target ? { ...item, check: next } : item));
        });
      const timer = setTimeout(async () => {
        pending.delete(row.id);
        settle({ state: 'checking' }, 'idle');
        let check: RequestRow['check'];
        try {
          const response = await apiRendersApi.preflight({
            brandId,
            ...(bindingId ? { bindingId } : {}),
            templateKey: key,
            contractHash,
            variables: resolved,
            ...(encode ? { encode } : {}),
          });
          check = {
            state: 'ready',
            fit: response.fit,
            test: response.test,
            guardrails: response.guardrails ?? [],
          };
        } catch (error) {
          const guardrails = apiRenderPreflightResponseSchema.shape.guardrails.safeParse(
            error instanceof ApiError ? error.payload?.guardrails : undefined,
          );
          const detail =
            error instanceof ApiError && typeof error.payload?.detail === 'string'
              ? error.payload.detail
              : null;
          check = {
            state: 'error',
            message:
              detail ?? describeRenderDiscoveryFailure(error instanceof Error ? error.message : ''),
            guardrails: guardrails.success ? guardrails.data : [],
          };
        }
        settle(check, 'checking');
      }, PREFLIGHT_DEBOUNCE_MS);
      pending.set(row.id, { timer, snapshot });
    }
  }, [rows, contract, clientErrors, brandId, bindingId]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const { timer } of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  // --- row operations ---------------------------------------------------------------------
  const appendRows = (added: RequestRow[]): boolean => {
    const current = latestRows.current;
    if (current.length + added.length > MAX_BATCH_ROWS) {
      toast.error(
        `A render set supports at most ${MAX_BATCH_ROWS} rows, including forks. Nothing was added.`,
      );
      return false;
    }
    record();
    latestRows.current = [...current, ...added];
    setRows(latestRows.current);
    return true;
  };

  const fork = (ids: string[]) => {
    const current = latestRows.current;
    const parents = current.filter((row) => ids.includes(row.id));
    if (parents.some((row) => rowDepth(current, row.id) >= FORGE_RENDER_SET_MAX_DESCENDANT_DEPTH)) {
      toast.error(
        `Forks go at most ${FORGE_RENDER_SET_MAX_DESCENDANT_DEPTH} levels deep. Nothing was added.`,
      );
      return;
    }
    const children: RequestRow[] = [];
    for (const parent of parents)
      children.push(seedRow([], forkLabel([...current, ...children], parent.id), parent.id));
    if (children.length === 0 || !appendRows(children)) return;
    setExpanded(true);
    // A new variation is shown and named next, never swapped into what is selected to render.
    setPreviewRowId(children[0]!.id);
    focusRowId.current = children[0]!.id;
  };

  const addRowBelow = (id: string) => {
    if (!contract) return;
    const current = latestRows.current;
    if (current.length >= MAX_BATCH_ROWS) {
      toast.error(`A render set supports at most ${MAX_BATCH_ROWS} rows. Nothing was added.`);
      return;
    }
    const { rows: next, added } = addSibling(
      current,
      id,
      contract.variables,
      allOutputIdsOf(contract),
    );
    record();
    latestRows.current = next;
    setRows(next);
    setPreviewRowId(added.id);
    focusRowId.current = added.id;
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once the added row has rendered.
  useEffect(() => {
    const id = focusRowId.current;
    const input = id
      ? gridBox.current?.querySelector<HTMLInputElement>(
          `tr[data-row-id="${id}"] input[aria-label="Row name"]`,
        )
      : null;
    if (!input) return;
    focusRowId.current = null;
    input.focus();
  }, [rows, expanded]);

  /** A row named elsewhere — the review tray — brought into view and previewed. */
  const showRow = (id: string) => {
    setPreviewRowId(id);
    gridBox.current
      ?.querySelector(`tr[data-row-id="${id}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  const duplicate = (ids: string[]) =>
    appendRows(
      latestRows.current
        .filter((row) => ids.includes(row.id))
        .map(({ delivery: _delivery, ...row }) => ({
          // A copy never inherits where the original delivers: two renders replacing one ad race.
          ...structuredClone(row),
          id: newRowId(),
          label: duplicateLabel(row.label),
          check: { state: 'idle' },
        })),
    );

  /** At once, variations included; the toast's Undo is the way back, as long as it is the last step. */
  const remove = (ids: string[]) => {
    const current = latestRows.current;
    const picked = current.filter((row) => ids.includes(row.id)).length;
    const gone = descendantsOf(current, ids);
    if (picked === 0) return;
    record();
    const before = history.current.past.at(-1);
    replaceRows(current.filter((row) => !gone.has(row.id)));
    toast.success(deletedMessage(picked, gone.size), {
      action: {
        label: 'Undo',
        onClick: () => {
          if (history.current.past.at(-1) === before) undo();
        },
      },
    });
  };

  const addRow = () => {
    if (!contract) return;
    const added = {
      ...seedRow(contract.variables, `Render ${latestRows.current.length + 1}`),
      outputIds: allOutputIdsOf(contract),
    };
    if (!appendRows([added])) return;
    setPreviewRowId(added.id);
    focusRowId.current = added.id;
  };

  const saveAsInputs = (id: string) => {
    const row = latestRows.current.find((item) => item.id === id);
    if (!contract || !row) return;
    setNameRequest({
      title: 'Save as inputs',
      description:
        'Saves what this row renders with — its own values and everything it inherits — as a reusable input set.',
      initialName: row.label || 'Untitled inputs',
      confirmLabel: 'Save inputs',
      onConfirm: async (name) => {
        try {
          const created = await apiRendersApi.createInputSet({
            brandId,
            templateKey: contract.template.key,
            contractHash: contract.template.contractHash,
            name,
            variables: toVariableMap({ values: effectiveValues(latestRows.current, id) }),
          });
          setInputSets((current) => [created, ...current]);
          void queryClient.invalidateQueries({
            queryKey: forgeQueryKeys.inputSets(brandId, contract.template.key),
            exact: true,
          });
          toast.success(`Saved “${name}”`);
          setNameRequest(null);
        } catch (error) {
          toast.error(describeRenderDiscoveryFailure(error instanceof Error ? error.message : ''));
        }
      },
    });
  };

  /** A draft's rows, proposed, under the rows already there; the first one is shown. */
  const acceptDrafts = (responses: ApiRenderSuggestRowsResponse[]) => {
    if (!contract) return;
    const outputs = allOutputIdsOf(contract);
    const drafted = responses.flatMap((response) => rowsFromSuggestion(response, outputs));
    const notes = responses.flatMap((response) => [...response.unfilled, ...response.dropped]);
    // Said, never assumed: the server reports a short answer in `dropped`, and a draft that
    // produced nothing is a failure the person has to see rather than an empty success toast.
    const described = notes.length
      ? {
          description: `${notes.slice(0, 3).join('; ')}${notes.length > 3 ? ` (+${notes.length - 3} more)` : ''}`,
        }
      : undefined;
    if (drafted.length === 0) {
      toast.error('Nothing usable came back — try again, or write a brief.', described);
      return;
    }
    if (!appendRows(drafted)) return;
    setExpanded(true);
    setPreviewRowId(drafted[0]?.id ?? null);
    toast.success(
      `${drafted.length} ${drafted.length === 1 ? 'row' : 'rows'} proposed — keep the ones you want`,
      described,
    );
  };
  const acceptDraft = (response: ApiRenderSuggestRowsResponse) => acceptDrafts([response]);

  /**
   * Variations straight from a menu: no dialog, nothing typed. The row's own values already reach
   * the model as `now=` / `LOCKED=`, so the brief only has to carry the axis and the ask — and
   * `varyKeys`, which the caller built, carries the axis structurally. One request per row.
   */
  const generateWithAi = async ({
    ids,
    count,
    varyKeys,
  }: { ids: string[]; count: number; varyKeys: string[] }) => {
    if (!contract || generating || varyKeys.length === 0) return;
    const current = latestRows.current;
    const targets = ids.flatMap((id) => {
      const row = current.find((item) => item.id === id);
      return row ? [row] : [];
    });
    if (targets.length === 0) return;
    const only =
      varyKeys.length === 1
        ? contract.variables.find((variable) => variable.key === varyKeys[0])
        : undefined;
    const what = only ? readableLayerName(only.label) : null;
    setGenerating({
      count: count * targets.length,
      of:
        targets.length === 1
          ? `“${targets[0]!.label.trim() || 'Untitled'}”`
          : `${targets.length} rows`,
    });
    try {
      const responses = await Promise.all(
        targets.map((row) =>
          apiRendersApi.suggestRows({
            brandId,
            ...(bindingId ? { bindingId } : {}),
            templateKey: contract.template.key,
            contractHash: contract.template.contractHash,
            prompt: what
              ? `Vary only the ${what}. ${count} variations of this row, each clearly different.`
              : `${count} variations of this row, each clearly different from it and from each other.`,
            count,
            forksPerRow: 0,
            parent: {
              id: row.id,
              label: row.label.trim() || 'Untitled',
              values: effectiveValues(current, row.id),
            },
            varyKeys,
          }),
        ),
      );
      acceptDrafts(responses);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      toast.error(
        message.includes('suggest_unavailable')
          ? 'The AI writer is unavailable right now. Try again in a few minutes, or add rows by hand.'
          : describeRenderDiscoveryFailure(message),
      );
    } finally {
      setGenerating(null);
    }
  };

  const actions: RequestRowActions = {
    updateRow,
    setValue,
    clearValue,
    resetValue,
    pickMedia,
    clearMedia,
    fork,
    addRowBelow,
    duplicate,
    remove,
    saveAsInputs,
    addRow,
    applyValue: (key, fromId, toIds) =>
      editRows((current) => applyValue(current, key, fromId, toIds)),
    applyFormats: (fromId, toIds) =>
      editRows((current) => applyFormats(current, fromId, toIds, allOutputIdsOf(contract))),
    clearIn: (key, ids) => editRows((current) => clearKey(current, key, ids)),
    resetIn: (key, ids) => editRows((current) => resetKey(current, key, ids)),
    hideColumn: (columnId) => changeColumns({ ...columnVisibility, [columnId]: false }),
    showAllColumns: () => changeColumns({}),
    keepProposed: (ids) => editRows((current) => keepProposed(current, ids)),
    varyWithAi: (id, varyKeys) => {
      const row = latestRows.current.find((item) => item.id === id);
      if (row)
        setAiDraft({
          parent: {
            id,
            label: row.label.trim() || 'Untitled',
            values: effectiveValues(latestRows.current, id),
          },
          // Arriving from a cell, the dialog opens with only that key ticked.
          ...(varyKeys?.length ? { varyKeys } : {}),
        });
    },
    generateWithAi: (args) => void generateWithAi(args),
    discardProposed: (ids) => editRows((current) => discardProposed(current, ids)),
  };

  // --- columns ----------------------------------------------------------------------------
  const columnsKey = contract ? columnsStorageKey(brandId, contract.template.key) : null;
  useEffect(() => {
    if (columnsKey) setColumnVisibility(readStored<VisibilityState>(columnsKey, {}));
  }, [columnsKey]);
  function changeColumns(next: VisibilityState) {
    setColumnVisibility(next);
    if (columnsKey) writeStored(columnsKey, next);
  }

  // --- render sets ------------------------------------------------------------------------
  const dirty = contract !== null && signatureOf(rows, contract) !== savedSignature;
  // Saved against an earlier version of the template: the fire path refuses it until the rows on
  // screen — already fitted to this version — are saved with this contract.
  const olderTemplate =
    contract !== null &&
    activeSet !== null &&
    activeSet.contractHash !== contract.template.contractHash;
  // Saving would make what the rebase dropped final, so that is the person's call.
  const updateRequired = olderTemplate && rebaseDrops.length > 0;
  const needsSave = dirty || olderTemplate;
  const proposed = proposedIds(rows);
  // Autosave waits while a review signs the set's revision, while a conflict is unresolved, and
  // while the set waits on "Update set".
  const autosaveBlocked =
    !contract ||
    !bindingId ||
    rows.length === 0 ||
    review !== null ||
    conflict !== null ||
    updateRequired;

  /**
   * Everything that replaces the rows on screen comes through here. Edits are saved first, so
   * nothing is lost; only rows that cannot be saved — proposed ones, or a set that is waiting on a
   * decision — ask first.
   */
  const confirmDiscard = (action: () => void) => {
    if (proposed.size === 0 && !needsSave) return action();
    if (proposed.size === 0 && !autosaveBlocked)
      return void saveRenderSet({ announce: false }).then((saved) =>
        saved ? action() : setPendingDiscard(() => action),
      );
    setPendingDiscard(() => action);
  };

  // An intent is an event, taken once and handed back. Like every other way of replacing the rows
  // it saves or asks first; one for what is already open changes nothing.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new intent is an event; the rest is read as it arrives.
  useEffect(() => {
    if (!intent) return;
    onIntentConsumed?.();
    const alreadyOpen =
      intent.templateKey === templateKey &&
      (!intent.renderSetId || intent.renderSetId === activeSet?.id);
    if (intent.draftWithAi) setDraftFor(intent.templateKey);
    if (!alreadyOpen)
      confirmDiscard(() =>
        setSelection({ templateKey: intent.templateKey, renderSetId: intent.renderSetId }),
      );
  }, [intent]);

  // The draft opens once the template it was asked for is on screen, not over the previous one.
  useEffect(() => {
    if (!draftFor || contract?.template.key !== draftFor) return;
    setDraftFor(null);
    setAiDraft({ parent: null });
  }, [draftFor, contract]);

  // ponytail: drafts are no longer written — the server autosaves. Browser drafts written before
  // autosave are still offered through "Import browser draft"; drop `readDrafts` and the offer one
  // release after this ships.

  const adoptSet = (saved: ForgeRenderSet, savedRows: RequestRow[]) => {
    activeSetRef.current = saved;
    savedBase.current = saved.rows;
    setActiveSet(saved);
    if (saved.contractHash === contract?.template.contractHash) setRebaseDrops([]);
    setRenderSets((current) => [saved, ...current.filter((set) => set.id !== saved.id)]);
    setSavedSignature(signatureOf(savedRows, contract));
    setDraftOffer(null);
    setConflict(null);
  };

  const createSet = async (
    name: string,
    rowsToSave: RequestRow[],
    { announce = true, description }: { announce?: boolean; description?: string | null } = {},
  ): Promise<ForgeRenderSet | null> => {
    if (!contract || !bindingId) return null;
    try {
      const created = await apiRendersApi.createRenderSet({
        brandId,
        bindingId,
        name,
        ...(description ? { description } : {}),
        templateKey: contract.template.key,
        contractHash: contract.template.contractHash,
        rows: toRenderSetRows(rowsToSave, allOutputIdsOf(contract)),
      });
      adoptSet(created, rowsToSave);
      void queryClient.invalidateQueries({ queryKey: forgeQueryKeys.renderSets(brandId) });
      if (announce) toast.success(`Saved “${created.name}”`);
      return created;
    } catch (error) {
      toast.error(describeRenderDiscoveryFailure(error instanceof Error ? error.message : ''));
      return null;
    }
  };

  /**
   * Another save won the race. Row edits on different rows merge by themselves — the other side's
   * version becomes the base, the merged rows go on screen and autosave writes them. The same row
   * changed two ways is a decision, never an overwrite: autosave waits behind the banner.
   */
  const resolveConflict = async (set: ForgeRenderSet, submitted: RequestRow[]) => {
    if (!contract) return null;
    const fresh = await apiRendersApi.getRenderSet(brandId, set.id).catch(() => null);
    if (!fresh) return null;
    setRenderSets((sets) => sets.map((item) => (item.id === fresh.id ? fresh : item)));
    const merged =
      fresh.contractHash === set.contractHash
        ? mergeSetRows(
            savedBase.current,
            toRenderSetRows(submitted, allOutputIdsOf(contract)),
            fresh.rows,
          )
        : null;
    if (!merged) {
      setConflict(fresh);
      return null;
    }
    const theirs = fromRenderSetRows(fresh.rows);
    activeSetRef.current = fresh;
    savedBase.current = fresh.rows;
    setActiveSet(fresh);
    setSavedSignature(signatureOf(theirs, contract));
    const current = latestRows.current;
    const local = current.filter((row) => proposedIds(current).has(row.id));
    const next = [...restoreRows(fromRenderSetRows(merged), current), ...local];
    replaceRows(next);
    void rehydrateMedia(next);
    toast.info(`“${fresh.name}” changed elsewhere; both sets of edits are kept.`);
    return fresh;
  };

  /**
   * The rows on screen, saved into the open set — or into a new "Untitled set" when there is none
   * yet. One save at a time: edits made while it is in flight stay unsaved and go next. `announce`
   * is for a person pressing Save; autosave says so in the toolbar instead.
   */
  const saveRenderSet = async ({ announce = true } = {}): Promise<ForgeRenderSet | null> => {
    if (!contract || !bindingId || latestRows.current.length === 0) return null;
    if (inFlight.current) await inFlight.current;
    const submitted = latestRows.current;
    const set = activeSetRef.current;
    if (proposedIds(submitted).size === submitted.length) return set;
    const run = (async () => {
      setSaveState({ phase: 'saving' });
      try {
        if (!set) {
          const created = await createSet('Untitled set', submitted, { announce });
          setSaveState({ phase: created ? 'idle' : 'failed' });
          return created;
        }
        const saved = await apiRendersApi.updateRenderSet(set.id, {
          brandId,
          expectedRevision: set.revision,
          rows: toRenderSetRows(submitted, allOutputIdsOf(contract)),
          // Only when it moves: a server without the field refuses it, and an unchanged hash needs none.
          ...(set.contractHash !== contract.template.contractHash
            ? { contractHash: contract.template.contractHash }
            : {}),
        });
        adoptSet(saved, submitted);
        void queryClient.invalidateQueries({ queryKey: forgeQueryKeys.renderSets(brandId) });
        if (announce) toast.success(`Saved “${saved.name}”`);
        setSaveState({ phase: 'idle' });
        return saved;
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (set && message.includes('render_set_revision_conflict')) {
          const merged = await resolveConflict(set, submitted);
          setSaveState({ phase: 'idle' });
          return merged;
        }
        setSaveState({ phase: 'failed' });
        if (announce) toast.error(describeRenderDiscoveryFailure(message));
        return null;
      }
    })();
    const mine = run.then(() => undefined);
    inFlight.current = mine;
    try {
      return await run;
    } finally {
      if (inFlight.current === mine) inFlight.current = null;
    }
  };

  // Autosave: a second and a half after the last edit, five after a save that failed.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the signature stands for the rows.
  useEffect(() => {
    if (!needsSave || autosaveBlocked || saveState.phase === 'saving') return;
    const timer = setTimeout(
      () => void saveRenderSet({ announce: false }),
      saveState.phase === 'failed' ? AUTOSAVE_RETRY_MS : AUTOSAVE_MS,
    );
    return () => clearTimeout(timer);
  }, [
    contract ? signatureOf(rows, contract) : '',
    needsSave,
    autosaveBlocked,
    saveState.phase,
    activeSet?.revision,
  ]);

  // Leaving the page while something is unsaved asks the browser to ask; a hidden tab saves now.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reads the latest save each time.
  useEffect(() => {
    const unsaved = needsSave || saveState.phase === 'saving' || proposed.size > 0;
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const hidden = () => {
      if (document.visibilityState === 'hidden' && needsSave && !autosaveBlocked)
        void saveRenderSet({ announce: false });
    };
    window.addEventListener('beforeunload', warn);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [needsSave, saveState.phase, proposed.size, autosaveBlocked]);

  // Back on this tab with nothing unsaved: if someone else saved the open set meanwhile, show theirs.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reads the latest set each time.
  useEffect(() => {
    if (!active) return;
    const refresh = () => {
      const set = activeSetRef.current;
      if (!set || !contract || needsSave || proposed.size > 0 || inFlight.current) return;
      void apiRendersApi
        .getRenderSet(brandId, set.id)
        .then((fresh) => {
          if (fresh.revision !== activeSetRef.current?.revision && !inFlight.current)
            openSet(fresh, contract);
        })
        .catch(() => undefined);
    };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  });

  const saveNow = async () => {
    if (busy || !bindingId || rows.length === 0) return;
    setBusy('saving');
    try {
      await saveRenderSet();
    } finally {
      setBusy(null);
    }
  };

  const loadRenderSet = (set: ForgeRenderSet) => {
    if (contract) openSet(set, contract);
  };

  /** A name or description change, queued behind any row save so both keep their revision. */
  const updateSetDetails = async (
    set: ForgeRenderSet,
    change: { name: string } | { description: string | null },
  ) => {
    if (inFlight.current) await inFlight.current;
    const current = set.id === activeSetRef.current?.id ? activeSetRef.current : set;
    try {
      const updated = await apiRendersApi.updateRenderSet(set.id, {
        brandId,
        expectedRevision: current.revision,
        ...change,
      });
      if (updated.id === activeSetRef.current?.id) {
        activeSetRef.current = updated;
        setActiveSet(updated);
      }
      setRenderSets((sets) => sets.map((item) => (item.id === updated.id ? updated : item)));
      void queryClient.invalidateQueries({ queryKey: forgeQueryKeys.renderSets(brandId) });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('render_set_revision_conflict')) {
        const fresh = await apiRendersApi.getRenderSet(brandId, set.id).catch(() => null);
        if (fresh)
          setRenderSets((sets) => sets.map((item) => (item.id === fresh.id ? fresh : item)));
        toast.error('This set changed elsewhere. Reload it before saving again.');
      } else toast.error(describeRenderDiscoveryFailure(message));
    }
  };

  /** A new set with the same rows — deliveries left behind, as a copied row leaves its own. */
  const duplicateSet = async (set: ForgeRenderSet) => {
    if (!contract) return;
    const source = set.id === activeSet?.id ? latestRows.current : fromRenderSetRows(set.rows);
    const copy = rebaseRows(
      source.filter((row) => !proposed.has(row.id)).map(({ delivery: _delivery, ...row }) => row),
      contract,
    ).rows;
    const created = await createSet(duplicateLabel(set.name), copy, {
      announce: false,
      description: set.description,
    });
    if (!created) return;
    showRows(copy, copy, contract);
    toast.success(`Duplicated as “${created.name}”`);
  };

  /** A kept version as a new set. The set it came from is never written back over. */
  const restoreRevision = async (revision: ForgeRenderSetRevision) => {
    if (!contract) return;
    const restored = rebaseRows(fromRenderSetRows(revision.rows), contract).rows;
    const created = await createSet(
      `${revision.name} (restored ${formatRelativeTime(revision.savedAt)})`,
      restored,
      { announce: false },
    );
    if (!created) return;
    showRows(restored, restored, contract);
    setHistoryFor(null);
    toast.success(`Restored as “${created.name}”`);
  };

  const deleteSet = async (set: ForgeRenderSet) => {
    if (!contract) return;
    try {
      await apiRendersApi.deleteRenderSet(brandId, set.id);
      void queryClient.invalidateQueries({ queryKey: forgeQueryKeys.renderSets(brandId) });
    } catch (error) {
      toast.error(describeRenderDiscoveryFailure(error instanceof Error ? error.message : ''));
      return;
    }
    const remaining = renderSets.filter((item) => item.id !== set.id);
    setRenderSets(remaining);
    toast.success(`Deleted “${set.name}”`);
    if (set.id !== activeSet?.id) return;
    if (remaining[0]) loadRenderSet(remaining[0]);
    else {
      activeSetRef.current = null;
      savedBase.current = [];
      setActiveSet(null);
      setRebaseDrops([]);
      const seeded = seededRows(contract);
      showRows(seeded, seeded, contract);
    }
  };

  // --- the table --------------------------------------------------------------------------
  const columns = useMemo(() => buildColumns(contract), [contract]);
  const nestedRows = useMemo(() => nestRows(rows), [rows]);
  const selectedIds = rows.filter((row) => rowSelection[row.id]).map((row) => row.id);
  const hiddenColumns = columns.filter(
    (column) => columnVisibility[column.id ?? ''] === false,
  ).length;
  const meta: RequestGridMeta | undefined = contract
    ? {
        brandId,
        contract,
        rows,
        clientErrors,
        actions,
        selectedIds,
        hiddenColumns,
        generating: generating !== null,
      }
    : undefined;
  const table = useReactTable({
    data: nestedRows,
    columns,
    meta,
    getRowId: (row) => row.id,
    getSubRows: (row) => row.subRows,
    state: { rowSelection, expanded, columnVisibility },
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: (updater) =>
      changeColumns(typeof updater === 'function' ? updater(columnVisibility) : updater),
    onExpandedChange: setExpanded,
    enableRowSelection: true,
    enableSubRowSelection: false,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });

  const selected = rows.filter((row) => rowSelection[row.id]);
  /** Rows in the order the grid shows them: a tree, not the saved order. */
  const shownIds = () => table.getRowModel().rows.map((row) => row.id);
  const rowAbove = (id: string | null) => {
    const shown = shownIds();
    const index = id ? shown.indexOf(id) : -1;
    return index > 0 ? shown[index - 1]! : null;
  };
  const actionContext: GridActionContext | null = contract
    ? { rows, selectedIds, contract, actions, hiddenColumns, generating: generating !== null }
    : null;
  // What Render will make, counted the way the review tray counts it.
  const files = { total: 0, byRatio: new Map<string, number>(), replacements: 0 };
  if (contract)
    for (const row of selected) {
      const outputIds = effectiveOutputIds(rows, row.id);
      files.total += rowFileCount(contract, { outputIds, delivery: row.delivery });
      if (row.delivery?.action === 'replace') files.replacements += 1;
      else
        for (const ratio of renderedRatios(contract, outputIds))
          files.byRatio.set(ratio, (files.byRatio.get(ratio) ?? 0) + 1);
    }
  const canFork =
    selected.length > 0 &&
    rows.length < MAX_BATCH_ROWS &&
    selected.every((row) => rowDepth(rows, row.id) < FORGE_RENDER_SET_MAX_DESCENDANT_DEPTH);
  const renderingProposed = selected.some((row) => proposed.has(row.id));
  const readyToFire =
    !updateRequired &&
    !renderingProposed &&
    selected.length > 0 &&
    selected.length <= MAX_BATCH_ROWS &&
    selected.every(
      (row) =>
        row.check.state === 'ready' && Object.keys(clientErrors.get(row.id) ?? {}).length === 0,
    );
  const fireHint = updateRequired
    ? 'Update this set to the current template first'
    : renderingProposed
      ? 'Keep or discard the proposed rows first'
      : selected.length === 0
        ? 'Select the rows to render'
        : selected.length > MAX_BATCH_ROWS
          ? `At most ${MAX_BATCH_ROWS} renders per batch`
          : !readyToFire
            ? 'Every selected row has to be Ready'
            : null;
  // A selected row still being dry-run is a wait, not a block: the tray re-checks once it lands.
  const stillChecking = selected.some(
    (row) =>
      (row.check.state === 'idle' || row.check.state === 'checking') &&
      Object.keys(clientErrors.get(row.id) ?? {}).length === 0,
  );

  // --- drag and drop ----------------------------------------------------------------------
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: rowStepCoordinates }),
  );
  const labelOf = (id: string | number) =>
    latestRows.current.find((row) => row.id === id)?.label || 'Untitled';
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${labelOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${labelOf(active.id)} is over ${labelOf(over.id)}.`
        : `${labelOf(active.id)} is not over a row.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `${labelOf(active.id)} was dropped on ${labelOf(over.id)}.`
        : `${labelOf(active.id)} was not moved.`,
    onDragCancel: ({ active }) => `Moving ${labelOf(active.id)} was cancelled.`,
  };
  const onDragMove = (event: DragMoveEvent) => {
    const next = dropFor(event);
    setDropHint((current) =>
      current?.rowId === next?.rowId && current?.position === next?.position ? current : next,
    );
  };
  const onDragEnd = (event: DragEndEvent) => {
    setDropHint(null);
    const drop = dropFor(event);
    if (!drop) return;
    const moved = moveRow(
      latestRows.current,
      String(event.active.id),
      drop,
      allOutputIdsOf(contract),
    );
    if (!moved.ok) {
      toast.error(
        moved.reason === 'cycle'
          ? 'A row cannot move under one of its own forks. Nothing moved.'
          : `Forks go at most ${FORGE_RENDER_SET_MAX_DESCENDANT_DEPTH} levels deep. Nothing moved.`,
      );
      return;
    }
    if (moved.rows === latestRows.current) return;
    record();
    latestRows.current = moved.rows;
    setRows(moved.rows);
    if (drop.position === 'inside') setExpanded(true);
  };

  // --- paste, import, fire ----------------------------------------------------------------
  // Rows pasted onto the grid are a sheet like any uploaded one, so they open the same review:
  // one mapper, one set of cell errors, one row cap — not a second, weaker parse.
  const onPaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    // A paste INTO a cell is that cell's; only a paste onto the grid body is rows.
    if ((event.target as HTMLElement).closest('input, textarea, [contenteditable]')) return;
    if (!contract) return;
    const text = event.clipboardData.getData('text');
    // A header line and at least one row, or it is not rows.
    if (parseDelimited(text).length < 2) return;
    event.preventDefault();
    setPasted({ text });
    setImportOpen(true);
  };

  // Saves the set, then opens (or re-checks) the review of the exact selection. The save is part
  // of Render, so it is silent — and a set with no edits is already saved, so opening the review
  // again neither writes a new revision nor says "Saved" twice.
  const openReview = async () => {
    if (!contract || !readyToFire) return;
    setBusy('firing');
    try {
      const submittedSet =
        activeSet && !needsSave ? activeSet : await saveRenderSet({ announce: false });
      if (!submittedSet) return;
      const current = latestRows.current;
      const signature = reviewSignature(
        current,
        current.filter((row) => rowSelection[row.id]).map((row) => row.id),
        submittedSet.revision,
        allOutputIdsOf(contract),
      );
      setReview((previous) => ({ key: (previous?.key ?? 0) + 1, signature }));
    } finally {
      setBusy(null);
    }
  };

  // The batch is rebuilt from the rows on screen every render, never kept from when the review
  // opened: a stale review refuses to confirm, and a current one signs exactly these records.
  const batch = useMemo(() => {
    if (!review || !activeSet) return { rows: [], records: [] as ApiRenderBatchRecord[] };
    const chosen = rows.filter((row) => rowSelection[row.id]);
    return {
      rows: chosen.map((row) => ({
        rowId: row.id,
        label: row.label.trim() || 'Untitled',
        labelPath: rowBreadcrumb(rows, row.id),
        outputIds: effectiveOutputIds(rows, row.id),
        ...(row.delivery ? { delivery: toPreflightDelivery(row.delivery) } : {}),
      })),
      records: chosen.map(
        (row): ApiRenderBatchRecord => ({
          label: row.label.trim() || 'Untitled',
          renderSetId: activeSet.id,
          renderSetRowId: row.id,
          expectedRenderSetRevision: activeSet.revision,
          rootRowId: rootRowId(rows, row.id),
          parentRowId: row.parentId ?? undefined,
          variables: effectiveValues(rows, row.id),
          ...(effectiveOutputIds(rows, row.id).length
            ? { outputIds: effectiveOutputIds(rows, row.id) }
            : {}),
          ...(effectiveEncode(rows, row.id) ? { encode: effectiveEncode(rows, row.id) } : {}),
        }),
      ),
    };
  }, [review, activeSet, rows, rowSelection]);
  const stale =
    review !== null &&
    contract !== null &&
    review.signature !==
      reviewSignature(rows, selectedIds, activeSet?.revision ?? null, allOutputIdsOf(contract));

  // The tray unfolds for a review and folds back when it ends; a drag that folds it ends it too.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only opening and closing move the panel.
  useEffect(() => {
    const panel = trayPanel.current;
    if (!panel) return;
    if (review && panel.isCollapsed()) panel.resize(TRAY_OPEN_SIZE);
    else if (!review && !panel.isCollapsed()) panel.collapse();
  }, [review === null]);

  // --- keyboard ---------------------------------------------------------------------------
  /** The same column's field one row down (or up), selected for typing over. */
  const moveInColumn = (from: HTMLElement, by: 1 | -1): boolean => {
    const column = from.closest<HTMLElement>('td[data-column-id]')?.dataset.columnId;
    const rowId = from.closest<HTMLElement>('tr[data-row-id]')?.dataset.rowId;
    if (!column || !rowId) return false;
    const shown = shownIds();
    const next = shown[shown.indexOf(rowId) + by];
    const field = next
      ? gridBox.current?.querySelector<HTMLInputElement>(
          `tr[data-row-id="${next}"] td[data-column-id="${column}"] input[type="text"], tr[data-row-id="${next}"] td[data-column-id="${column}"] input:not([type])`,
        )
      : null;
    if (!field) return false;
    field.focus();
    field.select();
    return true;
  };

  /** ⌘D, as in a spreadsheet: the top selected row's value into the rest, else the row above's. */
  const fillDown = (from: HTMLElement): boolean => {
    const key = from.closest<HTMLElement>('td[data-column-id]')?.dataset.columnId;
    const rowId = from.closest<HTMLElement>('tr[data-row-id]')?.dataset.rowId;
    if (!key || !rowId || !contract?.variables.some((item) => item.key === key && !item.reserved))
      return false;
    const shown = shownIds().filter((id) => rowSelection[id]);
    if (shown.length > 1) actions.applyValue(key, shown[0]!, shown.slice(1));
    else {
      const above = rowAbove(rowId);
      if (!above) return false;
      actions.applyValue(key, above, [rowId]);
    }
    return true;
  };

  const onGridKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) return;
    const target = event.target as HTMLElement;
    const mod = event.metaKey || event.ctrlKey;
    if (mod && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'd') {
      if (fillDown(target)) event.preventDefault();
      return;
    }
    if (mod || event.altKey || !(target instanceof HTMLInputElement)) return;
    if (target.type !== 'text' && target.getAttribute('type') !== null) return;
    const by =
      event.key === 'Enter'
        ? event.shiftKey
          ? -1
          : 1
        : event.key === 'ArrowDown' && !event.shiftKey
          ? 1
          : event.key === 'ArrowUp' && !event.shiftKey
            ? -1
            : 0;
    if (by !== 0 && moveInColumn(target, by)) event.preventDefault();
  };

  // ⌘Z / ⇧⌘Z / ⌘S belong to the grid while the Render tab shows and nothing floats over it. Undo
  // takes back row edits, not keystrokes inside one field: typing in a field is one step.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reads the latest handlers each keypress.
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.defaultPrevented) return;
      if (
        document.querySelector(
          // Something modal over the grid, or a menu open on it. Not a toast — toasts are
          // non-modal dialogs and arrive any time — and not a menu fading out after a pick.
          '[role="dialog"][data-open]:not([aria-modal="false"]), [role="alertdialog"][data-open], [role="menu"][data-open], [role="listbox"][data-open]',
        )
      )
        return;
      const target = event.target as Element | null;
      // In the grid, or on something holding it: a closing menu hands focus back to the grid's
      // nearest focusable ancestor — the Render tab's panel — which is still this grid's keyboard.
      const box = gridBox.current;
      const inGrid =
        !target ||
        target === document.body ||
        Boolean(box && (box.contains(target) || target.contains(box)));
      const key = event.key.toLowerCase();
      if (key === 's') {
        event.preventDefault();
        void saveNow();
      } else if (inGrid && key === 'z' && (event.shiftKey ? redo() : undo()))
        event.preventDefault();
      else if (inGrid && key === 'y' && !event.shiftKey && redo()) event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // --- render -----------------------------------------------------------------------------
  const ready = rows.filter((row) => row.check.state === 'ready').length;
  const previewId = previewRowId ?? (selected.length === 1 ? selected[0]!.id : null);
  return (
    // Bounded by the tab: the toolbar stays put, the rows and the review tray share the rest.
    <div className="flex h-full min-h-0 flex-col gap-2">
      <RenderToolbar
        templates={templates}
        templateKey={templateKey}
        templatesLoading={busy === 'loading'}
        // The picker hands back the REF, not the key: two templates can share a key and only
        // the pair says which one was clicked.
        bindingId={bindingId}
        onTemplateChange={(ref) => {
          const picked = templates.find((template) => templateRefOf(template) === ref);
          if (!picked || (picked.key === templateKey && picked.bindingId === bindingId)) return;
          confirmDiscard(() =>
            setSelection({ templateKey: picked.key, bindingId: picked.bindingId }),
          );
        }}
        ready={contract !== null}
        inputSets={inputSets}
        canAddRows={rows.length < MAX_BATCH_ROWS}
        onAddRow={addRow}
        onDraftWithAi={() => setAiDraft({ parent: null })}
        onAddFromInputs={(set) =>
          appendRows([{ ...seedRow([], set.name), values: { ...set.variables } }])
        }
        onUpload={() => setImportOpen(true)}
        onDownloadTemplate={() =>
          contract &&
          downloadTemplateCsv(
            contract,
            `${
              templateLabel(contract.template)
                .replace(/[^\w\- ]+/g, '')
                .trim() || 'template'
            } rows.csv`,
          )
        }
        dirty={needsSave}
        saveStatus={
          saveState.phase === 'saving'
            ? { phase: 'saving' }
            : saveState.phase === 'failed'
              ? { phase: 'failed' }
              : activeSet
                ? { phase: 'saved', at: activeSet.updatedAt }
                : null
        }
        canSave={Boolean(bindingId) && rows.length > 0}
        onSave={saveNow}
        selectedCount={selected.length}
        files={{ ...files, byRatio: [...files.byRatio] }}
        readyToFire={readyToFire}
        fireHint={fireHint}
        busy={busy === 'saving' || busy === 'firing' ? busy : null}
        onRender={openReview}
      />
      {problem ? <p className="text-xs text-destructive">{problem}</p> : null}
      {updateRequired && activeSet ? (
        <section
          aria-label="Older template"
          className="flex shrink-0 flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-xs"
        >
          <p className="min-w-0 flex-1">
            “{activeSet.name}” was saved for an earlier version of this template. Updating it
            removes what this version no longer has: {rebaseDrops.join(', ')}.
          </p>
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={busy === 'saving'}
            onClick={async () => {
              setBusy('saving');
              try {
                await saveRenderSet();
              } finally {
                setBusy(null);
              }
            }}
          >
            Update set
          </Button>
        </section>
      ) : null}

      {conflict ? (
        <section
          aria-label="Changed elsewhere"
          className="flex shrink-0 flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-xs"
        >
          <p className="min-w-0 flex-1">
            “{conflict.name}” was changed elsewhere, on some of the same rows you changed here.
            Autosave is paused until you choose.
          </p>
          <Button type="button" size="xs" variant="outline" onClick={() => loadRenderSet(conflict)}>
            Load their version
          </Button>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={async () => {
              const mine = latestRows.current;
              await createSet(`${conflict.name} (mine)`, mine);
            }}
          >
            Keep mine as a new set
          </Button>
        </section>
      ) : null}
      {generating || proposed.size ? (
        <section
          aria-label="Proposed rows"
          className="flex shrink-0 flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-xs"
        >
          {generating ? (
            <p className="flex min-w-0 flex-1 items-center gap-1.5">
              <Loader2 className="size-3 animate-spin" aria-hidden />
              Drafting {generating.count} {generating.count === 1 ? 'variation' : 'variations'} of{' '}
              {generating.of}…
            </p>
          ) : (
            <p className="min-w-0 flex-1">
              {proposed.size} proposed {proposed.size === 1 ? 'row' : 'rows'} · not saved until you
              keep {proposed.size === 1 ? 'it' : 'them'}.
            </p>
          )}
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={proposed.size === 0}
            onClick={() =>
              editRows((current) =>
                keepProposed(
                  current,
                  current.filter((row) => row.proposed).map((row) => row.id),
                ),
              )
            }
          >
            Keep all
          </Button>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={proposed.size === 0}
            onClick={() =>
              editRows((current) =>
                discardProposed(
                  current,
                  current.filter((row) => row.proposed).map((row) => row.id),
                ),
              )
            }
          >
            Discard all
          </Button>
        </section>
      ) : null}
      {contract ? (
        <>
          <section
            aria-label="Selected rows"
            hidden={selected.length === 0}
            className="flex shrink-0 flex-wrap items-center gap-1 rounded-md border bg-muted/30 px-2 py-1 text-xs"
          >
            <span className="mr-1 font-medium tabular-nums">{selected.length} selected</span>
            {/* The same actions as a row's menus, acting on every selected row. */}
            {actionContext
              ? selectionActions(actionContext, selectedIds, { counted: false })
                  .flat()
                  .map((action) => (
                    <Button
                      key={action.id}
                      type="button"
                      size="xs"
                      variant="ghost"
                      className={action.destructive ? 'text-destructive' : undefined}
                      disabled={Boolean(action.disabledReason)}
                      title={action.disabledReason ?? action.hint}
                      onClick={action.run}
                    >
                      <action.icon data-icon="inline-start" /> {action.label}
                    </Button>
                  ))
              : null}
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              className="ml-auto"
              aria-label="Clear selection"
              onClick={() => setRowSelection({})}
            >
              <X aria-hidden />
            </Button>
          </section>
          <ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
            <ResizablePanel id="rows" minSize="30%" className="min-h-0">
              <ResizablePanelGroup
                orientation="horizontal"
                className="items-stretch"
                defaultLayout={panelsLayout.defaultLayout}
                onLayoutChanged={panelsLayout.onLayoutChanged}
              >
                <ResizablePanel
                  id="render-sets"
                  panelRef={railPanel}
                  collapsible
                  collapsedSize={RAIL_COLLAPSED_SIZE}
                  defaultSize="16%"
                  minSize="12rem"
                  maxSize="30%"
                  className="min-w-0"
                  onResize={() => setRailCollapsed(railPanel.current?.isCollapsed() ?? false)}
                >
                  <RenderSetRail
                    brandId={brandId}
                    templateKey={contract.template.key}
                    contractHash={contract.template.contractHash}
                    sets={renderSets}
                    activeSet={activeSet}
                    activeRows={rows.length}
                    confirmDiscard={confirmDiscard}
                    canCreate={Boolean(bindingId)}
                    draftAvailable={draftOffer !== null}
                    collapsed={railCollapsed}
                    onCollapsedChange={(collapse) =>
                      collapse ? railPanel.current?.collapse() : railPanel.current?.expand()
                    }
                    onSwitch={loadRenderSet}
                    onNew={async (name) => {
                      const seeded = seededRows(contract);
                      const created = await createSet(name, seeded);
                      if (created) showRows(seeded, seeded, contract);
                    }}
                    onRename={(set, name) => updateSetDetails(set, { name })}
                    onDescribe={(set, description) => updateSetDetails(set, { description })}
                    onDelete={deleteSet}
                    onDuplicate={(set) => void duplicateSet(set)}
                    onHistory={setHistoryFor}
                    onUpdate={() => void saveNow()}
                    onImportDraft={() => {
                      if (!draftOffer) return;
                      activeSetRef.current = null;
                      savedBase.current = [];
                      setActiveSet(null);
                      showRows(draftOffer, null, contract);
                      setDraftOffer(null);
                    }}
                  />
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel
                  id="render-grid"
                  defaultSize="54%"
                  minSize="40%"
                  className="min-w-0"
                >
                  {/* biome-ignore lint/a11y/noStaticElementInteractions: keys typed in the grid's own fields bubble here — Enter moves down a column, ⌘D fills down. */}
                  <div ref={gridBox} className="h-full min-h-0" onKeyDown={onGridKeyDown}>
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      accessibility={{ announcements }}
                      onDragMove={onDragMove}
                      onDragEnd={onDragEnd}
                      onDragCancel={() => setDropHint(null)}
                    >
                      <SortableContext items={table.getRowModel().rows.map((row) => row.id)}>
                        <RowDropHintContext.Provider value={dropHint}>
                          <DataGrid
                            table={table}
                            className="max-h-full"
                            onPaste={onPaste}
                            onRowClick={(row) => setPreviewRowId(row.id)}
                            RowComponent={SortableRequestRow}
                            contextMenu={
                              actionContext
                                ? {
                                    content: (target) => (
                                      <ActionMenuItems
                                        kind="context"
                                        groups={menuFor(
                                          actionContext,
                                          target,
                                          rowAbove(target.rowId),
                                          HIDEABLE,
                                        )}
                                        focusAfter={menuFocus}
                                      />
                                    ),
                                    finalFocus: takeFocusAfter(menuFocus),
                                  }
                                : undefined
                            }
                            groupHeader={`${rows.length} request${rows.length === 1 ? '' : 's'} • ${ready} ready • ${selected.length} selected`}
                            empty="No rows. Add one, import a spreadsheet, or paste rows onto the grid."
                          />
                        </RowDropHintContext.Provider>
                      </SortableContext>
                    </DndContext>
                  </div>
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel
                  id="render-preview"
                  defaultSize="30%"
                  minSize="20%"
                  className="min-w-0"
                >
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="min-h-0 flex-1">
                      <RenderPreviewPanel
                        brandId={brandId}
                        contract={contract}
                        rows={rows}
                        rowId={previewId}
                        renderSetId={activeSet?.id ?? null}
                      />
                    </div>
                    {/* The previewed row's fields at the pane's full width: room for long copy. */}
                    <section
                      aria-label="Fields"
                      className="flex max-h-[55%] shrink-0 flex-col border-t border-border"
                    >
                      <button
                        type="button"
                        aria-expanded={fieldsOpen}
                        className="flex h-8 shrink-0 items-center gap-1.5 px-[var(--card-pad)] text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setFieldsOpen(!fieldsOpen);
                          writeStored(FIELDS_OPEN_KEY, !fieldsOpen);
                        }}
                      >
                        {fieldsOpen ? (
                          <ChevronDown className="size-3" aria-hidden />
                        ) : (
                          <ChevronRight className="size-3" aria-hidden />
                        )}
                        Fields
                        <span className="min-w-0 truncate font-normal normal-case tracking-normal">
                          {previewId
                            ? (rows.find((row) => row.id === previewId)?.label ?? '')
                            : 'Pick a row'}
                        </span>
                      </button>
                      {fieldsOpen && previewId ? (
                        <div className="min-h-0 overflow-y-auto px-[var(--card-pad)] pb-2">
                          <RowFields table={table} rowId={previewId} />
                        </div>
                      ) : null}
                    </section>
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel
              id="review"
              panelRef={trayPanel}
              collapsible
              collapsedSize={TRAY_COLLAPSED_SIZE}
              defaultSize={TRAY_COLLAPSED_SIZE}
              minSize="9rem"
              className="min-h-0"
              onResize={(_size, _id, previous) => {
                if (previous && review && trayPanel.current?.isCollapsed()) setReview(null);
              }}
            >
              {review ? (
                <RenderReviewTray
                  brandId={brandId}
                  bindingId={bindingId}
                  templateKey={contract.template.key}
                  contractHash={contract.template.contractHash}
                  contract={contract}
                  rows={batch.rows}
                  records={batch.records}
                  reviewKey={review.key}
                  stale={stale}
                  recheckBlocked={stillChecking ? null : fireHint}
                  rechecking={busy === 'firing' || stillChecking}
                  finalBlocked={finalBlocked}
                  onRecheck={openReview}
                  onDeliveryChange={(rowId, delivery) => {
                    // The choice belongs to the row, so the next review and the saved set keep it.
                    // Not `updateRow`: where a render goes changes nothing the dry-run checked.
                    record();
                    setRows((current) =>
                      current.map((row) => {
                        if (row.id !== rowId) return row;
                        const { delivery: _previous, ...rest } = row;
                        return delivery ? { ...rest, delivery } : rest;
                      }),
                    );
                  }}
                  onClose={() => setReview(null)}
                  onFired={() => {
                    setRowSelection({});
                    // The rail counts renders from this read; the fired jobs are its newest.
                    void queryClient.invalidateQueries({
                      queryKey: templateJobsKey(brandId, contract.template.key),
                      exact: true,
                    });
                  }}
                  onOpenLedger={(jobIds) => onFired?.(jobIds)}
                  onShowRow={showRow}
                />
              ) : (
                <section aria-label="Readiness" className="flex h-full min-h-0 flex-col text-xs">
                  {/* Only reports: Render in the toolbar is the one way into the review. */}
                  <div className="flex h-10 shrink-0 items-center gap-3 px-[var(--card-pad)]">
                    <p className="min-w-0 truncate font-medium">
                      {readinessSummary(readiness, rows.length)}
                    </p>
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-[var(--card-pad)] pb-2 text-muted-foreground">
                    {readiness.findings.length ? (
                      <ul className="flex flex-col gap-0.5">
                        {readiness.findings.map(([key, finding]) => (
                          <li key={key}>
                            {contract.variables.find((variable) => variable.key === key)?.label ??
                              'Check'}
                            : {finding.message} — {finding.rows.join(', ')}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <p>
                      To add a field or change the layout, ask a designer to update the template.
                      {contract.template.contractSource === 'template_forge'
                        ? ''
                        : ' This template sets no text limits, so check long text in the preview.'}
                      {fireHint && selected.length ? ` ${fireHint}.` : ''}
                    </p>
                  </div>
                </section>
              )}
            </ResizablePanel>
          </ResizablePanelGroup>
          <RenderRowsImport
            key={`${brandId}:${contract.template.key}:${contract.template.contractHash}`}
            brandId={brandId}
            contract={contract}
            existingRows={rows.length}
            open={importOpen}
            pasted={pasted}
            onOpenChange={(open) => {
              setImportOpen(open);
              // Spent once reviewed: a remounted dialog must not replay an old paste.
              if (!open) setPasted(null);
            }}
            onImport={(imported) =>
              appendRows(
                imported.map((row) =>
                  row.parentId === null && row.outputIds.length === 0
                    ? { ...row, outputIds: allOutputIdsOf(contract) }
                    : row,
                ),
              )
            }
          />
        </>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          Choose a template to set up renders.
        </div>
      )}
      {contract ? (
        <AiDraftDialog
          open={aiDraft !== null}
          onOpenChange={(open) => !open && setAiDraft(null)}
          brandId={brandId}
          bindingId={bindingId}
          contract={contract}
          parent={aiDraft?.parent ?? null}
          initialVaryKeys={aiDraft?.varyKeys ?? null}
          initialCount={aiDraft?.count ?? null}
          onDrafted={acceptDraft}
        />
      ) : null}
      <SetHistoryDialog
        brandId={brandId}
        set={historyFor}
        contractHash={contract?.template.contractHash ?? ''}
        onRestore={restoreRevision}
        onOpenChange={(open) => !open && setHistoryFor(null)}
      />
      <NameDialog
        open={nameRequest !== null}
        title={nameRequest?.title ?? ''}
        description={nameRequest?.description}
        initialName={nameRequest?.initialName ?? ''}
        confirmLabel={nameRequest?.confirmLabel ?? 'Save'}
        onConfirm={(name) => nameRequest?.onConfirm(name)}
        onOpenChange={(open) => {
          if (open) return;
          nameRequest?.onCancel?.();
          setNameRequest(null);
        }}
      />
      <AlertDialog
        open={pendingDiscard !== null}
        onOpenChange={(open) => !open && setPendingDiscard(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved edits?</AlertDialogTitle>
            <AlertDialogDescription>
              {proposed.size
                ? 'Proposed rows are saved only once you keep them; these will be lost.'
                : activeSet
                  ? `Changes to “${activeSet.name}” could not be saved and will be lost.`
                  : 'These rows were never saved to a render set.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const action = pendingDiscard;
                setPendingDiscard(null);
                action?.();
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

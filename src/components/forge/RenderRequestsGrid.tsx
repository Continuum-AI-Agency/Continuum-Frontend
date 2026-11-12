'use client';

import {
  API_RENDER_MEDIA_LIST_MAX,
  type ApiRenderBatchRecord,
  type ApiRenderDeliveryTarget,
  type ApiRenderInputSet,
  type ApiRenderInputValue,
  type ApiRenderJob,
  type ApiRenderSuggestRowsResponse,
  type ApiRenderTemplateContract,
  type ApiRenderTemplateSummary,
  type ApiRenderVariable,
  effectiveRenderValues,
  FORGE_RENDER_SET_DEFAULT_SETTINGS,
  FORGE_RENDER_SET_MAX_DESCENDANT_DEPTH,
  type ForgeRenderSet,
  type ForgeRenderSetRevision,
  type ForgeRenderSetRow,
  type ForgeRenderSetSettings,
  isWebTemplateKey,
  type MediaAsset,
  readableLayerName,
  type TemplateRevisionRef,
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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type ColumnDef,
  type ExpandedState,
  getCoreRowModel,
  getExpandedRowModel,
  type RowSelectionState,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table';
import { ChevronDown, ChevronRight, ClipboardPaste, Loader2, Send, Undo2, X } from 'lucide-react';
import { useLocale as useUiLocale, useTranslations as useUiTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDefaultLayout } from 'react-resizable-panels';
import {
  AiDraftDialog,
  type AiDraftParent,
  type SelectedFile,
} from '@/components/forge/AiVariationsDialog';
import { DataGrid, KIND_ICONS, STICKY_LEFT, selectColumn } from '@/components/forge/DataGrid';
import {
  AdDrillDown,
  DeliveryTargetPicker,
  useDeliveryDestinations,
  useReplaceFormats,
} from '@/components/forge/DeliveryTargetPicker';
import { previewFormats } from '@/components/forge/FormatPreview';
import {
  ActionMenuItems,
  type GridActionContext,
  menuFor,
  selectionActions,
  takeFocusAfter,
} from '@/components/forge/gridActions';
import { useLiveFit } from '@/components/forge/livePreview';
import { isStillsOnly } from '@/components/forge/OutputSettingsPanel';
import {
  FORGE_STALE_MS,
  forgeQueryKeys,
  templateListQuery,
  templateLoadQueries,
} from '@/components/forge/queryKeys';
import { type FiredRow, RenderConfirmDialog } from '@/components/forge/RenderConfirmDialog';
import { RenderPreviewPanel } from '@/components/forge/RenderPreviewPanel';
import {
  downloadTemplateCsv,
  fetchLibraryAsset,
  RenderRowsImport,
} from '@/components/forge/RenderRowsImport';
import { NameDialog } from '@/components/forge/RenderSetMenu';
import {
  deliverySummary,
  RenderSetSettingsDialog,
  useSetApprovalRooms,
} from '@/components/forge/RenderSetSettingsDialog';
import { RenderSetTabs, templateJobsKey } from '@/components/forge/RenderSetTabs';
import { RenderToolbar, templateLabel } from '@/components/forge/RenderToolbar';
import { explainFinding } from '@/components/forge/readinessCopy';
import {
  HELD_SET,
  type HoldScope,
  heldConfirmCopy,
  isHeld,
  SIGNED_OUT,
  useRenderHold,
} from '@/components/forge/renderHold';
import {
  addSibling,
  applyAssistOps,
  applyFormats,
  applyValue,
  clearKey,
  descendantsOf,
  discardProposed,
  draftStorageKey,
  duplicateLabel,
  effectiveEncode,
  effectiveMedia,
  effectiveOutputIds,
  effectiveValues,
  emptyHistory,
  forkLabel,
  fromRenderSetRows,
  isRenderable,
  keepProposed,
  MAX_BATCH_ROWS,
  mergeSetRows,
  missingInputs,
  moveRow,
  nestRows,
  newRowId,
  parseDelimited,
  proposedIds,
  pushHistory,
  type RenderOverride,
  type RequestRow,
  type RowDrop,
  type RowStatus,
  rebaseRows,
  renderedRatios,
  resetKey,
  restoreRows,
  rootRowId,
  rowBreadcrumb,
  rowDepth,
  rowFileCount,
  rowMediaOf,
  rowStatusOf,
  rowsFromSuggestion,
  seedRow,
  toPreflightDelivery,
  toRenderSetRows,
  toVariableMap,
  validateRow,
} from '@/components/forge/renderRequestRows';
import {
  DestinationCell,
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
import { checkpointGraph } from '@/components/forge/templateCheckpoints';
import { useForgePresentationText } from '@/components/forge/useForgePresentationText';
import { useActiveBrandContext } from '@/components/providers/ActiveBrandProvider';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { toast } from '@/components/ui/toast-imperative';
import { useUiErrorMessage } from '@/i18n/errors';
import { ApiError } from '@/lib/api/errors';
import {
  fetchTemplateLineage,
  fetchTemplateRevisionVariants,
  fetchTemplateVariants,
  saveTemplateVariables,
} from '@/lib/library/templateSources';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';
import { pickedPins, pinFromAsset } from '@/StudioCanvas/nodes/api-render/RenderVariableFields';
import {
  describeRenderDiscoveryFailure,
  needsTemplateRepair,
} from '@/StudioCanvas/nodes/api-render/renderDiscoveryCopy';
import { useApiRenderJobs } from '@/StudioCanvas/nodes/api-render/useApiRenderJobs';

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

/** How long an edit settles before autosave writes it; how long after a failed save it retries. */
const AUTOSAVE_MS = 1500;
const AUTOSAVE_RETRY_MS = 5000;
type CollectionLoad = {
  phase: 'loading' | 'ready' | 'error';
  error: string | null;
  initialFailed: boolean;
  hasData: boolean;
  unassignedDraft: boolean;
  refreshing: boolean;
};

/**
 * Whether saving the same rows again could succeed. A refusal (4xx) answers the same until
 * something changes, so autosave stops re-sending it every few seconds; an outage, a dropped
 * connection, an expired session or rate limit may clear by itself.
 */
const saveMayRecover = (error: unknown) =>
  !(error instanceof ApiError) || error.status >= 500 || [401, 408, 429].includes(error.status);
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
    }));
  } catch {
    return null;
  }
}

const allOutputIdsOf = (contract: ApiRenderTemplateContract | null) =>
  contract?.outputs.map((output) => output.id) ?? [];

/** A fresh set: one base row carrying the designer's own values, in every format. */
const seededRows = (contract: ApiRenderTemplateContract): RequestRow[] => [
  {
    ...seedRow(contract.variables, 'Base'),
    outputIds: allOutputIdsOf(contract),
  },
];

/** What "saved" is compared against: the rows exactly as a render set would store them. */
const signatureOf = (rows: RequestRow[], contract: ApiRenderTemplateContract | null) =>
  JSON.stringify(toRenderSetRows(rows, allOutputIdsOf(contract)));

/** Inputs, not a render, so the snapshot is everything the dry-run is asked about. */
const preflightSnapshot = (rows: RequestRow[], id: string) =>
  JSON.stringify([
    effectiveValues(rows, id),
    effectiveEncode(rows, id) ?? null,
    effectiveOutputIds(rows, id),
  ]);

const rowStepCoordinates: KeyboardCoordinateGetter = (event, { currentCoordinates }) => {
  if (event.code === 'ArrowDown')
    return {
      ...currentCoordinates,
      y: currentCoordinates.y + KEYBOARD_DROP_STEP_PX,
    };
  if (event.code === 'ArrowUp')
    return {
      ...currentCoordinates,
      y: currentCoordinates.y - KEYBOARD_DROP_STEP_PX,
    };
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
    {
      id: 'drag',
      size: 28,
      header: '',
      cell: DragHandleCell,
      meta: STICKY_LEFT,
    },
    selectColumn<RequestRow>(),
    {
      id: 'label',
      size: 232,
      header: 'Name',
      cell: LabelCell,
      meta: STICKY_LEFT,
    },
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
    // Where each row goes, editable in place; a web component lands in the Library only.
    ...(isWebTemplateKey(contract.template.key)
      ? []
      : [
          {
            id: 'destination',
            size: 170,
            header: 'Destination',
            cell: DestinationCell,
          },
        ]),
    { id: 'status', size: 130, header: 'Status', cell: StatusCell },
  ];
}

/** "4 of 6 rows ready to render · 1 needs fixing · 1 still checking" — no state word to decode. */
function readinessSummary(
  counts: {
    ready: number;
    blocked: number;
    needsInput: number;
    call: number;
    review: number;
    checking: number;
  },
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
    needs(counts.call, 'your call'),
    needs(counts.review, 'a review'),
    counts.checking ? `${counts.checking} still checking` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * What a refusal the render confirmation found is about: the row as it was asked, of the template
 * as it was asked. An edit to the row, to what it inherits, or a different checkpoint retires it.
 */
const refusalKey = (
  rows: RequestRow[],
  id: string,
  templateRef: string | null,
  contractHash: string | null,
) => JSON.stringify([preflightSnapshot(rows, id), templateRef, contractHash]);

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
/** Open a template's settings on the Templates tab: its source asset, and the detail tab to show. */
export type ForgeTemplateIntent = { assetId: string; tab?: string };

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
  /** Files dropped on the template's Draft button: the draft opens with them attached. */
  draftDrop?: Promise<SelectedFile[]>;
  templateRevision?: TemplateRevisionRef;
  templateRef?: string;
  /** A row of `renderSetId` to bring into view — a Library asset's link back to where it came from. */
  rowId?: string;
  /** Select that row alone, so Render (and its review) is the next step. Never renders by itself. */
  rerender?: boolean;
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
  metaWritesAllowed,
  onFired,
  intent,
  onIntentConsumed,
  onOpenTemplate,
  active = true,
}: {
  brandId: string;
  /** The brand's arming switch for real Meta writes, as the page read it. */
  metaWritesAllowed?: boolean;
  /**
   * Whether the Render tab is showing. The grid stays mounted across tabs (unsaved rows live
   * here), so a rename, publish or adoption made on Templates reaches the picker only by
   * re-listing templates when the tab comes back.
   */
  active?: boolean;
  /**
   * Called with a queued batch's job ids when the person opens the Render ledger from the queued
   * toast — the tab shell switches to it. Queuing alone keeps the Render tab, where each row's
   * Status follows its job.
   */
  onFired?: (jobIds: string[]) => void;
  /** Each new intent selects its template and loads its render set, over the newest-set default. */
  intent?: ForgeRenderIntent;
  /** The grid has taken `intent`; the shell drops it so a remount never replays it. */
  onIntentConsumed?: () => void;
  /** Jump to the template behind this set on the Templates tab (the shell switches tabs). */
  onOpenTemplate?: (intent: ForgeTemplateIntent) => void;
}) {
  const presentForge = useForgePresentationText();

  const uiErrorText = useUiErrorMessage();

  const currentUiLocale = useUiLocale();

  const translateUi = useUiTranslations('forge');

  const queryClient = useQueryClient();
  // A Final is the fleet's `test: false`; the backend refuses it to anyone but an owner or admin.
  const brandContext = useActiveBrandContext();
  // A batch whose createBatch failed is held per user, brand, binding, template and render set
  // (renderHold.ts), in every tab: while it is, Render opens it, never a new confirmation. With no
  // user id there is no key to hold under, so Render is disabled.
  const userId = brandContext.user?.id ?? null;
  const brandRole = brandContext.permissions.find(
    (permission) => permission.brand_profile_id === brandId,
  )?.role;
  const finalBlocked =
    brandRole === 'owner' || brandRole === 'admin'
      ? null
      : 'Only a brand owner or admin can render a Final.';
  const [templates, setTemplates] = useState<ApiRenderTemplateSummary[]>([]);
  // Which template, and optionally which saved set, the rows come from. A new object is a new
  // load, so an intent for another set of the same template still reloads.
  const [templateRevision, setTemplateRevision] = useState<TemplateRevisionRef | null>(null);
  const [templateRef, setTemplateRef] = useState<string | null>(null);
  const [selection, setSelection] = useState<ForgeRenderIntent>({
    templateKey: '',
  });
  const { templateKey } = selection;
  // A web component has no workspace: no live kit, checkpoint or revision pin applies to it.
  const web = isWebTemplateKey(templateKey);
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
  const sourceAssetId = contract?.template.sourceAssetId ?? null;
  const lineage = useQuery({
    queryKey: forgeQueryKeys.lineage(brandId, sourceAssetId ?? ''),
    queryFn: () => fetchTemplateLineage(brandId, sourceAssetId as string),
    enabled: sourceAssetId !== null && !web,
    staleTime: FORGE_STALE_MS.lists,
  });
  const checkpoints = useMemo(
    () => (lineage.data ? checkpointGraph(lineage.data) : null),
    [lineage.data],
  );
  const pinCheckpoint = (ref: string | null) => {
    setTemplateRef(ref);
  };
  const [layerSwitches, setLayerSwitches] = useState<ApiRenderVariable[]>([]);
  const [linkedFields, setLinkedFields] = useState<ApiRenderVariable[]>([]);
  const [inputSets, setInputSets] = useState<ApiRenderInputSet[]>([]);
  const [renderSets, setRenderSets] = useState<ForgeRenderSet[]>([]);
  const [inputSetLoad, setInputSetLoad] = useState<CollectionLoad>({
    phase: 'loading',
    error: null,
    initialFailed: false,
    hasData: false,
    unassignedDraft: false,
    refreshing: false,
  });
  const [renderSetLoad, setRenderSetLoad] = useState<CollectionLoad>({
    phase: 'loading',
    error: null,
    initialFailed: false,
    hasData: false,
    unassignedDraft: false,
    refreshing: false,
  });
  const [activeSet, setActiveSet] = useState<ForgeRenderSet | null>(null);
  const [draftOffer, setDraftOffer] = useState<RequestRow[] | null>(null);
  /** What opening a set saved for an earlier template trimmed off; saving it makes that final. */
  const [rebaseDrops, setRebaseDrops] = useState<string[]>([]);
  const [saveState, setSaveState] = useState<
    | { phase: 'idle' | 'saving' }
    // `signature` is the rows that failed: a refusal is not re-sent until they change or Save.
    | {
        phase: 'failed';
        reason: string;
        retry: boolean;
        repair: boolean;
        signature: string;
      }
  >({ phase: 'idle' });
  /** Someone else's version of the open set, when it and the rows on screen changed one row two ways. */
  const [conflict, setConflict] = useState<ForgeRenderSet | null>(null);
  const [historyFor, setHistoryFor] = useState<ForgeRenderSet | null>(null);
  /** Open for new rows (`parent: null`) or for variations of one row. */
  const [aiDraft, setAiDraft] = useState<{
    parent: AiDraftParent | null;
    varyKeys?: string[];
    dropped?: Promise<SelectedFile[]>;
  } | null>(null);
  /** A menu-driven draft in flight: what the banner says, and what blocks a second click. */
  const [generating, setGenerating] = useState<{
    count: number;
    of: string;
  } | null>(null);
  /** A template whose Render tab was opened to draft with AI, until its contract has loaded. */
  const [draftFor, setDraftFor] = useState<{
    templateKey: string;
    dropped?: Promise<SelectedFile[]>;
  } | null>(null);
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [emptyVariant, setEmptyVariant] = useState('');
  const [savedSignature, setSavedSignature] = useState('');
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [expanded, setExpanded] = useState<ExpandedState>(true);
  const [previewRowId, setPreviewRowId] = useState<string | null>(null);
  const [busy, setBusy] = useState<'loading' | 'saving' | 'firing' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pendingDiscard, setPendingDiscard] = useState<(() => void) | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [pasted, setPasted] = useState<{ text: string } | null>(null);
  /** A sheet attached to the AI button with nothing asked of it: imported, not interpreted. */
  const [preloadedSheet, setPreloadedSheet] = useState<{ file: File } | null>(null);
  const [nameRequest, setNameRequest] = useState<NameRequest | null>(null);
  const [dropHint, setDropHint] = useState<RowDrop | null>(null);
  /** The render confirmation is open on the rows selected when Render was clicked. */
  const [confirming, setConfirming] = useState(false);
  /** The rows Render opened the confirmation on, and the selected rest with why they stay behind. */
  const [subset, setSubset] = useState<{
    rowIds: string[];
    skippedRows: { label: string; message: string }[];
  } | null>(null);
  /** "Send to ad set…" is open over the selected rows. */
  const [sendingTo, setSendingTo] = useState(false);
  const holdOf = (renderSetId: string): HoldScope | null =>
    userId && contract
      ? {
          userId,
          brandId,
          bindingId,
          templateKey: contract.template.key,
          renderSetId,
        }
      : null;
  const holdScope = activeSet ? holdOf(activeSet.id) : null;
  const held = useRenderHold(holdScope);
  /**
   * A held set warns, never blocks: Duplicate, Delete, Restore as new set, Change set template
   * revision, Run on other variants, Update to current template (tab menu and banner) and Import
   * browser draft each ask one confirm while it is held (read fresh), then go. Retry still sends
   * the frozen batch; a copy starts with no hold. Rename, describe and row edits never ask.
   * True when it asked: the caller returns, and `run` goes on Continue.
   */
  const [heldConfirm, setHeldConfirm] = useState<{
    copy: boolean;
    run: () => void;
  } | null>(null);
  const askIfHeld = (set: { id: string } | null, run: () => void, copy = false): boolean => {
    const scope = set ? holdOf(set.id) : null;
    if (!scope || !isHeld(scope)) return false;
    setHeldConfirm({ copy, run });
    return true;
  };
  /** The set whose delivery settings are open. */
  const [settingsFor, setSettingsFor] = useState<ForgeRenderSet | null>(null);
  /** Each rendered row's newest job, and the row as it was rendered: an edit ends its run view. */
  const [fired, setFired] = useState<Record<string, { jobId: string; snapshot: string }>>({});
  // Panel widths are the person's — remembered in this browser. v2: the sets rail became tabs.
  const panelsLayout = useDefaultLayout({
    id: 'forge-render-panels-v2',
    storage: typeof window === 'undefined' ? undefined : localStorage,
  });
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [fieldsOpen, setFieldsOpen] = useState(() => readStored(FIELDS_OPEN_KEY, false));
  /** Where a menu's picked action wants focus once the menu has closed. */
  const menuFocus = useRef<(() => HTMLElement | null) | null>(null);
  const gridBox = useRef<HTMLDivElement>(null);
  const draftAnchor = useRef<HTMLButtonElement>(null);
  /** A row just added, whose name field takes focus once it is on screen. */
  const focusRowId = useRef<string | null>(null);

  const latestRows = useRef(rows);
  latestRows.current = rows;
  const savedSignatureRef = useRef(savedSignature);
  savedSignatureRef.current = savedSignature;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const loadGeneration = useRef(0);
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
      .fetchQuery(templateListQuery(brandId))
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
        setProblem(
          describeRenderDiscoveryFailure(error instanceof Error ? error.message : '', presentForge),
        );
      })
      .finally(() => {
        if (!cancelled) setBusy(null);
      });
    return () => {
      cancelled = true;
    };
  }, [brandId, queryClient, templatesEpoch, presentForge]);

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
      setEmptyVariant('');
      // A browser draft was never saved anywhere, so it starts out as unsaved edits.
      setSavedSignature(saved ? signatureOf(saved, forContract) : '');
      setRowSelection({});
      setPreviewRowId(null);
      setExpanded(true);
      setConfirming(false);
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
      setTemplateRevision(
        set.templateRevision
          ? {
              templateId: set.templateRevision.templateId,
              variantId: set.templateRevision.variantId,
              revisionId: set.templateRevision.revisionId,
            }
          : null,
      );
      setConflict(null);
      const loaded = fromRenderSetRows(set.rows);
      // Published arrangement names can change without changing the reflected contract hash.
      const { rows: rebased, dropped } = rebaseRows(loaded, forContract);
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
      setLayerSwitches([]);
      setLinkedFields([]);
      setRows([]);
      return;
    }
    let cancelled = false;
    loadGeneration.current += 1;
    setInputSetLoad({
      phase: 'loading',
      error: null,
      initialFailed: false,
      hasData: false,
      unassignedDraft: false,
      refreshing: false,
    });
    setRenderSetLoad({
      phase: 'loading',
      error: null,
      initialFailed: false,
      hasData: false,
      unassignedDraft: false,
      refreshing: false,
    });
    const reads = templateLoadQueries(brandId, contractBindingId, templateKey);
    Promise.all([
      queryClient.fetchQuery(reads.contract),
      queryClient
        .fetchQuery(reads.inputSets)
        .then((value) => ({ value, error: null as string | null }))
        .catch((error: unknown) => ({
          value: queryClient.getQueryData<Awaited<ReturnType<typeof apiRendersApi.listInputSets>>>(
            reads.inputSets.queryKey,
          ),
          error: describeRenderDiscoveryFailure(
            error instanceof Error ? error.message : '',
            presentForge,
          ),
        })),
      queryClient
        .fetchQuery(reads.renderSets)
        .then((value) => ({ value, error: null as string | null }))
        .catch((error: unknown) => ({
          value: queryClient.getQueryData<Awaited<ReturnType<typeof apiRendersApi.listRenderSets>>>(
            reads.renderSets.queryKey,
          ),
          error: describeRenderDiscoveryFailure(
            error instanceof Error ? error.message : '',
            presentForge,
          ),
        })),
    ])
      .then(([next, setsResult, savedSetsResult]) => {
        if (cancelled) return;
        setContract(next);
        setLayerSwitches(next.layerSwitchesNotAsked);
        setLinkedFields(next.linkedFields ?? []);
        setInputSets(setsResult.value?.items ?? []);
        setInputSetLoad({
          phase: setsResult.error ? 'error' : 'ready',
          error: setsResult.error,
          initialFailed: Boolean(setsResult.error),
          hasData: setsResult.value !== undefined,
          unassignedDraft: false,
          refreshing: false,
        });
        // A set belongs to the environment it was saved in; one from another would refuse to render.
        const binding = bindingRef.current;
        const inBinding = (savedSetsResult.value?.items ?? []).filter(
          (set) => !binding || set.bindingId === binding,
        );
        setRenderSets(inBinding);
        setRenderSetLoad({
          phase: savedSetsResult.error ? 'error' : 'ready',
          error: savedSetsResult.error,
          initialFailed: Boolean(savedSetsResult.error),
          hasData: savedSetsResult.value !== undefined,
          unassignedDraft: false,
          refreshing: false,
        });
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
        toast.error(
          describeRenderDiscoveryFailure(error instanceof Error ? error.message : '', presentForge),
        );
        setInputSetLoad({
          phase: 'error',
          error: 'Input sets could not be loaded.',
          initialFailed: true,
          hasData: false,
          unassignedDraft: false,
          refreshing: false,
        });
        setRenderSetLoad({
          phase: 'error',
          error: 'Saved render sets could not be loaded.',
          initialFailed: true,
          hasData: false,
          unassignedDraft: false,
          refreshing: false,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [
    brandId,
    selection,
    templateKey,
    contractBindingId,
    queryClient,
    showRows,
    openSet,
    presentForge,
  ]);

  const retryInputSets = async () => {
    if (!contract) return;
    const reads = templateLoadQueries(brandId, contractBindingId, contract.template.key);
    const generation = loadGeneration.current;
    const requestedSelection = selection;
    const isCurrent = () =>
      generation === loadGeneration.current && selectionRef.current === requestedSelection;
    setInputSetLoad((current) => ({ ...current, refreshing: true }));
    try {
      const result = await queryClient.fetchQuery({
        ...reads.inputSets,
        staleTime: 0,
      });
      if (!isCurrent()) return;
      setInputSets(result.items);
      setInputSetLoad((current) => ({
        ...current,
        phase: 'ready',
        error: null,
        initialFailed: false,
        hasData: true,
        refreshing: false,
      }));
    } catch (error) {
      if (!isCurrent()) return;
      setInputSetLoad((current) => ({
        ...current,
        phase: 'error',
        error: describeRenderDiscoveryFailure(
          error instanceof Error ? error.message : '',
          presentForge,
        ),
        refreshing: false,
      }));
    }
  };

  const retryRenderSets = async () => {
    if (!contract) return;
    const reads = templateLoadQueries(brandId, contractBindingId, contract.template.key);
    const forContract = contract;
    const generation = loadGeneration.current;
    const requestedSelection = selection;
    const isCurrent = () =>
      generation === loadGeneration.current && selectionRef.current === requestedSelection;
    setRenderSetLoad((current) => ({ ...current, refreshing: true }));
    try {
      const result = await queryClient.fetchQuery({
        ...reads.renderSets,
        staleTime: 0,
      });
      if (!isCurrent()) return;
      const binding = bindingRef.current;
      const inBinding = result.items.filter((set) => !binding || set.bindingId === binding);
      const wanted =
        inBinding.find((set) => set.id === selection.renderSetId) ?? inBinding[0] ?? null;
      const unassignedDraft =
        activeSetRef.current === null &&
        inBinding.length > 0 &&
        signatureOf(latestRows.current, forContract) !== savedSignatureRef.current;
      setRenderSets(inBinding);
      setRenderSetLoad((current) => ({
        ...current,
        phase: 'ready',
        error: null,
        initialFailed: false,
        hasData: true,
        refreshing: false,
        unassignedDraft,
      }));
      if (activeSetRef.current === null) {
        if (unassignedDraft) setActiveSet(null);
        else if (wanted) openSet(wanted, forContract);
      }
    } catch (error) {
      if (!isCurrent()) return;
      setRenderSetLoad((current) => ({
        ...current,
        phase: 'error',
        error: describeRenderDiscoveryFailure(
          error instanceof Error ? error.message : '',
          presentForge,
        ),
        refreshing: false,
      }));
    }
  };

  // --- row edits ---------------------------------------------------------------------------
  // biome-ignore lint/correctness/useExhaustiveDependencies: `record` reads refs only.
  const updateRow = useCallback(
    (id: string, patch: (row: RequestRow) => RequestRow, coalesce?: string) => {
      record(coalesce ?? null);
      setRows((current) =>
        current.map((row) => {
          if (row.id !== id) return row;
          const next = patch(row);
          const evidence = Object.fromEntries(
            Object.entries(next.evidence ?? {}).filter(
              ([key]) => JSON.stringify(row.values[key]) === JSON.stringify(next.values[key]),
            ),
          );
          return { ...next, evidence };
        }),
      );
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
          values: {
            ...row.values,
            [variable.key]: variable.multiple ? pins : pins[0]!,
          },
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

  const variables = contract?.variables;
  // Per row: what is wrong with it (`clientErrors`, which keeps it from rendering), and what a
  // person may render through on purpose (`calls`, decided at Render, never an error in the row).
  const { clientErrors, calls } = useMemo(() => {
    const errorsByRow = new Map<string, Record<string, string>>();
    const callsByRow = new Map<
      string,
      Array<{ override: RenderOverride; message: string; key?: string }>
    >();
    for (const row of rows) {
      // What the render will fill: a saved default satisfies a required field, and a headline
      // split across layers needs exactly its lines — or someone saying "render anyway".
      const rendered = effectiveRenderValues(
        [...(variables ?? []), ...linkedFields],
        effectiveValues(rows, row.id),
      );
      const errors = validateRow(variables ?? [], rendered.values, translateUi);
      const rowCalls: Array<{
        override: RenderOverride;
        message: string;
        key?: string;
      }> = [];
      for (const problem of rendered.problems)
        if (problem.overridable)
          rowCalls.push({
            override: 'acceptLinkedLineMismatch',
            message: problem.message,
            key: problem.key,
          });
        else errors[problem.key] ??= problem.message;
      errorsByRow.set(row.id, errors);
      if (rowCalls.length) callsByRow.set(row.id, rowCalls);
    }
    return { clientErrors: errorsByRow, calls: callsByRow };
  }, [rows, variables, linkedFields, translateUi]);

  // --- row operations ---------------------------------------------------------------------
  // ponytail: reuse the inheritance walk per row; cache it if large sets make this slow.
  const rowVariants = new Set(
    rows.map((row) => {
      const chosen = effectiveOutputIds(rows, row.id);
      const ids = chosen.length ? chosen : allOutputIdsOf(contract);
      return ids.length === allOutputIdsOf(contract).length &&
        ids.every((id) => allOutputIdsOf(contract).includes(id))
        ? ''
        : ids.length === 1
          ? ids[0]!
          : null;
    }),
  );
  const variant =
    rowVariants.size > 1 ? null : rowVariants.size ? [...rowVariants][0] : emptyVariant;
  /** `keepOutputs`: rows that already name their formats (a sheet's market column) keep them. */
  const appendRows = (added: RequestRow[], keepOutputs = false): boolean => {
    const current = latestRows.current;
    if (current.length + added.length > MAX_BATCH_ROWS) {
      toast.error(
        translateUi('a_render_set_supports_at_most_value_898f7567', {
          value0: String(MAX_BATCH_ROWS),
        }),
      );
      return false;
    }
    record();
    latestRows.current = [
      ...current,
      ...added.map((row) =>
        variant && !row.parentId && !(keepOutputs && row.outputIds.length)
          ? { ...row, outputIds: [variant] }
          : row,
      ),
    ];
    setRows(latestRows.current);
    return true;
  };

  const fork = (ids: string[]) => {
    const current = latestRows.current;
    const parents = current.filter((row) => ids.includes(row.id));
    if (parents.some((row) => rowDepth(current, row.id) >= FORGE_RENDER_SET_MAX_DESCENDANT_DEPTH)) {
      toast.error(
        translateUi('forks_go_at_most_value0_levels_deep_fd53df7b', {
          value0: String(FORGE_RENDER_SET_MAX_DESCENDANT_DEPTH),
        }),
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
      toast.error(
        translateUi('a_render_set_supports_at_most_value_8d30736a', {
          value0: String(MAX_BATCH_ROWS),
        }),
      );
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
          `tr[data-row-id="${id}"] input[data-row-name-input]`,
        )
      : null;
    if (!input) return;
    focusRowId.current = null;
    input.focus();
  }, [rows, expanded]);

  /** A row named elsewhere — an intent, a menu — brought into view and previewed. */
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
        label: translateUi('undo_a8283ade'),
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

  const { data: sourceVariants } = useQuery({
    queryKey: forgeQueryKeys.templateVariants(brandId),
    queryFn: () => fetchTemplateVariants(brandId),
    staleTime: FORGE_STALE_MS.active,
  });
  // What each template was authored in, for the picker: the same one registry read the gallery makes.
  const { data: brandRegistry } = useQuery({
    queryKey: forgeQueryKeys.revisionVariants(brandId, 'all'),
    queryFn: () => fetchTemplateRevisionVariants(brandId),
    staleTime: FORGE_STALE_MS.active,
  });
  const templateSourceKinds = useMemo(
    () =>
      brandRegistry
        ? new Map(
            brandRegistry.flatMap((variant) =>
              variant.revisions.map(
                (revision) => [revision.sourceAssetId, variant.sourceKind] as const,
              ),
            ),
          )
        : null,
    [brandRegistry],
  );
  const { data: revisionVariants } = useQuery({
    queryKey: [
      ...forgeQueryKeys.revisionVariants(brandId, contract?.template.sourceAssetId ?? ''),
      'history',
    ],
    queryFn: () => fetchTemplateRevisionVariants(brandId, contract!.template.sourceAssetId!, true),
    enabled: !!contract?.template.sourceAssetId && !web,
    staleTime: FORGE_STALE_MS.active,
  });
  const [pickedRevision, setPickedRevision] = useState('');
  const [revisionChangeBusy, setRevisionChangeBusy] = useState(false);
  const publishedRevisions =
    revisionVariants
      ?.filter((variant) => !variant.archivedAt)
      .flatMap((variant) =>
        variant.revisions
          .filter((revision) => revision.publications.length > 0)
          .flatMap((revision) =>
            revision.publications.map((target) => ({
              id: `${revision.id}:${target.bindingId}:${target.templateKey}`,
              label: translateUi('value0_revision_value1_value2_e8af889d', {
                value0: String(variant.name),
                value1: String(revision.number),
                value2: String(revision.publications.length > 1 ? ` · ${target.templateKey}` : ''),
              }),
              ref: {
                templateId: variant.templateId,
                variantId: variant.variantId,
                revisionId: revision.id,
              },
              target,
            })),
          ),
      ) ?? [];
  const pinnedRevisionLabel = revisionVariants
    ?.flatMap((variant) => variant.revisions.map((revision) => ({ variant, revision })))
    .find((item) => item.revision.id === activeSet?.templateRevision?.revisionId);
  const changeRevision = async (confirmed = false) => {
    const picked = publishedRevisions.find((item) => item.id === pickedRevision);
    if (!picked || (!confirmed && askIfHeld(activeSet, () => void changeRevision(true)))) return;
    setRevisionChangeBusy(true);
    try {
      if (activeSet) {
        const saved = await apiRendersApi.changeRenderSetTemplateRevision(activeSet.id, {
          brandId,
          expectedRevision: activeSet.revision,
          templateRevision: picked.ref,
          templateKey: picked.target.templateKey,
          bindingId: picked.target.bindingId,
        });
        setTemplateRevision(
          saved.templateRevision
            ? {
                templateId: saved.templateRevision.templateId,
                variantId: saved.templateRevision.variantId,
                revisionId: saved.templateRevision.revisionId,
              }
            : null,
        );
        const next = await apiRendersApi.getContract(brandId, saved.templateKey, saved.bindingId);
        setContract(next);
        setLayerSwitches(next.layerSwitchesNotAsked);
        setLinkedFields(next.linkedFields ?? []);
        adoptSet(saved, latestRows.current);
        showRows(latestRows.current, latestRows.current, next);
        queryClient.setQueryData<{ items: ForgeRenderSet[]; nextCursor: null }>(
          forgeQueryKeys.renderSetList(brandId, saved.templateKey),
          (current) => ({
            items: [saved, ...(current?.items ?? []).filter((item) => item.id !== saved.id)],
            nextCursor: null,
          }),
        );
        setSelection({
          templateKey: saved.templateKey,
          bindingId: saved.bindingId,
          renderSetId: saved.id,
        });
        void queryClient.invalidateQueries({
          queryKey: forgeQueryKeys.renderSets(brandId),
        });
        toast.success(translateUi('set_now_uses_the_selected_template__84413847'));
      } else {
        confirmDiscard(() => {
          setTemplateRevision(picked.ref);
          setSelection({
            templateKey: picked.target.templateKey,
            bindingId: picked.target.bindingId,
          });
        });
      }
      setPickedRevision('');
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : translateUi('rows_need_attention_before_changing_dc01443e'),
      );
    } finally {
      setRevisionChangeBusy(false);
    }
  };
  // Every other published variant of this family, at its published head — what an experiment
  // runs the same rows on.
  // ponytail: a revision published to several workspaces runs on its first; pick per target if one needs another.
  const otherVariantHeads =
    revisionVariants?.flatMap((variant) => {
      const head = variant.revisions.find((item) => item.id === variant.publishedHeadRevisionId);
      const target = head?.publications[0];
      return head &&
        target &&
        !variant.archivedAt &&
        variant.variantId !== activeSet?.templateRevision?.variantId
        ? [{ variant, head, target }]
        : [];
    }) ?? [];
  const runOnVariants = async (confirmed = false) => {
    if (!activeSet || (!confirmed && askIfHeld(activeSet, () => void runOnVariants(true), true)))
      return;
    setRevisionChangeBusy(true);
    const made: string[] = [];
    const refused: string[] = [];
    try {
      for (const { variant, head, target } of otherVariantHeads) {
        const name = variant.original ? 'Original' : variant.name;
        try {
          const next = await apiRendersApi.getContract(
            brandId,
            target.templateKey,
            target.bindingId,
          );
          const created = await apiRendersApi.createRenderSet({
            brandId,
            bindingId: target.bindingId,
            name: `${activeSet.name} · ${name}`.slice(0, 200),
            templateKey: target.templateKey,
            contractHash: next.template.contractHash,
            templateRevision: {
              templateId: variant.templateId,
              variantId: variant.variantId,
              revisionId: head.id,
            },
            // The same rows with the same ids: one row id is one row on every variant, which is
            // what the Variants tab's Compare lines up.
            rows: activeSet.rows,
          });
          made.push(created.name);
        } catch (error) {
          refused.push(`${name}: ${describeRenderDiscoveryFailure(error, presentForge)}`);
        }
      }
    } finally {
      setRevisionChangeBusy(false);
    }
    void queryClient.invalidateQueries({
      queryKey: forgeQueryKeys.renderSets(brandId),
    });
    if (made.length)
      toast.success(
        translateUi('made_value0_value1_60a7db48', {
          value0: String(made.length === 1 ? translateUi('a_set_67c61cb3') : `${made.length} sets`),
          value1: String(made.join(', ')),
        }),
      );
    if (refused.length)
      toast.error(
        translateUi('not_made_value0_0fe1bc8f', {
          value0: String(refused.join('; ')),
        }),
      );
  };
  const currentSource = sourceVariants?.find(
    (item) => item.assetId === contract?.template.sourceAssetId,
  );
  const sourceRoot = currentSource?.rootAssetId;
  const variantSources = new Set(
    sourceVariants?.filter((item) => item.rootAssetId === sourceRoot).map((item) => item.assetId),
  );
  const publishedVariants = sourceRoot
    ? templates.filter(
        (item) =>
          item.sourceAssetId &&
          variantSources.has(item.sourceAssetId) &&
          (!bindingId || item.bindingId === bindingId),
      )
    : [];

  // One click from Render: a layer's Show switch becomes a column for every set of this
  // template — the same edit as "Ask per row" in the template's Variables. Rows that never set
  // it keep rendering what the file has.
  const askSwitch = async (_variable: ApiRenderVariable) => {
    toast.info(translateUi('open_edit_layers_to_expose_this_fie_c2f6dea3'));
  };

  const saveAsInputs = (id: string) => {
    const row = latestRows.current.find((item) => item.id === id);
    if (!contract || !row) return;
    setNameRequest({
      title: translateUi('save_as_inputs_b47d5e52'),
      description: translateUi('saves_what_this_row_renders_with_it_5c518632'),
      initialName: row.label || 'Untitled inputs',
      confirmLabel: 'Save inputs',
      onConfirm: async (name) => {
        try {
          const created = await apiRendersApi.createInputSet({
            brandId,
            templateKey: contract.template.key,
            contractHash: contract.template.contractHash,
            name,
            variables: toVariableMap({
              values: effectiveValues(latestRows.current, id),
            }),
          });
          setInputSets((current) => [created, ...current]);
          void queryClient.invalidateQueries({
            queryKey: forgeQueryKeys.inputSets(brandId, contract.template.key),
            exact: true,
          });
          toast.success(translateUi('saved_value0_f085d930', { value0: String(name) }));
          setNameRequest(null);
        } catch (error) {
          toast.error(
            describeRenderDiscoveryFailure(
              error instanceof Error ? error.message : '',
              presentForge,
            ),
          );
        }
      },
    });
  };

  /**
   * Imported rows land selected — the next click renders them — and the first is previewed. A
   * root renders the formats its sheet named, else the toolbar's, else every one. A picture no
   * sheet column fills (Inyogo's QR) carries over when every row already here shares one.
   */
  const importRows = (imported: RequestRow[]) => {
    if (!contract) return;
    const current = latestRows.current.filter((row) => !row.proposed && !row.parentId);
    const shared = contract.variables.flatMap((item) => {
      if (item.kind !== 'image' && item.kind !== 'video') return [];
      const values = current.map((row) => effectiveValues(latestRows.current, row.id)[item.key]);
      const first = values[0];
      return first !== undefined &&
        values.every((value) => JSON.stringify(value) === JSON.stringify(first))
        ? [{ key: item.key, value: first, media: current[0]!.media[item.key] }]
        : [];
    });
    const all = allOutputIdsOf(contract);
    const rows = imported.map((row) => {
      const values = { ...row.values };
      const media = { ...row.media };
      for (const carried of shared)
        if (values[carried.key] === undefined) {
          values[carried.key] = structuredClone(carried.value);
          if (carried.media) media[carried.key] = carried.media;
        }
      const outputIds =
        row.parentId !== null || row.outputIds.length ? row.outputIds : variant ? [variant] : all;
      return { ...row, values, media, outputIds };
    });
    if (!appendRows(rows, true)) return;
    setExpanded(true);
    setRowSelection(Object.fromEntries(rows.map((row) => [row.id, true])));
    setPreviewRowId(rows[0]?.id ?? null);
  };

  /** What the AI button reads of the grid: every row as it renders, and what is selected. */
  const assistContext = () => {
    const current = latestRows.current.filter((row) => !row.proposed);
    return {
      rows: current.slice(0, MAX_BATCH_ROWS).map((row) => ({
        id: row.id,
        parentId: row.parentId,
        label: row.label.trim() || translateUi('untitled_f59ab8d1'),
        outputIds: effectiveOutputIds(latestRows.current, row.id),
        values: effectiveValues(latestRows.current, row.id),
      })),
      selection: Object.keys(rowSelection).filter(
        (id) => rowSelection[id] && current.some((row) => row.id === id),
      ),
      setDescription: activeSetRef.current?.description ?? null,
    };
  };

  /** The AI button's answer, applied as one undo step; it never renders anything. */
  const applyAssist = (response: ApiRenderSuggestRowsResponse) => {
    if (!contract) return;
    const result = applyAssistOps(latestRows.current, response.ops ?? [], allOutputIdsOf(contract));
    if (result.rows.length > MAX_BATCH_ROWS) {
      toast.error(
        translateUi('a_render_set_supports_at_most_value_2f696b4a', {
          value0: String(MAX_BATCH_ROWS),
        }),
      );
      return;
    }
    const before = history.current.past.at(-1);
    editRows(() => result.rows);
    const changed = history.current.past.at(-1) !== before;
    if (result.selected)
      setRowSelection(Object.fromEntries(result.selected.map((id) => [id, true])));
    if (result.added.length) {
      setExpanded(true);
      setPreviewRowId(result.added[0]!);
    } else {
      const touched = (response.ops ?? []).flatMap((op) =>
        op.op === 'set' || op.op === 'set_outputs'
          ? op.rowIds
          : op.op === 'rename'
            ? [op.rowId]
            : [],
      );
      if (touched.length === 1) setPreviewRowId(touched[0]!);
    }
    if (changed) {
      const mark = history.current.past.at(-1);
      toast.success(response.reply || translateUi('done_11a6767d'), {
        action: {
          label: translateUi('undo_a8283ade'),
          onClick: () => {
            if (history.current.past.at(-1) === mark) undo();
          },
        },
      });
    }
  };

  /** A draft's rows, proposed, under the rows already there; the first one is shown. */
  const acceptDrafts = (responses: ApiRenderSuggestRowsResponse[]) => {
    if (!contract) return;
    const outputs = allOutputIdsOf(contract);
    const drafted = responses.flatMap((response) => rowsFromSuggestion(response, outputs));
    const notes = responses.flatMap((response) => [
      ...response.unfilled,
      ...response.dropped,
      ...(response.sourceWarnings ?? []),
    ]);
    // Said, never assumed: the server reports a short answer in `dropped`, and a draft that
    // produced nothing is a failure the person has to see rather than an empty success toast.
    const described = notes.length
      ? {
          description: `${notes.slice(0, 3).join('; ')}${notes.length > 3 ? translateUi('value0_more_86f3b0c4', { value0: String(notes.length - 3) }) : ''}`,
        }
      : undefined;
    if (drafted.length === 0) {
      toast.error(translateUi('nothing_usable_came_back_try_again__ef8f1cce'), described);
      return;
    }
    if (!appendRows(drafted)) return;
    setExpanded(true);
    setPreviewRowId(drafted[0]?.id ?? null);
    toast.success(
      translateUi('value0_value1_proposed_keep_the_one_2d9bef1a', {
        count: Number(drafted.length),
      }),
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
  }: {
    ids: string[];
    count: number;
    varyKeys: string[];
  }) => {
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
            autoCount: false,
            documentIds: [],
            mediaAssetIds: [],
            forksPerRow: 0,
            // The set's own name, description and rows, read by the server: no repeats.
            ...(activeSetRef.current ? { renderSetId: activeSetRef.current.id } : {}),
            parent: {
              id: row.id,
              label: row.label.trim() || translateUi('untitled_f59ab8d1'),
              values: effectiveValues(current, row.id),
            },
            varyKeys,
          }),
        ),
      );
      acceptDrafts(responses);
    } catch (error) {
      const message = uiErrorText(error);
      toast.error(
        message.includes('suggest_unavailable')
          ? translateUi('the_ai_writer_is_unavailable_right__04e8eb12')
          : describeRenderDiscoveryFailure(message, presentForge),
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
            label: row.label.trim() || translateUi('untitled_f59ab8d1'),
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
  const updateRequired = rebaseDrops.length > 0;
  const needsSave = dirty || olderTemplate || updateRequired;
  const proposed = proposedIds(rows);
  // Autosave waits while a confirmation signs the set's revision, while a conflict is unresolved, and
  // while the set waits on "Update set".
  const autosaveBlocked =
    !contract ||
    !bindingId ||
    rows.length === 0 ||
    (!activeSet && (renderSetLoad.initialFailed || renderSetLoad.unassignedDraft)) ||
    confirming ||
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

  // A row an intent named, held until its set's rows are on screen.
  const [focusRow, setFocusRow] = useState<{
    setId: string | undefined;
    id: string;
    select: boolean;
  } | null>(null);

  // An intent is an event, taken once and handed back. Like every other way of replacing the rows
  // it saves or asks first; one for what is already open changes nothing.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new intent is an event; the rest is read as it arrives.
  useEffect(() => {
    if (!intent) return;
    onIntentConsumed?.();
    // A revision belongs to the template it was picked from. Taking it from the intent — rather
    // than leaving it set — means switching template clears it.
    setTemplateRevision(intent.templateRevision ?? null);
    setTemplateRef(intent.templateRef ?? null);
    const alreadyOpen =
      intent.templateKey === templateKey &&
      (!intent.renderSetId || intent.renderSetId === activeSet?.id);
    if (intent.draftWithAi)
      setDraftFor({
        templateKey: intent.templateKey,
        dropped: intent.draftDrop,
      });
    setFocusRow(
      intent.rowId
        ? {
            setId: intent.renderSetId,
            id: intent.rowId,
            select: intent.rerender === true,
          }
        : null,
    );
    if (!alreadyOpen)
      confirmDiscard(() =>
        setSelection({
          templateKey: intent.templateKey,
          bindingId: intent.bindingId,
          renderSetId: intent.renderSetId,
        }),
      );
  }, [intent]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: showRow reads the grid as it is now.
  useEffect(() => {
    if (!focusRow || (focusRow.setId && activeSet?.id !== focusRow.setId)) return;
    if (!rows.some((row) => row.id === focusRow.id)) return;
    setFocusRow(null);
    if (focusRow.select) setRowSelection({ [focusRow.id]: true });
    showRow(focusRow.id);
  }, [rows, activeSet, focusRow]);

  // The draft opens once the template it was asked for is on screen, not over the previous one.
  useEffect(() => {
    if (!draftFor || contract?.template.key !== draftFor.templateKey) return;
    setDraftFor(null);
    setAiDraft({ parent: null, dropped: draftFor.dropped });
  }, [draftFor, contract]);

  // ponytail: drafts are no longer written — the server autosaves. Browser drafts written before
  // autosave are still offered through "Import browser draft"; drop `readDrafts` and the offer one
  // release after this ships.

  const adoptSet = (saved: ForgeRenderSet, savedRows: RequestRow[]) => {
    activeSetRef.current = saved;
    savedBase.current = saved.rows;
    setActiveSet(saved);
    setTemplateRevision(
      saved.templateRevision
        ? {
            templateId: saved.templateRevision.templateId,
            variantId: saved.templateRevision.variantId,
            revisionId: saved.templateRevision.revisionId,
          }
        : null,
    );
    if (saved.contractHash === contract?.template.contractHash) setRebaseDrops([]);
    setRenderSets((current) => [saved, ...current.filter((set) => set.id !== saved.id)]);
    setSavedSignature(signatureOf(savedRows, contract));
    setDraftOffer(null);
    setConflict(null);
  };

  const createSet = async (
    name: string,
    rowsToSave: RequestRow[],
    {
      announce = true,
      description,
      settings,
      revisionRef,
      rethrow = false,
    }: {
      announce?: boolean;
      description?: string | null;
      settings?: ForgeRenderSetSettings;
      revisionRef?: TemplateRevisionRef;
      /** Hand a failure to the caller instead of toasting it: autosave reports in the toolbar. */
      rethrow?: boolean;
    } = {},
  ): Promise<ForgeRenderSet | null> => {
    if (!contract || !bindingId) return null;
    try {
      const created = await apiRendersApi.createRenderSet({
        brandId,
        bindingId,
        name,
        ...(description ? { description } : {}),
        ...(settings ? { settings } : {}),
        templateKey: contract.template.key,
        contractHash: contract.template.contractHash,
        ...((revisionRef ?? templateRevision)
          ? { templateRevision: revisionRef ?? templateRevision! }
          : {}),
        rows: toRenderSetRows(rowsToSave, allOutputIdsOf(contract)),
      });
      adoptSet(created, rowsToSave);
      void queryClient.invalidateQueries({
        queryKey: forgeQueryKeys.renderSets(brandId),
      });
      if (announce)
        toast.success(
          translateUi('saved_value0_f085d930', {
            value0: String(created.name),
          }),
        );
      return created;
    } catch (error) {
      if (rethrow) throw error;
      toast.error(describeRenderDiscoveryFailure(error, presentForge));
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
    toast.info(
      translateUi('value0_changed_elsewhere_both_sets__e65de92d', {
        value0: String(fresh.name),
      }),
    );
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
    if (!set && (renderSetLoad.initialFailed || renderSetLoad.unassignedDraft)) {
      if (announce) toast.error(translateUi('saved_render_sets_are_unavailable_r_93c26ec3'));
      return null;
    }
    if (proposedIds(submitted).size === submitted.length) return set;
    const run = (async () => {
      setSaveState({ phase: 'saving' });
      try {
        if (!set) {
          const created = await createSet('Untitled set', submitted, {
            announce,
            rethrow: true,
          });
          setSaveState({ phase: 'idle' });
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
        void queryClient.invalidateQueries({
          queryKey: forgeQueryKeys.renderSets(brandId),
        });
        if (announce)
          toast.success(
            translateUi('saved_value0_f085d930', {
              value0: String(saved.name),
            }),
          );
        setSaveState({ phase: 'idle' });
        return saved;
      } catch (error) {
        const message = uiErrorText(error);
        if (set && message.includes('render_set_revision_conflict')) {
          const merged = await resolveConflict(set, submitted);
          setSaveState({ phase: 'idle' });
          return merged;
        }
        const reason = describeRenderDiscoveryFailure(error, presentForge);
        setSaveState({
          phase: 'failed',
          reason,
          retry: saveMayRecover(error),
          repair: needsTemplateRepair(error),
          signature: signatureOf(submitted, contract),
        });
        if (announce) toast.error(reason);
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

  // Autosave: a second and a half after the last edit, five after a save that may recover. A
  // refusal waits for the rows to change or for Save, so it is reported once, not every 5 s.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the signature stands for the rows.
  useEffect(() => {
    if (!needsSave || autosaveBlocked || saveState.phase === 'saving') return;
    if (
      saveState.phase === 'failed' &&
      !saveState.retry &&
      saveState.signature === signatureOf(rows, contract)
    )
      return;
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
    if (!activeSet && (renderSetLoad.initialFailed || renderSetLoad.unassignedDraft) && contract) {
      setNameRequest({
        title: translateUi('save_render_set_e36b8d04'),
        description: renderSetLoad.initialFailed
          ? translateUi('saved_sets_could_not_be_checked_giv_db4c1545')
          : translateUi('your_edited_rows_are_not_assigned_t_b75d0d1a'),
        initialName: 'New set',
        confirmLabel: 'Save set',
        onConfirm: async (name) => {
          const created = await createSet(name, latestRows.current, {
            revisionRef: templateRevision ?? undefined,
          });
          if (created) setNameRequest(null);
        },
      });
      return;
    }
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
    change:
      | { name: string }
      | { description: string | null }
      | { settings: ForgeRenderSetSettings },
    { rethrow = false } = {},
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
      void queryClient.invalidateQueries({
        queryKey: forgeQueryKeys.renderSets(brandId),
      });
    } catch (error) {
      const message = uiErrorText(error);
      if (message.includes('render_set_revision_conflict')) {
        const fresh = await apiRendersApi.getRenderSet(brandId, set.id).catch(() => null);
        if (fresh)
          setRenderSets((sets) => sets.map((item) => (item.id === fresh.id ? fresh : item)));
        toast.error(translateUi('this_set_changed_elsewhere_reload_i_2386f5aa'));
      } else toast.error(describeRenderDiscoveryFailure(message, presentForge));
      if (rethrow) throw error;
    }
  };

  /** A new set with the same rows — deliveries left behind, as a copied row leaves its own. */
  const duplicateSet = async (set: ForgeRenderSet, confirmed = false) => {
    if (!contract || (!confirmed && askIfHeld(set, () => void duplicateSet(set, true), true)))
      return;
    const source = set.id === activeSet?.id ? latestRows.current : fromRenderSetRows(set.rows);
    const copy = rebaseRows(
      source.filter((row) => !proposed.has(row.id)).map(({ delivery: _delivery, ...row }) => row),
      contract,
    ).rows;
    const created = await createSet(duplicateLabel(set.name), copy, {
      announce: false,
      description: set.description,
      settings: set.settings,
    });
    if (!created) return;
    showRows(copy, copy, contract);
    toast.success(
      translateUi('duplicated_as_value0_e0844f1c', {
        value0: String(created.name),
      }),
    );
  };

  /** A kept version as a new set. The set it came from is never written back over. */
  const restoreRevision = async (revision: ForgeRenderSetRevision, confirmed = false) => {
    if (
      !contract ||
      (!confirmed && askIfHeld(historyFor, () => void restoreRevision(revision, true), true))
    )
      return;
    if (
      revision.templateRevision &&
      (revision.templateRevision.templateKey !== contract.template.key ||
        revision.templateRevision.bindingId !== bindingId)
    ) {
      toast.info(translateUi('load_the_historical_template_revisi_9e701211'));
      return;
    }
    const restored = revision.templateRevision
      ? fromRenderSetRows(revision.rows)
      : rebaseRows(fromRenderSetRows(revision.rows), contract).rows;
    const created = await createSet(
      `${revision.name} (restored ${formatRelativeTime(revision.savedAt, undefined, currentUiLocale)})`,
      restored,
      {
        announce: false,
        ...(revision.templateRevision
          ? {
              revisionRef: {
                templateId: revision.templateRevision.templateId,
                variantId: revision.templateRevision.variantId,
                revisionId: revision.templateRevision.revisionId,
              },
            }
          : {}),
      },
    );
    if (!created) return;
    showRows(restored, restored, contract);
    setHistoryFor(null);
    toast.success(
      translateUi('restored_as_value0_a9d9a251', {
        value0: String(created.name),
      }),
    );
  };

  const deleteSet = async (set: ForgeRenderSet, confirmed = false) => {
    if (!contract || (!confirmed && askIfHeld(set, () => void deleteSet(set, true)))) return;
    try {
      await apiRendersApi.deleteRenderSet(brandId, set.id);
      void queryClient.invalidateQueries({
        queryKey: forgeQueryKeys.renderSets(brandId),
      });
    } catch (error) {
      toast.error(
        describeRenderDiscoveryFailure(error instanceof Error ? error.message : '', presentForge),
      );
      return;
    }
    const remaining = renderSets.filter((item) => item.id !== set.id);
    setRenderSets(remaining);
    toast.success(translateUi('deleted_value0_fee7f4ae', { value0: String(set.name) }));
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
  // Does each value still fit the design — checked on the keystroke, from the Live kit.
  const fitFormats = useMemo(
    () =>
      contract
        ? previewFormats({
            outputs: contract.outputs,
            ratios: contract.template.ratios,
          })
        : [],
    [contract],
  );
  const fit = useLiveFit({
    brandId,
    environment: contract?.template.environment ?? null,
    templateKey: templateKey || null,
    formats: fitFormats,
    enabled: Boolean(contract) && !web,
  });
  const liveFit = useMemo(
    () =>
      new Map(
        fit.state === 'measured'
          ? rows.map((row) => {
              const media = effectiveMedia(rows, row.id);
              const sizeOf = (key: string) => {
                const dims = media[key];
                return dims?.w && dims.h ? { w: dims.w, h: dims.h } : null;
              };
              return [row.id, fit.fitOf(effectiveValues(rows, row.id), sizeOf)] as const;
            })
          : [],
      ),
    [fit, rows],
  );
  const fitLoading = fit.state === 'loading';
  // What the render confirmation found a row's own preflight refusing: kept while the row is what
  // was refused (refusalKey), so an edit retires it. Nothing else here asks the server anything.
  const [refusals, setRefusals] = useState<ReadonlyMap<string, { message: string; key: string }>>(
    () => new Map(),
  );
  const contractHash = contract?.template.contractHash ?? null;
  const statuses = useMemo(
    () =>
      new Map(
        rows.map((row) => {
          const refusal = refusals.get(row.id);
          return [
            row.id,
            rowStatusOf(
              clientErrors.get(row.id) ?? {},
              liveFit.get(row.id),
              refusal?.key === refusalKey(rows, row.id, templateRef, contractHash)
                ? refusal.message
                : undefined,
              calls.get(row.id),
            ),
          ] as const;
        }),
      ),
    [rows, clientErrors, liveFit, refusals, calls, templateRef, contractHash],
  );
  const statusOf = (id: string): RowStatus =>
    statuses.get(id) ?? { state: 'unchecked', findings: [] };
  const onRowsRefused = (found: ReadonlyArray<{ rowId: string; message: string }>) =>
    setRefusals((previous) => {
      const next = new Map(previous);
      for (const { rowId, message } of found)
        next.set(rowId, {
          message,
          key: refusalKey(latestRows.current, rowId, templateRef, contractHash),
        });
      return next;
    });
  const readiness = useMemo(() => {
    const findings = new Map<string, { message: string; rows: string[] }>();
    const counts = {
      blocked: 0,
      needsInput: 0,
      call: 0,
      review: 0,
      checking: 0,
      ready: 0,
    };
    const labelOf = (key: string | undefined) => {
      const label = variables?.find((variable) => variable.key === key)?.label;
      return label ? readableLayerName(label) : undefined;
    };
    const note = (key: string, message: string, row: string) => {
      const finding = findings.get(key) ?? { message, rows: [] };
      finding.rows.push(row);
      findings.set(key, finding);
    };
    for (const row of rows) {
      const status = statuses.get(row.id);
      const label = row.label || translateUi('untitled_f59ab8d1');
      if (status?.state === 'invalid') {
        const missing = missingInputs(variables ?? [], effectiveValues(rows, row.id));
        if (Object.keys(status.errors).every((key) => missing.includes(key)))
          counts.needsInput += 1;
        else counts.blocked += 1;
        for (const [key, message] of Object.entries(status.errors)) note(key, message, label);
      } else if (status?.state === 'refused') {
        counts.blocked += 1;
        note(`server:${status.reason}`, status.reason, label);
      } else if (status?.state === 'call') {
        // Renders once someone says so at Render: a question, not a block.
        counts.call += 1;
        for (const call of status.calls) note(call.override, call.message, label);
      } else if (status?.state === 'unchecked' && status.findings.length) {
        counts.review += 1;
        for (const item of status.findings)
          note(
            `${item.code}:${item.variableKey ?? ''}`,
            explainFinding(item, labelOf, translateUi),
            label,
          );
      } else if (status?.state === 'unchecked' && fitLoading) counts.checking += 1;
      else counts.ready += 1;
    }
    return { ...counts, findings: [...findings.entries()] };
  }, [rows, statuses, variables, fitLoading, translateUi]);
  const selectedIds = rows.filter((row) => rowSelection[row.id]).map((row) => row.id);
  // Where renders go: the brand's rooms and ad accounts, the open set's defaults, each row's own.
  const destinations = useDeliveryDestinations(brandId);
  const replaceFormats = useReplaceFormats(brandId, templateKey, contract);
  const setSettings = activeSet?.settings ?? FORGE_RENDER_SET_DEFAULT_SETTINGS;
  const slackName =
    typeof destinations.slack === 'object' && 'destinations' in destinations.slack
      ? (destinations.slack.destinations.find((room) => room.id === setSettings.slackDestinationId)
          ?.channelName ?? null)
      : null;
  const roomNames = useSetApprovalRooms(
    brandId,
    web ? null : setSettings.approvalDestinationIds,
  ).names;
  /** The choice belongs to the rows, so the saved set keeps it; a dry-run checked nothing of it. */
  const changeDelivery = (rowIds: string | string[], delivery: ApiRenderDeliveryTarget | null) => {
    const ids = new Set(typeof rowIds === 'string' ? [rowIds] : rowIds);
    record();
    setRows((current) =>
      current.map((row) => {
        if (!ids.has(row.id)) return row;
        const { delivery: _previous, ...rest } = row;
        return delivery ? { ...rest, delivery } : rest;
      }),
    );
  };
  // Each rendered row's newest job, polled until it settles — shown in its Status cell for as long
  // as the row still is what was rendered.
  const firedIds = Object.values(fired).map((item) => item.jobId);
  const { jobs: firedJobs, refreshJobs: refreshFired } = useApiRenderJobs({
    brandId: firedIds.length ? brandId : null,
    trackedIds: firedIds,
  });
  const firedKey = firedIds.join(',');
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new batch is a new read.
  useEffect(() => {
    // A failed read keeps the jobs the batch handed back; the hook's poll retries.
    if (firedKey) refreshFired({ preferCache: true }).catch(() => undefined);
  }, [firedKey]);
  const runs = useMemo(() => {
    const byId = new Map(firedJobs.map((job) => [job.id, job]));
    const next = new Map<string, ApiRenderJob>();
    for (const [rowId, item] of Object.entries(fired)) {
      const job =
        byId.get(item.jobId) ??
        queryClient.getQueryData<ApiRenderJob>(forgeQueryKeys.renderJob(brandId, item.jobId));
      if (job && preflightSnapshot(rows, rowId) === item.snapshot) next.set(rowId, job);
    }
    return next;
  }, [fired, firedJobs, rows, brandId, queryClient]);
  const hiddenColumns = columns.filter(
    (column) => columnVisibility[column.id ?? ''] === false,
  ).length;
  const meta: RequestGridMeta | undefined = contract
    ? {
        brandId,
        contract,
        rows,
        clientErrors,
        linkedFields,
        actions,
        selectedIds,
        hiddenColumns,
        generating: generating !== null,
        liveFit,
        statuses,
        fitLoading,
        calls,
        runs,
        destination: web
          ? undefined
          : {
              meta: destinations.meta,
              outputs: replaceFormats,
              setDefault: setSettings.metaTarget,
              onDeliveryChange: changeDelivery,
              onFormatChange: (rowId, outputId) =>
                // A replace swaps one file, so the row renders that one format — and says so.
                actions.updateRow(rowId, (current) => ({
                  ...current,
                  outputIds: [outputId],
                })),
            },
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
    ? {
        rows,
        selectedIds,
        contract,
        actions,
        hiddenColumns,
        generating: generating !== null,
        translate: translateUi,
      }
    : null;
  // Render opens the confirmation over the selected rows that can render, and lists the rest with
  // why: a wrong value, or a refusal no tick can override, leaves its row behind, never the batch.
  // A row whose layout is still being measured, and one that needs a person's call, both go: the
  // confirmation's one preflight is the server's answer.
  const selectedReady = selected.filter((row) => isRenderable(statusOf(row.id)));
  const skipped = selected.filter((row) => !isRenderable(statusOf(row.id)));
  /** Why a selected row stays behind, in the words its Status cell uses. */
  const skipReason = (row: RequestRow): string => {
    const status = statusOf(row.id);
    if (status.state === 'refused') return status.reason;
    const [key, message] =
      status.state === 'invalid' ? (Object.entries(status.errors)[0] ?? []) : [];
    return key && message
      ? `${variables?.find((variable) => variable.key === key)?.label ?? key}: ${message}`
      : 'Fix this row before rendering.';
  };
  // What Render will make, counted the way the render confirmation counts it.
  const files = {
    total: 0,
    byRatio: new Map<string, number>(),
    replacements: 0,
  };
  if (contract)
    for (const row of selectedReady) {
      const outputIds = effectiveOutputIds(rows, row.id);
      files.total += rowFileCount(contract, {
        outputIds,
        delivery: row.delivery,
      });
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
  const canRender = !updateRequired && !renderingProposed && selected.length <= MAX_BATCH_ROWS;
  const readyToFire = Boolean(userId) && (held !== null || (canRender && selectedReady.length > 0));
  const fireHint = !userId
    ? presentForge(SIGNED_OUT)
    : held
      ? presentForge(HELD_SET)
      : updateRequired
        ? translateUi('renderUpdateTemplateFirst')
        : renderingProposed
          ? translateUi('renderResolveProposedRows')
          : selected.length === 0
            ? translateUi('renderSelectRows')
            : selected.length > MAX_BATCH_ROWS
              ? translateUi('renderBatchLimit', { count: MAX_BATCH_ROWS })
              : selectedReady.length === 0
                ? skipReason(selected[0]!)
                : skipped.length
                  ? translateUi('renderSkippedRows', { count: skipped.length })
                  : null;

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
          ? translateUi('a_row_cannot_move_under_one_of_its__b7806762')
          : translateUi('forks_go_at_most_value0_levels_deep_295bb1aa', {
              value0: String(FORGE_RENDER_SET_MAX_DESCENDANT_DEPTH),
            }),
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

  // Saves the set, then opens the render confirmation on the exact selection. The save is part of
  // Render, so it is silent — and a set with no edits is already saved, so it writes no revision.
  const openConfirm = async () => {
    if (!contract || !readyToFire) return;
    // A held batch is what Render opens: read-only, nothing to save or sign.
    if (held) {
      setSubset(null);
      setConfirming(true);
      return;
    }
    setBusy('firing');
    try {
      const submittedSet =
        activeSet && signatureOf(rows, contract) === savedSignature
          ? activeSet
          : await saveRenderSet({ announce: false });
      if (!submittedSet) return;
      setSubset({
        rowIds: selectedReady.map((row) => row.id),
        skippedRows: skipped.map((row) => ({
          label: row.label.trim() || translateUi('untitled_f59ab8d1'),
          message: skipReason(row),
        })),
      });
      setConfirming(true);
    } finally {
      setBusy(null);
    }
  };

  /** A queued batch: each row shows its run in Status, and refused rows are one click from resend. */
  const onBatchFired = (firedRows: FiredRow[]) => {
    const current = latestRows.current;
    setFired((previous) => ({
      ...previous,
      ...Object.fromEntries(
        firedRows.map(({ rowId, job }) => [
          rowId,
          { jobId: job.id, snapshot: preflightSnapshot(current, rowId) },
        ]),
      ),
    }));
    setRowSelection({});
    if (contract)
      // The set's render count reads this; the fired jobs are its newest.
      void queryClient.invalidateQueries({
        queryKey: templateJobsKey(brandId, contract.template.key),
        exact: true,
      });
    // Failed with no task: the render API never took it (UTEC 09-29: a 503 on row 18 of 24).
    const unsent = firedRows.filter(({ job }) => job.status === 'failed' && !job.taskUid);
    if (unsent.length)
      toast.error(
        translateUi('value0_value1_not_sent_the_render_s_4268ceec', {
          count: Number(unsent.length),
          reason: String(unsent.length === 1 ? 'it' : 'them'),
        }),
        {
          action: {
            label: translateUi('resend_value0_cb674e64', {
              value0: String(unsent.length),
            }),
            onClick: () => {
              setRowSelection(Object.fromEntries(unsent.map(({ rowId }) => [rowId, true])));
              setSubset(null);
              setConfirming(true);
            },
          },
        },
      );
  };

  // The batch is rebuilt from the rows on screen every render, never kept from when the dialog
  // opened: each record pins the saved revision, and the dialog re-checks what changed. A row the
  // dialog finds its own preflight refusing leaves the batch for the skipped list.
  const batch = useMemo(() => {
    if (!confirming || !activeSet)
      return {
        rows: [],
        records: [] as ApiRenderBatchRecord[],
        calls: [] as Array<{ override: RenderOverride; message: string }>,
        skippedRows: [] as Array<{ label: string; message: string }>,
      };
    const picked = rows.filter((row) =>
      subset ? subset.rowIds.includes(row.id) : rowSelection[row.id],
    );
    const refused = picked.flatMap((row) => {
      const status = statuses.get(row.id);
      return status?.state === 'refused'
        ? [
            {
              label: row.label.trim() || translateUi('untitled_f59ab8d1'),
              message: status.reason,
            },
          ]
        : [];
    });
    const chosen = picked.filter((row) => statuses.get(row.id)?.state !== 'refused');
    return {
      skippedRows: [...(subset?.skippedRows ?? []), ...refused],
      rows: chosen.map((row) => ({
        rowId: row.id,
        label: row.label.trim() || translateUi('untitled_f59ab8d1'),
        labelPath: rowBreadcrumb(rows, row.id),
        outputIds: effectiveOutputIds(rows, row.id),
        ...(row.delivery ? { delivery: toPreflightDelivery(row.delivery) } : {}),
      })),
      records: chosen.map(
        (row): ApiRenderBatchRecord => ({
          label: row.label.trim() || translateUi('untitled_f59ab8d1'),
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
      calls: chosen.flatMap((row) => calls.get(row.id) ?? []),
    };
  }, [confirming, subset, activeSet, rows, rowSelection, calls, statuses, translateUi]);

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
      // The toolbar counts too: closing the AI button's bubble hands focus back to its trigger,
      // and ⌘Z right after an answer must take that answer back.
      const inGrid =
        !target ||
        target === document.body ||
        Boolean(box && (box.contains(target) || target.contains(box))) ||
        Boolean(target.closest('[data-render-toolbar]'));
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
  const ready = readiness.ready;
  // The pinned revision's own file when the set pins one, else the template's source.
  const settingsAssetId =
    pinnedRevisionLabel?.revision.sourceAssetId ?? contract?.template.sourceAssetId ?? null;
  const previewId = previewRowId ?? (selected.length === 1 ? selected[0]!.id : null);
  return (
    // Bounded by the tab: the toolbar and set tabs stay put, the rows take the rest.
    <div className="flex h-full min-h-0 flex-col gap-2">
      {publishedRevisions.length || activeSet?.templateRevision ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {activeSet?.templateRevision ? (
            <span>
              {pinnedRevisionLabel
                ? translateUi('value0_revision_value1_b3f8983b', {
                    value0: String(pinnedRevisionLabel.variant.name),
                    value1: String(pinnedRevisionLabel.revision.number),
                  })
                : translateUi('revision_value0_76f40621', {
                    value0: String(activeSet.templateRevision.revisionId.slice(0, 8)),
                  })}{' '}
              {translateUi('pinned_to_this_set_b23bb654')}{' '}
            </span>
          ) : null}
          <label className="flex items-center gap-2">
            {' '}
            {translateUi('variant_revision_e804ec1f')}{' '}
            <select
              aria-label={translateUi('published_template_revision_02172571')}
              className="h-8 max-w-64 rounded-md border bg-background px-2"
              value={pickedRevision}
              disabled={revisionChangeBusy || needsSave}
              onChange={(event) => setPickedRevision(event.target.value)}
            >
              <option value="">{translateUi('choose_a_published_revision_056a46ff')}</option>
              {publishedRevisions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <Button
            size="xs"
            variant="outline"
            disabled={!pickedRevision || revisionChangeBusy || needsSave}
            onClick={() => void changeRevision()}
          >
            {activeSet
              ? translateUi('change_set_template_revision_bfde4c62')
              : translateUi('load_template_revision_f9a32780')}
          </Button>
          {activeSet && otherVariantHeads.length ? (
            <Button
              size="xs"
              variant="outline"
              disabled={revisionChangeBusy || needsSave}
              title={translateUi('copies_this_set_s_rows_to_a_new_set_21862fc3')}
              onClick={() => void runOnVariants()}
            >
              {' '}
              {translateUi('run_on_f4b4b028')}{' '}
              {otherVariantHeads.length === 1
                ? translateUi('1_other_variant_da69703f')
                : translateUi('value0_other_variants_8de66a37', {
                    count: Number(otherVariantHeads.length),
                  })}
            </Button>
          ) : null}
        </div>
      ) : null}
      <RenderToolbar
        templates={templates}
        templateKey={templateKey}
        templatesLoading={busy === 'loading'}
        // The picker hands back the REF, not the key: two templates can share a key and only
        // the pair says which one was clicked.
        bindingId={bindingId}
        onOpenTemplateSettings={
          onOpenTemplate && settingsAssetId
            ? () => onOpenTemplate({ assetId: settingsAssetId, tab: 'layers' })
            : undefined
        }
        templateSourceKinds={templateSourceKinds}
        onTemplateHighlight={(template) => {
          const reads = templateLoadQueries(brandId, template.bindingId, template.key);
          void queryClient.prefetchQuery(reads.contract);
          void queryClient.prefetchQuery(reads.inputSets);
          void queryClient.prefetchQuery(reads.renderSets);
        }}
        onTemplateChange={(ref) => {
          const picked = templates.find((template) => templateRefOf(template) === ref);
          if (!picked || (picked.key === templateKey && picked.bindingId === bindingId)) return;
          // A revision belongs to the template it was picked from; never carry it to another.
          confirmDiscard(() => {
            setTemplateRevision(null);
            setTemplateRef(null);
            setSelection({
              templateKey: picked.key,
              bindingId: picked.bindingId,
            });
          });
        }}
        checkpoints={checkpoints}
        templateRef={templateRef}
        onTemplateRefChange={pinCheckpoint}
        ready={contract !== null}
        sourceVariants={revisionVariants ? [] : sourceRoot ? publishedVariants : undefined}
        variants={contract?.outputs}
        variant={variant}
        onVariantChange={(id) => {
          setEmptyVariant(id);
          editRows((current) =>
            current.map((row) => ({
              ...row,
              outputIds: id ? [id] : allOutputIdsOf(contract),
            })),
          );
        }}
        inputSets={inputSets}
        canAddRows={rows.length < MAX_BATCH_ROWS}
        onAddRow={addRow}
        onDraftWithAi={(dropped) => setAiDraft({ parent: null, dropped })}
        draftAnchorRef={draftAnchor}
        onAddFromInputs={(set) =>
          appendRows([{ ...seedRow([], set.name), values: { ...set.variables } }])
        }
        // Only this brand's own upload can be changed from here; a granted template cannot.
        layerSwitches={contract?.template.sourceAssetId ? layerSwitches : []}
        onAskSwitch={(variable) => void askSwitch(variable)}
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
              ? {
                  phase: 'failed',
                  reason: saveState.reason,
                  retrying: saveState.retry,
                  // The fix is on the template (publish, replace a file). The grid stays mounted
                  // behind the Templates tab, so the unsaved rows wait here untouched.
                  onRepair:
                    saveState.repair && onOpenTemplate && settingsAssetId
                      ? () =>
                          onOpenTemplate({
                            assetId: settingsAssetId,
                            tab: 'variants',
                          })
                      : undefined,
                  onRetry: () => void saveNow(),
                }
              : activeSet
                ? { phase: 'saved', at: activeSet.updatedAt }
                : null
        }
        selectedCount={selectedReady.length}
        files={{ ...files, byRatio: [...files.byRatio] }}
        readyToFire={readyToFire}
        fireHint={fireHint}
        busy={busy === 'saving' || busy === 'firing' ? busy : null}
        onRender={() => void openConfirm()}
        heldLabel={held ? 'Unconfirmed render — check' : undefined}
      />
      {contract && inputSetLoad.phase === 'error' ? (
        <Alert variant="destructive" className="shrink-0 py-2">
          <AlertTitle>{translateUi('input_sets_could_not_be_loaded_f18ba24b')}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {inputSetLoad.hasData
                ? translateUi('showing_the_last_loaded_input_sets_9a9cfe45')
                : translateUi('the_input_set_list_is_unknown_an_em_808f1832')}
            </span>
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={inputSetLoad.refreshing}
              onClick={() => void retryInputSets()}
            >
              {inputSetLoad.refreshing
                ? translateUi('retrying_a16c8b1c')
                : translateUi('retry_942087cc')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {contract && renderSetLoad.phase === 'error' ? (
        <Alert variant="destructive" className="shrink-0 py-2">
          <AlertTitle>{translateUi('saved_render_sets_could_not_be_load_d40b261f')}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {renderSetLoad.hasData
                ? translateUi('showing_the_last_loaded_sets_your_r_a1464d2f')
                : translateUi('saved_sets_are_unknown_your_rows_ar_c803bce5')}
            </span>
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={renderSetLoad.refreshing}
              onClick={() => void retryRenderSets()}
            >
              {renderSetLoad.refreshing
                ? translateUi('retrying_a16c8b1c')
                : translateUi('retry_942087cc')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {contract && renderSetLoad.phase === 'ready' && renderSetLoad.unassignedDraft ? (
        <Alert className="shrink-0 py-2">
          <AlertTitle>{translateUi('your_edited_rows_are_not_assigned_t_5ebc2f8d')}</AlertTitle>
          <AlertDescription>
            {' '}
            {translateUi('choose_an_existing_set_or_use_save__feab5ff6')}{' '}
          </AlertDescription>
        </Alert>
      ) : null}
      {problem ? <p className="text-xs text-destructive">{problem}</p> : null}
      {updateRequired && activeSet ? (
        <section
          aria-label={translateUi('older_template_631ab51f')}
          className="flex shrink-0 flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-xs"
        >
          <p className="min-w-0 flex-1">
            “{activeSet.name}
            {translateUi('was_saved_for_an_earlier_version_of_244f46b2')} {rebaseDrops.join(', ')}.
          </p>
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={busy === 'saving'}
            onClick={() => {
              const update = async () => {
                setBusy('saving');
                try {
                  await saveRenderSet();
                } finally {
                  setBusy(null);
                }
              };
              if (!askIfHeld(activeSet, () => void update())) void update();
            }}
          >
            {' '}
            {translateUi('update_set_d5491ff4')}{' '}
          </Button>
        </section>
      ) : null}

      {conflict ? (
        <section
          aria-label={translateUi('changed_elsewhere_719c3d46')}
          className="flex shrink-0 flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-xs"
        >
          <p className="min-w-0 flex-1">
            “{conflict.name}
            {translateUi('was_changed_elsewhere_on_some_of_th_446dfd1e')}{' '}
          </p>
          <Button type="button" size="xs" variant="outline" onClick={() => loadRenderSet(conflict)}>
            {' '}
            {translateUi('load_their_version_00c60e1b')}{' '}
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
            {' '}
            {translateUi('keep_mine_as_a_new_set_7da75732')}{' '}
          </Button>
        </section>
      ) : null}
      {generating || proposed.size ? (
        <section
          aria-label={translateUi('proposed_rows_68d27e44')}
          className="flex shrink-0 flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-xs"
        >
          {generating ? (
            <p className="flex min-w-0 flex-1 items-center gap-1.5">
              <Loader2 className="size-3 animate-spin" aria-hidden />{' '}
              {translateUi('drafting_1f91c1e4')} {generating.count}{' '}
              {generating.count === 1
                ? translateUi('variation_819b60bb')
                : translateUi('variations_925a391b')}{' '}
              {translateUi('of_28391d3b')} {generating.of}…
            </p>
          ) : (
            <p className="min-w-0 flex-1">
              {proposed.size} {translateUi('proposed_81e766d8')}{' '}
              {proposed.size === 1 ? translateUi('row_634768da') : translateUi('rows_bc51e9e6')}{' '}
              {translateUi('not_saved_until_you_keep_a6428997')}{' '}
              {proposed.size === 1 ? translateUi('it_2ad8a704') : translateUi('them_c9a8dc33')}.
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
            {' '}
            {translateUi('keep_all_9b80a741')}{' '}
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
            {' '}
            {translateUi('discard_all_5f30ee87')}{' '}
          </Button>
        </section>
      ) : null}
      {contract ? (
        <>
          <RenderSetTabs
            brandId={brandId}
            templateKey={contract.template.key}
            contractHash={contract.template.contractHash}
            sets={renderSets}
            activeSet={activeSet}
            activeRows={rows.length}
            dirty={dirty}
            confirmDiscard={confirmDiscard}
            canCreate={Boolean(bindingId)}
            draftAvailable={draftOffer !== null}
            delivery={
              activeSet ? (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  className="h-6 max-w-[60ch] truncate px-1.5 font-normal text-muted-foreground"
                  title={translateUi('where_this_set_s_renders_go_click_t_403a4eb3')}
                  onClick={() => setSettingsFor(activeSet)}
                >
                  <span className="truncate">
                    →{' '}
                    {web
                      ? translateUi('library_dc20b3d5')
                      : deliverySummary(setSettings, slackName, roomNames)}
                  </span>
                </Button>
              ) : null
            }
            onSwitch={loadRenderSet}
            onNew={async (name) => {
              const rowsToSave =
                renderSetLoad.initialFailed || renderSetLoad.unassignedDraft
                  ? latestRows.current
                  : seededRows(contract);
              const created = await createSet(name, rowsToSave, {
                revisionRef: templateRevision ?? undefined,
              });
              if (created) showRows(rowsToSave, rowsToSave, contract);
            }}
            onRename={(set, name) => updateSetDetails(set, { name })}
            onDescribe={(set, description) => updateSetDetails(set, { description })}
            onDelete={deleteSet}
            onDuplicate={(set) => void duplicateSet(set)}
            onHistory={setHistoryFor}
            onUpdate={() => {
              if (!askIfHeld(activeSet, () => void saveNow())) void saveNow();
            }}
            onSettings={setSettingsFor}
            onImportDraft={() => {
              if (!draftOffer) return;
              const importDraft = () => {
                activeSetRef.current = null;
                savedBase.current = [];
                setActiveSet(null);
                showRows(draftOffer, null, contract);
                setDraftOffer(null);
              };
              if (!askIfHeld(activeSet, importDraft)) importDraft();
            }}
          />
          <section
            aria-label={translateUi('selected_rows_2f1b6ecc')}
            hidden={selected.length === 0}
            className="flex shrink-0 flex-wrap items-center gap-1 rounded-md border bg-muted/30 px-2 py-1 text-xs"
          >
            <span className="mr-1 font-medium tabular-nums">
              {selected.length} {translateUi('selected_d7cbbb68')}
            </span>
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
            {web ? null : (
              <>
                <Popover open={sendingTo} onOpenChange={setSendingTo}>
                  <PopoverTrigger
                    render={
                      <Button type="button" size="xs" variant="ghost">
                        <Send data-icon="inline-start" /> {translateUi(
                          'send_to_ad_set_f720ee36',
                        )}{' '}
                      </Button>
                    }
                  />
                  <PopoverContent align="start" className="w-96 p-2">
                    <AdDrillDown
                      brandId={brandId}
                      adAccountId={
                        setSettings.metaTarget?.adAccountId ??
                        (destinations.meta !== 'loading' && destinations.meta !== 'unknown'
                          ? (destinations.meta.adAccountId ?? undefined)
                          : undefined)
                      }
                      createOnly
                      onCancel={() => setSendingTo(false)}
                      onPick={(target) => {
                        changeDelivery(selectedIds, target);
                        setSendingTo(false);
                      }}
                    />
                  </PopoverContent>
                </Popover>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={!selected.some((row) => row.delivery)}
                  title={
                    setSettings.metaTarget
                      ? translateUi('back_to_the_set_s_default_ad_set_eb330b50')
                      : translateUi('back_to_the_library_only_this_set_h_b59740bb')
                  }
                  onClick={() => changeDelivery(selectedIds, null)}
                >
                  <Undo2 data-icon="inline-start" /> {translateUi('use_set_default_0accd8c3')}{' '}
                </Button>
                <Popover>
                  <PopoverTrigger
                    render={
                      <Button type="button" size="xs" variant="ghost">
                        <ClipboardPaste data-icon="inline-start" />{' '}
                        {translateUi('ad_targets_b3645622')}{' '}
                      </Button>
                    }
                  />
                  <PopoverContent
                    align="start"
                    className="max-h-[70vh] w-[28rem] overflow-y-auto p-2"
                  >
                    <DeliveryTargetPicker
                      brandId={brandId}
                      meta={destinations.meta}
                      rows={selected.map((row) => ({
                        rowId: row.id,
                        label: row.label.trim() || translateUi('untitled_f59ab8d1'),
                        labelPath: rowBreadcrumb(rows, row.id),
                        outputIds: effectiveOutputIds(rows, row.id),
                        ...(row.delivery ? { delivery: toPreflightDelivery(row.delivery) } : {}),
                      }))}
                      outputs={replaceFormats}
                      fallback={setSettings.metaTarget ? 'Set default ad set' : 'Library only'}
                      onDeliveryChange={changeDelivery}
                      onFormatChange={(rowId, outputId) =>
                        actions.updateRow(rowId, (current) => ({
                          ...current,
                          outputIds: [outputId],
                        }))
                      }
                    />
                  </PopoverContent>
                </Popover>
              </>
            )}
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              className="ml-auto"
              aria-label={translateUi('clear_selection_cea4d2e0')}
              onClick={() => setRowSelection({})}
            >
              <X aria-hidden />
            </Button>
          </section>
          <ResizablePanelGroup
            orientation="horizontal"
            className="min-h-0 flex-1 items-stretch"
            defaultLayout={panelsLayout.defaultLayout}
            onLayoutChanged={panelsLayout.onLayoutChanged}
          >
            <ResizablePanel id="render-grid" defaultSize="72%" minSize="40%" className="min-w-0">
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
                        groupHeader={translateUi('requestGridGroupHeader', {
                          count: rows.length,
                          ready,
                          selected: selected.length,
                        })}
                        empty={translateUi('requestGridEmpty')}
                      />
                    </RowDropHintContext.Provider>
                  </SortableContext>
                </DndContext>
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel id="render-preview" defaultSize="28%" minSize="20%" className="min-w-0">
              <div className="flex h-full min-h-0 flex-col">
                <div className="min-h-0 flex-1">
                  <RenderPreviewPanel
                    brandId={brandId}
                    contract={contract}
                    rows={rows}
                    rowId={previewId}
                    renderSetId={activeSet?.id ?? null}
                    refusal={(() => {
                      const status = previewId ? statusOf(previewId) : null;
                      return status?.state === 'refused' ? status.reason : undefined;
                    })()}
                    onRowChange={setPreviewRowId}
                  />
                </div>
                {/* The previewed row's fields at the pane's full width: room for long copy. */}
                <section
                  aria-label={translateUi('fields_616f48c1')}
                  className="flex max-h-[40%] shrink-0 flex-col border-t border-border"
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-expanded={fieldsOpen}
                    className="h-8 shrink-0 justify-start gap-1.5 rounded-none px-[var(--card-pad)] text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-transparent hover:text-foreground"
                    onClick={() => {
                      setFieldsOpen(!fieldsOpen);
                      writeStored(FIELDS_OPEN_KEY, !fieldsOpen);
                    }}
                  >
                    {fieldsOpen ? (
                      <ChevronDown className="size-3" aria-hidden />
                    ) : (
                      <ChevronRight className="size-3" aria-hidden />
                    )}{' '}
                    {translateUi('fields_616f48c1')}{' '}
                    <span className="min-w-0 truncate font-normal normal-case tracking-normal">
                      {previewId
                        ? (rows.find((row) => row.id === previewId)?.label ?? '')
                        : translateUi('pick_a_row_f86f72db')}
                    </span>
                  </Button>
                  {fieldsOpen && previewId ? (
                    <div className="min-h-0 overflow-y-auto px-[var(--card-pad)] pb-2">
                      <RowFields table={table} rowId={previewId} />
                    </div>
                  ) : null}
                </section>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
          {/* One line under the grid: what is ready, and on request every reason a row is not. */}
          <details className="group shrink-0 rounded-md border text-xs">
            <summary
              aria-label={translateUi('readiness_d53d98c1')}
              className="flex h-8 cursor-pointer list-none items-center gap-2 px-[var(--card-pad)]"
            >
              <ChevronRight
                className="size-3 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
                aria-hidden
              />
              <span className="min-w-0 truncate font-medium">
                {readinessSummary(readiness, rows.length)}
              </span>
              {fit.state === 'unmeasured' && rows.length ? (
                <span className="min-w-0 truncate text-muted-foreground">
                  {' '}
                  {translateUi('layout_fit_isn_t_measured_for_this__74050533')}{' '}
                </span>
              ) : null}
              {fireHint && selected.length ? (
                <span className="min-w-0 truncate text-muted-foreground">· {fireHint}</span>
              ) : null}
            </summary>
            <div className="flex max-h-40 flex-col gap-1 overflow-y-auto px-[var(--card-pad)] pb-2 text-muted-foreground">
              {readiness.findings.length ? (
                <ul className="flex flex-col gap-0.5">
                  {readiness.findings.map(([key, finding]) => (
                    <li key={key}>
                      {contract.variables.find((variable) => variable.key === key)?.label ??
                        translateUi('check_9d60841e')}
                      : {finding.message} — {finding.rows.join(', ')}
                    </li>
                  ))}
                </ul>
              ) : null}
              <p>
                {' '}
                {translateUi('to_add_a_field_or_change_the_layout_7a9ca81a')}{' '}
                {contract.template.contractSource === 'template_forge'
                  ? ''
                  : translateUi('this_template_sets_no_text_limits_s_c6161378')}
              </p>
            </div>
          </details>
          <RenderRowsImport
            key={`${brandId}:${contract.template.key}:${contract.template.contractHash}`}
            brandId={brandId}
            contract={contract}
            existingRows={rows.length}
            open={importOpen}
            pasted={pasted}
            preloaded={preloadedSheet}
            onOpenChange={(open) => {
              setImportOpen(open);
              // Spent once reviewed: a remounted dialog must not replay an old paste or handover.
              if (!open) {
                setPasted(null);
                setPreloadedSheet(null);
              }
            }}
            onImport={importRows}
          />
        </>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          {' '}
          {translateUi('choose_a_template_to_set_up_renders_5491f196')}{' '}
        </div>
      )}
      {contract ? (
        <AiDraftDialog
          open={aiDraft !== null}
          onOpenChange={(open) => !open && setAiDraft(null)}
          brandId={brandId}
          bindingId={bindingId}
          contract={contract}
          renderSetId={activeSet?.id}
          parent={aiDraft?.parent ?? null}
          initialVaryKeys={aiDraft?.varyKeys ?? null}
          maxRows={MAX_BATCH_ROWS - rows.length}
          anchor={draftAnchor.current}
          dropped={aiDraft?.dropped ?? null}
          onDrafted={acceptDraft}
          gridContext={assistContext}
          onAssist={applyAssist}
          onUndo={undo}
          onSheet={(file) => {
            setAiDraft(null);
            setPreloadedSheet({ file });
            setImportOpen(true);
          }}
        />
      ) : null}
      {contract && activeSet ? (
        <RenderConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          brandId={brandId}
          bindingId={bindingId}
          templateRef={templateRef}
          contract={contract}
          rows={batch.rows}
          skippedRows={batch.skippedRows}
          records={batch.records}
          settings={setSettings}
          calls={batch.calls}
          meta={destinations.meta}
          slack={destinations.slack}
          outputs={replaceFormats}
          finalBlocked={finalBlocked}
          metaWritesAllowed={metaWritesAllowed}
          onDeliveryChange={changeDelivery}
          onChangeSettings={() => setSettingsFor(activeSet)}
          onFired={onBatchFired}
          onOpenLedger={onFired}
          onRowsRefused={onRowsRefused}
          holdScope={holdScope}
          held={held}
        />
      ) : null}
      <RenderSetSettingsDialog
        brandId={brandId}
        set={settingsFor}
        meta={destinations.meta}
        slack={destinations.slack}
        web={web}
        finalBlocked={finalBlocked}
        metaWritesAllowed={metaWritesAllowed}
        onOpenChange={(open) => !open && setSettingsFor(null)}
        onSave={(settings) =>
          settingsFor
            ? updateSetDetails(settingsFor, { settings }, { rethrow: true })
            : Promise.resolve()
        }
      />
      <SetHistoryDialog
        brandId={brandId}
        set={historyFor}
        contractHash={contract?.template.contractHash ?? ''}
        onRestore={(revision) => restoreRevision(revision)}
        onOpenChange={(open) => !open && setHistoryFor(null)}
      />
      <NameDialog
        open={nameRequest !== null}
        title={nameRequest?.title ?? ''}
        description={nameRequest?.description}
        initialName={nameRequest?.initialName ?? ''}
        confirmLabel={nameRequest?.confirmLabel ?? translateUi('save_1509f561')}
        onConfirm={(name) => nameRequest?.onConfirm(name)}
        onOpenChange={(open) => {
          if (open) return;
          nameRequest?.onCancel?.();
          setNameRequest(null);
        }}
      />
      <AlertDialog
        open={heldConfirm !== null}
        onOpenChange={(open) => !open && setHeldConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{translateUi('unconfirmed_render_c4a6f394')}</AlertDialogTitle>
            <AlertDialogDescription>
              {heldConfirmCopy(heldConfirm?.copy ?? false, translateUi)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{translateUi('cancel_19766ed6')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const action = heldConfirm;
                setHeldConfirm(null);
                action?.run();
              }}
            >
              {' '}
              {translateUi('continue_31fbef16')}{' '}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={pendingDiscard !== null}
        onOpenChange={(open) => !open && setPendingDiscard(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{translateUi('discard_unsaved_edits_b090da02')}</AlertDialogTitle>
            <AlertDialogDescription>
              {proposed.size
                ? translateUi('proposed_rows_are_saved_only_once_y_37ca2bd1')
                : activeSet
                  ? translateUi('changes_to_value0_could_not_be_save_56efbe7f', {
                      value0: String(activeSet.name),
                    })
                  : translateUi('these_rows_were_never_saved_to_a_re_e5ab9dd1')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{translateUi('keep_editing_e76fd2ad')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const action = pendingDiscard;
                setPendingDiscard(null);
                action?.();
              }}
            >
              {' '}
              {translateUi('discard_eb1a70e3')}{' '}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

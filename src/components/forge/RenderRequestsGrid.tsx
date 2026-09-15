'use client';

import {
  API_RENDER_MEDIA_LIST_MAX,
  type ApiRenderBatchRecord,
  type ApiRenderEnvironment,
  type ApiRenderInputSet,
  type ApiRenderInputValue,
  type ApiRenderTemplateContract,
  type ApiRenderTemplateSummary,
  type ApiRenderVariable,
  apiRenderPreflightResponseSchema,
  FORGE_RENDER_SET_MAX_DESCENDANT_DEPTH,
  type ForgeRenderSet,
  type MediaAsset,
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
import {
  type ColumnDef,
  type ExpandedState,
  getCoreRowModel,
  getExpandedRowModel,
  type RowSelectionState,
  useReactTable,
} from '@tanstack/react-table';
import { BookmarkPlus, Copy, GitFork, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DataGrid, KIND_ICONS, STICKY_LEFT, selectColumn } from '@/components/forge/DataGrid';
import {
  RenderPreflightDialog,
  type RenderPreflightRow,
} from '@/components/forge/RenderPreflightDialog';
import { RenderPreviewPanel } from '@/components/forge/RenderPreviewPanel';
import {
  downloadTemplateCsv,
  fetchLibraryAsset,
  RenderRowsImport,
} from '@/components/forge/RenderRowsImport';
import { NameDialog, RenderSetMenu } from '@/components/forge/RenderSetMenu';
import { RenderToolbar, templateLabel } from '@/components/forge/RenderToolbar';
import {
  descendantsOf,
  draftStorageKey,
  duplicateLabel,
  effectiveEncode,
  effectiveOutputIds,
  effectiveValues,
  forkLabel,
  fromRenderSetRows,
  MAX_BATCH_ROWS,
  moveRow,
  nestRows,
  newRowId,
  parseDelimited,
  type RequestRow,
  type RowDrop,
  rootRowId,
  rowBreadcrumb,
  rowDepth,
  rowMediaOf,
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
  SortableRequestRow,
  StatusCell,
  VariableCell,
  type VariableColumnMeta,
} from '@/components/forge/requestCells';
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

const PREFLIGHT_DEBOUNCE_MS = 600;
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
      label: row.label || (index === 0 ? 'Root' : `Render ${index + 1}`),
      check: { state: 'idle' },
    }));
  } catch {
    return null;
  }
}

function writeDrafts(key: string, rows: RequestRow[]) {
  try {
    if (rows.length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify({ rows } satisfies Persisted));
  } catch {
    // Quota or private mode: drafts just do not persist.
  }
}

const allOutputIdsOf = (contract: ApiRenderTemplateContract | null) =>
  contract?.outputs.map((output) => output.id) ?? [];

/** A fresh set: one root row carrying the designer's own values, in every format. */
const seededRows = (contract: ApiRenderTemplateContract): RequestRow[] => [
  { ...seedRow(contract.variables, 'Root'), outputIds: allOutputIdsOf(contract) },
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
          {variable.label}
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
    { id: 'label', size: 240, header: 'Name', cell: LabelCell, meta: STICKY_LEFT },
    ...(contract.outputs.length
      ? [{ id: 'outputs', size: 150, header: 'Formats', cell: FormatsCell }]
      : []),
    ...(contract.encode
      ? [{ id: 'encode', size: 160, header: 'Output settings', cell: EncodeCell }]
      : []),
    ...perVariable,
    { id: 'status', size: 110, header: 'Status', cell: StatusCell },
  ];
}

/** "4 of 6 rows ready to render · 1 needs fixing · 1 still checking" — no state word to decode. */
function readinessSummary(
  counts: { ready: number; blocked: number; review: number; checking: number },
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
    needs(counts.blocked, 'fixing'),
    needs(counts.review, 'a review'),
    counts.checking ? `${counts.checking} still checking` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Forks are named only when the delete takes rows nobody picked. */
function deleteMessage({ requested, all }: { requested: Set<string>; all: Set<string> }): string {
  if (all.size > requested.size)
    return `${all.size} rows will be deleted, including every fork under them.`;
  return all.size > 1
    ? `${all.size} rows will be deleted. Saved renders stay in Renders.`
    : 'This removes the row from the set. Saved renders stay in Renders.';
}

/** "Open this in Render": which template, and optionally which saved render set, to land on. */
export type ForgeRenderIntent = { templateKey: string; renderSetId?: string };

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
  /** Called with the new job ids once a batch is queued — the tab shell switches to the renders view. */
  onFired?: (jobIds: string[]) => void;
  /** Each new intent selects its template and loads its render set, over the newest-set default. */
  intent?: ForgeRenderIntent;
  /** The grid has taken `intent`; the shell drops it so a remount never replays it. */
  onIntentConsumed?: () => void;
}) {
  const [environments, setEnvironments] = useState<ApiRenderEnvironment[]>([]);
  const [bindingId, setBindingId] = useState<string | null>(null);
  // Templates wait for environment discovery to SETTLE, not to succeed: with no binding named
  // the server answers from the brand's default, so an empty or failed environment list must
  // not hide the templates behind it.
  const [envsSettled, setEnvsSettled] = useState(false);
  const [templates, setTemplates] = useState<ApiRenderTemplateSummary[]>([]);
  // Which template, and optionally which saved set, the rows come from. A new object is a new
  // load, so an intent for another set of the same template still reloads.
  const [selection, setSelection] = useState<ForgeRenderIntent>({ templateKey: '' });
  const { templateKey } = selection;
  const [contract, setContract] = useState<ApiRenderTemplateContract | null>(null);
  const [inputSets, setInputSets] = useState<ApiRenderInputSet[]>([]);
  const [renderSets, setRenderSets] = useState<ForgeRenderSet[]>([]);
  const [activeSet, setActiveSet] = useState<ForgeRenderSet | null>(null);
  const [draftOffer, setDraftOffer] = useState<RequestRow[] | null>(null);
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [savedSignature, setSavedSignature] = useState('');
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [expanded, setExpanded] = useState<ExpandedState>(true);
  const [previewRowId, setPreviewRowId] = useState<string | null>(null);
  const [busy, setBusy] = useState<'loading' | 'saving' | 'firing' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [deleteRequest, setDeleteRequest] = useState<{
    requested: Set<string>;
    all: Set<string>;
  } | null>(null);
  const [pendingDiscard, setPendingDiscard] = useState<(() => void) | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [pasted, setPasted] = useState<{ text: string } | null>(null);
  const [nameRequest, setNameRequest] = useState<NameRequest | null>(null);
  const [dropHint, setDropHint] = useState<RowDrop | null>(null);
  const [preflight, setPreflight] = useState<{
    rows: RenderPreflightRow[];
    records: ApiRenderBatchRecord[];
  } | null>(null);

  const latestRows = useRef(rows);
  latestRows.current = rows;

  // --- discovery ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    apiRendersApi
      .listEnvironments(brandId)
      .then((response) => {
        if (cancelled) return;
        setEnvironments(response.items);
        setBindingId(
          (current) =>
            current ??
            response.items.find((e) => e.isDefault)?.bindingId ??
            response.items[0]?.bindingId ??
            null,
        );
      })
      .catch((error: unknown) =>
        setProblem(describeRenderDiscoveryFailure(error instanceof Error ? error.message : '')),
      )
      .finally(() => {
        if (!cancelled) setEnvsSettled(true);
      });
    return () => {
      cancelled = true;
    };
  }, [brandId]);

  const multiEnv = environments.length > 1;
  // Bumped each time the tab comes back into view; re-lists templates without touching rows.
  const [templatesEpoch, setTemplatesEpoch] = useState(0);
  const wasActive = useRef(active);
  useEffect(() => {
    if (active && !wasActive.current) setTemplatesEpoch((epoch) => epoch + 1);
    wasActive.current = active;
  }, [active]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: templatesEpoch is the re-list trigger.
  useEffect(() => {
    if (!envsSettled) return;
    let cancelled = false;
    setBusy('loading');
    apiRendersApi
      .listTemplates(brandId, multiEnv ? bindingId : null)
      .then((response) => {
        if (cancelled) return;
        setTemplates(response.items);
        setProblem(null);
        // One template is not a decision.
        const only = response.items.length === 1 ? (response.items[0]?.key ?? '') : null;
        if (only !== null)
          setSelection((current) =>
            current.templateKey === only ? current : { templateKey: only },
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
  }, [brandId, bindingId, envsSettled, multiEnv, templatesEpoch]);

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
          ids.map(async (id) => [id, await fetchLibraryAsset(brandId, id)] as const),
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
    [brandId],
  );

  const showRows = useCallback(
    (next: RequestRow[], saved: RequestRow[] | null, forContract: ApiRenderTemplateContract) => {
      setRows(next);
      // A browser draft was never saved anywhere, so it starts out as unsaved edits.
      setSavedSignature(saved ? signatureOf(saved, forContract) : '');
      setRowSelection({});
      setPreviewRowId(null);
      setExpanded(true);
      void rehydrateMedia(next);
    },
    [rehydrateMedia],
  );

  // Only a binding the request actually names reloads the contract: a single environment settling
  // its id must not replace rows someone has started editing.
  const contractBindingId = multiEnv ? bindingId : null;
  useEffect(() => {
    if (!templateKey) {
      setContract(null);
      setRows([]);
      return;
    }
    let cancelled = false;
    Promise.all([
      apiRendersApi.getContract(brandId, templateKey, contractBindingId),
      apiRendersApi.listInputSets(brandId, templateKey).catch(() => ({ items: [] })),
      apiRendersApi.listRenderSets(brandId, templateKey).catch(() => ({ items: [] })),
    ])
      .then(([next, sets, savedSets]) => {
        if (cancelled) return;
        setContract(next);
        setInputSets(sets.items);
        setRenderSets(savedSets.items);
        const draft = readDrafts(draftStorageKey(brandId, templateKey));
        const saved =
          savedSets.items.find((set) => set.id === selection.renderSetId) ??
          savedSets.items[0] ??
          null;
        setActiveSet(saved);
        setDraftOffer(saved ? draft : null);
        if (saved) {
          const loaded = fromRenderSetRows(saved.rows);
          showRows(loaded, loaded, next);
        } else if (draft) showRows(draft, null, next);
        else {
          const seeded = seededRows(next);
          showRows(seeded, seeded, next);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        toast.error(describeRenderDiscoveryFailure(error instanceof Error ? error.message : ''));
      });
    return () => {
      cancelled = true;
    };
  }, [brandId, selection, templateKey, contractBindingId, showRows]);

  // --- row edits ---------------------------------------------------------------------------
  const updateRow = useCallback((id: string, patch: (row: RequestRow) => RequestRow) => {
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
  }, []);

  const setValue = useCallback(
    (id: string, key: string, value: ApiRenderInputValue | undefined) =>
      updateRow(id, (row) => {
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
        return { ...row, values, clearedKeys: row.parentId ? [...clearedKeys, key] : clearedKeys };
      }),
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
        blocked += 1;
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
    return { blocked, review, checking, ready, findings: [...findings.entries()] };
  }, [rows, clientErrors]);

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
            ...(multiEnv && bindingId ? { bindingId } : {}),
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
  }, [rows, contract, clientErrors, brandId, bindingId, multiEnv]);

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
    setRowSelection(Object.fromEntries(children.map((row) => [row.id, true])));
    setPreviewRowId(children[0]!.id);
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

  const deleteRows = () => {
    const gone = deleteRequest?.all;
    if (!gone) return;
    setRows((current) => current.filter((row) => !gone.has(row.id)));
    setRowSelection((current) =>
      Object.fromEntries(Object.entries(current).filter(([id]) => !gone.has(id))),
    );
    setPreviewRowId((current) => (current && gone.has(current) ? null : current));
    setDeleteRequest(null);
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
          toast.success(`Saved “${name}”`);
          setNameRequest(null);
        } catch (error) {
          toast.error(describeRenderDiscoveryFailure(error instanceof Error ? error.message : ''));
        }
      },
    });
  };

  const actions: RequestRowActions = {
    updateRow,
    setValue,
    clearValue,
    resetValue,
    pickMedia,
    clearMedia,
    fork,
    duplicate,
    remove: (ids) =>
      setDeleteRequest({ requested: new Set(ids), all: descendantsOf(latestRows.current, ids) }),
    saveAsInputs,
  };

  // --- render sets ------------------------------------------------------------------------
  const dirty = contract !== null && signatureOf(rows, contract) !== savedSignature;

  /** Everything that replaces the rows on screen comes through here, and asks first when dirty. */
  const confirmDiscard = (action: () => void) =>
    dirty ? setPendingDiscard(() => action) : action();

  // An intent is an event, taken once and handed back. Like every other way of replacing the rows
  // it asks before losing unsaved edits; one for what is already open changes nothing.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new intent is an event; the rest is read as it arrives.
  useEffect(() => {
    if (!intent) return;
    onIntentConsumed?.();
    const alreadyOpen =
      intent.templateKey === templateKey &&
      (!intent.renderSetId || intent.renderSetId === activeSet?.id);
    if (!alreadyOpen) confirmDiscard(() => setSelection({ ...intent }));
  }, [intent]);

  // --- drafts ------------------------------------------------------------------------------
  // The browser copy exists to recover edits nobody saved, so only unsaved edits are written.
  // Rows that match their set are not a draft: writing them would overwrite the draft still on
  // offer, and one reload later the edits it held are gone.
  useEffect(() => {
    if (!contract) return;
    const key = draftStorageKey(brandId, contract.template.key);
    if (dirty) writeDrafts(key, rows);
    else if (!draftOffer) writeDrafts(key, []);
  }, [brandId, contract, rows, dirty, draftOffer]);

  const reportSetError = async (error: unknown, set: ForgeRenderSet | null) => {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('render_set_revision_conflict') && set) {
      const fresh = await apiRendersApi.getRenderSet(brandId, set.id).catch(() => null);
      // Keep the stale revision attached to the local edits until an explicit reload.
      if (fresh) setRenderSets((sets) => sets.map((item) => (item.id === fresh.id ? fresh : item)));
      toast.error('This set changed elsewhere. Reload it before saving again.');
    } else toast.error(describeRenderDiscoveryFailure(message));
  };

  const adoptSet = (saved: ForgeRenderSet, savedRows: RequestRow[]) => {
    setActiveSet(saved);
    setRenderSets((current) => [saved, ...current.filter((set) => set.id !== saved.id)]);
    setSavedSignature(signatureOf(savedRows, contract));
    setDraftOffer(null);
  };

  const createSet = async (
    name: string,
    rowsToSave: RequestRow[],
    { announce = true } = {},
  ): Promise<ForgeRenderSet | null> => {
    if (!contract || !bindingId) return null;
    try {
      const created = await apiRendersApi.createRenderSet({
        brandId,
        bindingId,
        name,
        templateKey: contract.template.key,
        contractHash: contract.template.contractHash,
        rows: toRenderSetRows(rowsToSave, allOutputIdsOf(contract)),
      });
      adoptSet(created, rowsToSave);
      if (announce) toast.success(`Saved “${created.name}”`);
      return created;
    } catch (error) {
      await reportSetError(error, null);
      return null;
    }
  };

  /**
   * Saves the rows on screen; a set with no name yet asks for one first. `announce: false` is for
   * a save that is only a step of something else, which says so itself.
   */
  const saveRenderSet = async ({ announce = true } = {}): Promise<ForgeRenderSet | null> => {
    if (!contract || !bindingId || rows.length === 0) return null;
    const submitted = latestRows.current;
    if (!activeSet)
      return new Promise((resolve) =>
        setNameRequest({
          title: 'Name this render set',
          initialName: 'Untitled set',
          confirmLabel: 'Save',
          onConfirm: async (name) => {
            const created = await createSet(name, submitted, { announce });
            if (!created) return;
            setNameRequest(null);
            resolve(created);
          },
          onCancel: () => resolve(null),
        }),
      );
    try {
      const saved = await apiRendersApi.updateRenderSet(activeSet.id, {
        brandId,
        expectedRevision: activeSet.revision,
        rows: toRenderSetRows(submitted, allOutputIdsOf(contract)),
      });
      adoptSet(saved, submitted);
      if (announce) toast.success(`Saved “${saved.name}”`);
      return saved;
    } catch (error) {
      await reportSetError(error, activeSet);
      return null;
    }
  };

  const loadRenderSet = (set: ForgeRenderSet) => {
    if (!contract) return;
    setActiveSet(set);
    const loaded = fromRenderSetRows(set.rows);
    showRows(loaded, loaded, contract);
  };

  const setMenu = contract ? (
    <RenderSetMenu
      sets={renderSets}
      activeSet={activeSet}
      confirmDiscard={confirmDiscard}
      canCreate={Boolean(bindingId)}
      draftAvailable={draftOffer !== null}
      onSwitch={loadRenderSet}
      onNew={async (name) => {
        const seeded = seededRows(contract);
        const created = await createSet(name, seeded);
        if (created) showRows(seeded, seeded, contract);
      }}
      onRename={async (name) => {
        if (!activeSet) return;
        try {
          const renamed = await apiRendersApi.updateRenderSet(activeSet.id, {
            brandId,
            expectedRevision: activeSet.revision,
            name,
          });
          // Only the name moved: unsaved row edits stay on screen and stay unsaved.
          setActiveSet(renamed);
          setRenderSets((current) => current.map((set) => (set.id === renamed.id ? renamed : set)));
        } catch (error) {
          await reportSetError(error, activeSet);
        }
      }}
      onDelete={async () => {
        if (!activeSet) return;
        try {
          await apiRendersApi.deleteRenderSet(brandId, activeSet.id);
        } catch (error) {
          toast.error(describeRenderDiscoveryFailure(error instanceof Error ? error.message : ''));
          return;
        }
        const remaining = renderSets.filter((set) => set.id !== activeSet.id);
        setRenderSets(remaining);
        toast.success(`Deleted “${activeSet.name}”`);
        if (remaining[0]) loadRenderSet(remaining[0]);
        else {
          setActiveSet(null);
          const seeded = seededRows(contract);
          showRows(seeded, seeded, contract);
        }
      }}
      onImportDraft={() => {
        if (!draftOffer) return;
        setActiveSet(null);
        showRows(draftOffer, null, contract);
        setDraftOffer(null);
      }}
    />
  ) : null;

  // --- the table --------------------------------------------------------------------------
  const columns = useMemo(() => buildColumns(contract), [contract]);
  const nestedRows = useMemo(() => nestRows(rows), [rows]);
  const meta: RequestGridMeta | undefined = contract
    ? { brandId, contract, rows, clientErrors, actions }
    : undefined;
  const table = useReactTable({
    data: nestedRows,
    columns,
    meta,
    getRowId: (row) => row.id,
    getSubRows: (row) => row.subRows,
    state: { rowSelection, expanded },
    onRowSelectionChange: setRowSelection,
    onExpandedChange: setExpanded,
    enableRowSelection: true,
    enableSubRowSelection: false,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });

  const selected = rows.filter((row) => rowSelection[row.id]);
  const selectedIds = selected.map((row) => row.id);
  const canFork =
    selected.length > 0 &&
    rows.length < MAX_BATCH_ROWS &&
    selected.every((row) => rowDepth(rows, row.id) < FORGE_RENDER_SET_MAX_DESCENDANT_DEPTH);
  const readyToFire =
    selected.length > 0 &&
    selected.length <= MAX_BATCH_ROWS &&
    selected.every(
      (row) =>
        row.check.state === 'ready' && Object.keys(clientErrors.get(row.id) ?? {}).length === 0,
    );
  const fireHint =
    selected.length === 0
      ? 'Select the rows to render'
      : selected.length > MAX_BATCH_ROWS
        ? `At most ${MAX_BATCH_ROWS} renders per batch`
        : !readyToFire
          ? 'Every selected row has to be Ready'
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
          ? 'A row cannot move under one of its own forks. Nothing moved.'
          : `Forks go at most ${FORGE_RENDER_SET_MAX_DESCENDANT_DEPTH} levels deep. Nothing moved.`,
      );
      return;
    }
    if (moved.rows === latestRows.current) return;
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

  // Saves the set, then hands the exact selection to the pre-flight dialog, which fires it. The
  // save is part of Render, so it is silent — and a set with no edits is already saved, so
  // opening the dialog again neither writes a new revision nor says "Saved" twice.
  const fire = async () => {
    if (!contract || !readyToFire) return;
    setBusy('firing');
    try {
      const submittedSet =
        activeSet && !dirty ? activeSet : await saveRenderSet({ announce: false });
      if (!submittedSet) return;
      const current = latestRows.current;
      const chosen = current.filter((row) => rowSelection[row.id]);
      setPreflight({
        rows: chosen.map((row) => ({
          rowId: row.id,
          label: row.label.trim() || 'Untitled',
          labelPath: rowBreadcrumb(current, row.id),
          outputIds: effectiveOutputIds(current, row.id),
          ...(row.delivery ? { delivery: toPreflightDelivery(row.delivery) } : {}),
        })),
        records: chosen.map((row) => ({
          label: row.label.trim() || 'Untitled',
          renderSetId: submittedSet.id,
          renderSetRowId: row.id,
          expectedRenderSetRevision: submittedSet.revision,
          rootRowId: rootRowId(current, row.id),
          parentRowId: row.parentId ?? undefined,
          variables: effectiveValues(current, row.id),
          ...(effectiveOutputIds(current, row.id).length
            ? { outputIds: effectiveOutputIds(current, row.id) }
            : {}),
          ...(effectiveEncode(current, row.id) ? { encode: effectiveEncode(current, row.id) } : {}),
        })),
      });
    } finally {
      setBusy(null);
    }
  };

  // --- render -----------------------------------------------------------------------------
  const ready = rows.filter((row) => row.check.state === 'ready').length;
  const previewId = previewRowId ?? (selected.length === 1 ? selected[0]!.id : null);
  return (
    <div className="space-y-3">
      <RenderToolbar
        templates={templates}
        templateKey={templateKey}
        templatesLoading={busy === 'loading'}
        onTemplateChange={(key) =>
          key !== templateKey && confirmDiscard(() => setSelection({ templateKey: key }))
        }
        environments={environments}
        bindingId={bindingId}
        onBindingChange={(id) => id !== bindingId && confirmDiscard(() => setBindingId(id))}
        setMenu={setMenu}
        inputSets={inputSets}
        canAddRows={rows.length < MAX_BATCH_ROWS}
        canFork={canFork}
        canDuplicate={selected.length > 0 && rows.length + selected.length <= MAX_BATCH_ROWS}
        onAddRow={() =>
          contract &&
          appendRows([
            {
              ...seedRow(contract.variables, `Render ${rows.length + 1}`),
              outputIds: allOutputIdsOf(contract),
            },
          ])
        }
        onForkSelected={() => fork(selectedIds)}
        onDuplicateSelected={() => duplicate(selectedIds)}
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
        dirty={dirty}
        canSave={Boolean(bindingId) && rows.length > 0}
        onSave={async () => {
          setBusy('saving');
          try {
            await saveRenderSet();
          } finally {
            setBusy(null);
          }
        }}
        selectedCount={selected.length}
        readyToFire={readyToFire}
        fireHint={fireHint}
        busy={busy === 'saving' || busy === 'firing' ? busy : null}
        onRender={fire}
      />
      {problem ? <p className="text-xs text-destructive">{problem}</p> : null}

      {contract ? (
        <>
          <section
            aria-label="Selected rows"
            hidden={selected.length === 0}
            className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/30 px-2 py-1 text-xs"
          >
            <span className="mr-1 font-medium tabular-nums">{selected.length} selected</span>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={!canFork}
              title="Create child rows that inherit until overridden"
              onClick={() => fork(selectedIds)}
            >
              <GitFork data-icon="inline-start" /> Fork
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={rows.length + selected.length > MAX_BATCH_ROWS}
              onClick={() => duplicate(selectedIds)}
            >
              <Copy data-icon="inline-start" /> Duplicate
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={selected.length !== 1}
              title={selected.length === 1 ? undefined : 'Select one row to save its inputs'}
              onClick={() => selected[0] && saveAsInputs(selected[0].id)}
            >
              <BookmarkPlus data-icon="inline-start" /> Save as inputs
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="text-destructive"
              onClick={() => actions.remove(selectedIds)}
            >
              <Trash2 data-icon="inline-start" /> Delete
            </Button>
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
          <ResizablePanelGroup orientation="horizontal" className="min-h-96 items-stretch">
            <ResizablePanel defaultSize="68%" minSize="40%" className="min-w-0">
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
                      onPaste={onPaste}
                      onRowClick={(row) => setPreviewRowId(row.id)}
                      RowComponent={SortableRequestRow}
                      groupHeader={`${rows.length} request${rows.length === 1 ? '' : 's'} • ${ready} ready • ${selected.length} selected`}
                      empty="No rows. Add one, import a spreadsheet, or paste rows onto the grid."
                    />
                  </RowDropHintContext.Provider>
                </SortableContext>
              </DndContext>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize="32%" minSize="20%" className="min-w-0">
              <RenderPreviewPanel
                brandId={brandId}
                contract={contract}
                rows={rows}
                rowId={previewId}
                renderSetId={activeSet?.id ?? null}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
          <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs">
            <p className="font-medium">{readinessSummary(readiness, rows.length)}</p>
            {readiness.findings.length ? (
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {readiness.findings.map(([key, finding]) => (
                  <li key={key}>
                    {contract.variables.find((variable) => variable.key === key)?.label ?? 'Check'}:{' '}
                    {finding.message} — {finding.rows.join(', ')}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="mt-1 text-muted-foreground">
              To add a field or change the layout, ask a designer to update the template.
              {contract.template.contractSource === 'template_forge'
                ? ''
                : ' This template sets no text limits, so check long text in the preview.'}
              {fireHint && selected.length ? ` ${fireHint}.` : ''}
            </p>
          </div>
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
      {contract && preflight ? (
        <RenderPreflightDialog
          open
          brandId={brandId}
          bindingId={multiEnv ? bindingId : null}
          templateKey={contract.template.key}
          contractHash={contract.template.contractHash}
          contract={contract}
          rows={preflight.rows}
          records={preflight.records}
          onDeliveryChange={(rowId, delivery) => {
            setPreflight(
              (current) =>
                current && {
                  ...current,
                  rows: current.rows.map((row) =>
                    row.rowId === rowId ? { ...row, delivery: delivery ?? undefined } : row,
                  ),
                },
            );
            // The choice belongs to the row, so the next pre-flight and the saved set keep it. Not
            // `updateRow`: where a render goes changes nothing the dry-run checked.
            setRows((current) =>
              current.map((row) => {
                if (row.id !== rowId) return row;
                const { delivery: _previous, ...rest } = row;
                return delivery ? { ...rest, delivery } : rest;
              }),
            );
          }}
          onClose={() => setPreflight(null)}
          onFired={(jobIds) => {
            setPreflight(null);
            setRowSelection({});
            onFired?.(jobIds);
          }}
        />
      ) : null}
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
              {activeSet
                ? `Changes to “${activeSet.name}” since it was last saved will be lost.`
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
      <AlertDialog
        open={deleteRequest !== null}
        onOpenChange={(open) => !open && setDeleteRequest(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete rows?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteRequest ? deleteMessage(deleteRequest) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={deleteRows}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

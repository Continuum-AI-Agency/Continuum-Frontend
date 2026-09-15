'use client';

import {
  API_RENDER_MEDIA_LIST_MAX,
  API_RENDER_SUGGEST_ROWS_MAX,
  apiRenderPreflightResponseSchema,
  type ApiRenderBatchRecord,
  type ApiRenderEnvironment,
  type ApiRenderFitVerdict,
  type ApiRenderInputSet,
  type ApiRenderInputValue,
  type ApiRenderTemplateContract,
  type ApiRenderTemplateSummary,
  type ApiRenderVariable,
  checkAssetSwap,
  compactEncodeBlock,
  type ForgeRenderSet,
  type MediaAsset,
} from '@continuum/contracts';
import {
  type ColumnDef,
  type ExpandedState,
  getCoreRowModel,
  getExpandedRowModel,
  type RowSelectionState,
  useReactTable,
} from '@tanstack/react-table';
import {
  BookmarkPlus,
  ChevronDown,
  ChevronRight,
  Copy,
  FolderOpen,
  GitFork,
  ImageIcon,
  Library,
  Loader2,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DataGrid, KIND_ICONS, selectColumn } from '@/components/forge/DataGrid';
import { EncodeOverrideCell } from '@/components/forge/EncodeOverrideCell';
import {
  RenderPreflightDialog,
  type RenderPreflightRow,
} from '@/components/forge/RenderPreflightDialog';
import { RenderRowsImport } from '@/components/forge/RenderRowsImport';
import {
  descendantsOf,
  draftStorageKey,
  effectiveEncode,
  effectiveMedia,
  effectiveOutputIds,
  effectiveValues,
  MAX_BATCH_ROWS,
  nestRows,
  newRowId,
  parseClipboardRows,
  type RequestRow,
  rootRowId,
  rowBreadcrumb,
  rowDepth,
  seedRow,
  toVariableMap,
  validateRow,
} from '@/components/forge/renderRequestRows';
import { MediaSelectPopover } from '@/components/organic/primitives/MediaSelectPopover';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast-imperative';
import { ApiError } from '@/lib/api/errors';
import { cn } from '@/lib/utils';
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

const UNSET = '__unset__';
const PREFLIGHT_DEBOUNCE_MS = 600;

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

const isMedia = (variable: ApiRenderVariable) =>
  variable.kind === 'image' || variable.kind === 'video';

function fitTone(verdict: ApiRenderFitVerdict | null) {
  if (!verdict) return null;
  if (verdict.state === 'unknown')
    return { variant: 'muted' as const, text: '?', title: verdict.why };
  if (verdict.state === 'clipped') {
    const [l, t, r, b] = verdict.clippedPx ?? [0, 0, 0, 0];
    return { variant: 'warning' as const, text: 'Clips', title: `Clips ${l}/${t}/${r}/${b} px` };
  }
  return { variant: 'success' as const, text: 'Fits', title: verdict.why };
}

function MediaCell({
  variable,
  row,
  brandId,
  verdict,
  onPick,
  onClear,
}: {
  variable: ApiRenderVariable;
  row: RequestRow;
  brandId: string;
  verdict: ApiRenderFitVerdict | null;
  onPick: (assets: MediaAsset[]) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const pins = pickedPins(row.values[variable.key]);
  const thumb = row.media[variable.key]?.thumbnailUrl ?? null;
  const fit = fitTone(pins.length ? verdict : null);
  const Kind = variable.kind === 'video' ? Video : ImageIcon;
  return (
    <div className="flex items-center gap-1.5">
      <MediaSelectPopover
        brandProfileId={brandId}
        open={open}
        onOpenChange={setOpen}
        initialKind={variable.kind === 'video' ? 'video' : 'image'}
        maxSelectable={variable.multiple ? API_RENDER_MEDIA_LIST_MAX : 1}
        onAttachAssets={onPick}
        anchor={
          <button
            type="button"
            aria-label={`${pins.length ? 'Change' : 'Choose'} ${variable.label}`}
            className="flex h-7 min-w-24 items-center gap-1.5 rounded-md border border-border/70 px-1.5 text-2xs text-muted-foreground hover:bg-muted/50"
            onClick={() => setOpen(true)}
          >
            {thumb ? (
              <img src={thumb} alt="" className="size-5 rounded-sm object-cover" />
            ) : (
              <Kind className="size-3" aria-hidden />
            )}
            {pins.length ? (variable.multiple ? `${pins.length} picked` : 'Picked') : 'Choose'}
            {!pins.length ? <Library className="ml-auto size-3" aria-hidden /> : null}
          </button>
        }
      />
      {fit ? (
        <Badge variant={fit.variant} title={fit.title} className="px-1 py-0 text-2xs">
          {fit.text}
        </Badge>
      ) : null}
      {pins.length ? (
        <button
          type="button"
          aria-label={`Clear ${variable.label}`}
          className="rounded-md p-0.5 text-muted-foreground hover:bg-muted/50"
          onClick={onClear}
        >
          <X className="size-3" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

function StatusBadge({ row, invalid }: { row: RequestRow; invalid: boolean }) {
  if (invalid) return <Badge variant="destructive">Invalid</Badge>;
  switch (row.check.state) {
    case 'checking':
      return (
        <Badge variant="muted">
          <Loader2 className="size-3 animate-spin" aria-hidden /> Checking
        </Badge>
      );
    case 'error':
      return (
        <Badge variant="destructive" title={row.check.message}>
          Rejected
        </Badge>
      );
    case 'ready':
      if (row.check.guardrails?.some((finding) => finding.severity === 'block'))
        return <Badge variant="destructive">Blocked</Badge>;
      if (row.check.guardrails?.some((finding) => finding.severity === 'unknown'))
        return <Badge variant="warning">Needs review</Badge>;
      return row.check.fit?.escalate ? (
        <Badge variant="warning" title={row.check.fit.why}>
          Needs judge
        </Badge>
      ) : (
        <Badge variant="success">Ready</Badge>
      );
    default:
      return <Badge variant="muted">Draft</Badge>;
  }
}

function InheritanceAction({
  row,
  variable,
  onClear,
  onReset,
}: {
  row: RequestRow;
  variable: ApiRenderVariable;
  onClear: () => void;
  onReset: () => void;
}) {
  if (!row.parentId) return null;
  const changed = variable.key in row.values || row.clearedKeys.includes(variable.key);
  return changed ? (
    <button
      type="button"
      className="rounded-md p-0.5 text-muted-foreground hover:bg-muted/50"
      aria-label={`Reset ${variable.label} to inherited`}
      title="Reset to inherited"
      onClick={onReset}
    >
      <RotateCcw className="size-3" aria-hidden />
    </button>
  ) : (
    <button
      type="button"
      className="rounded-md p-0.5 text-muted-foreground hover:bg-muted/50"
      aria-label={`Clear inherited ${variable.label}`}
      title="Clear inherited value"
      onClick={onClear}
    >
      <X className="size-3" aria-hidden />
    </button>
  );
}

/** "Open this in Render": which template, and optionally which saved render set, to land on. */
export type ForgeRenderIntent = { templateKey: string; renderSetId?: string };

export function RenderRequestsGrid({
  brandId,
  onFired,
  intent,
}: {
  brandId: string;
  /** Called with the new job ids once a batch is queued — the tab shell switches to the renders view. */
  onFired?: (jobIds: string[]) => void;
  /** Each new intent selects its template and loads its render set, over the newest-set default. */
  intent?: ForgeRenderIntent;
}) {
  const [environments, setEnvironments] = useState<ApiRenderEnvironment[]>([]);
  const [bindingId, setBindingId] = useState<string | null>(null);
  // Templates wait for environment discovery to SETTLE, not to succeed: with no binding named
  // the server answers from the brand's default, so an empty or failed environment list must
  // not hide the templates behind it.
  const [envsSettled, setEnvsSettled] = useState(false);
  const [templates, setTemplates] = useState<ApiRenderTemplateSummary[]>([]);
  const [templateKey, setTemplateKey] = useState<string>('');
  const [contract, setContract] = useState<ApiRenderTemplateContract | null>(null);
  const [inputSets, setInputSets] = useState<ApiRenderInputSet[]>([]);
  const [renderSets, setRenderSets] = useState<ForgeRenderSet[]>([]);
  const [activeSet, setActiveSet] = useState<ForgeRenderSet | null>(null);
  const [draftOffer, setDraftOffer] = useState<RequestRow[] | null>(null);
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [expanded, setExpanded] = useState<ExpandedState>(true);
  const [busy, setBusy] = useState<'loading' | 'firing' | 'suggesting' | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [brief, setBrief] = useState('');
  const [briefCount, setBriefCount] = useState(5);
  const [problem, setProblem] = useState<string | null>(null);
  const [deleteIds, setDeleteIds] = useState<Set<string> | null>(null);
  const [preflight, setPreflight] = useState<{
    rows: RenderPreflightRow[];
    records: ApiRenderBatchRecord[];
  } | null>(null);

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
        if (response.items.length === 1) setTemplateKey(response.items[0]?.key ?? '');
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
  }, [brandId, bindingId, envsSettled, multiEnv]);

  useEffect(() => {
    if (intent) setTemplateKey(intent.templateKey);
  }, [intent]);

  useEffect(() => {
    if (!templateKey) {
      setContract(null);
      setRows([]);
      return;
    }
    let cancelled = false;
    Promise.all([
      apiRendersApi.getContract(brandId, templateKey, multiEnv ? bindingId : null),
      apiRendersApi.listInputSets(brandId, templateKey).catch(() => ({ items: [] })),
      apiRendersApi.listRenderSets(brandId, templateKey).catch(() => ({ items: [] })),
    ])
      .then(([next, sets, savedSets]) => {
        if (cancelled) return;
        setContract(next);
        setInputSets(sets.items);
        setRenderSets(savedSets.items);
        const draft = readDrafts(draftStorageKey(brandId, templateKey));
        const wantedSetId = intent?.templateKey === templateKey ? intent.renderSetId : undefined;
        const saved =
          savedSets.items.find((set) => set.id === wantedSetId) ?? savedSets.items[0] ?? null;
        setActiveSet(saved);
        setDraftOffer(saved ? draft : null);
        setRows(
          saved
            ? saved.rows.map((row) => ({
                id: row.id,
                parentId: row.parentId,
                label: row.label,
                values: { ...row.overrides },
                clearedKeys: [...row.clearedKeys],
                outputIds: [...row.outputIds],
                encode: row.encode,
                clearedEncodeKeys: row.clearedEncodeKeys,
                media: {},
                check: { state: 'idle' },
              }))
            : (draft ?? [
                {
                  ...seedRow(next.variables, 'Root'),
                  outputIds: next.outputs.map((output) => output.id),
                },
              ]),
        );
        setRowSelection({});
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        toast.error(describeRenderDiscoveryFailure(error instanceof Error ? error.message : ''));
      });
    return () => {
      cancelled = true;
    };
  }, [brandId, templateKey, bindingId, multiEnv, intent]);

  // --- drafts ------------------------------------------------------------------------------
  useEffect(() => {
    if (!contract) return;
    writeDrafts(draftStorageKey(brandId, contract.template.key), rows);
  }, [brandId, contract, rows]);

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
        if (value === undefined) delete values[key];
        else values[key] = value;
        return { ...row, values, clearedKeys };
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
        const first = assets[0];
        const media = { ...row.media };
        // No recorded size is not zero: dropping the entry makes the fit read `unknown`, which
        // is what sends the finished frame to the judge.
        media[variable.key] = {
          ...(first?.width && first.height ? { w: first.width, h: first.height } : {}),
          thumbnailUrl: first?.thumbnailUrl ?? first?.signedUrl ?? null,
        };
        return {
          ...row,
          values: { ...row.values, [variable.key]: variable.multiple ? pins : pins[0]! },
          clearedKeys: row.clearedKeys.filter((key) => key !== variable.key),
          media,
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
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const variables = contract?.variables ?? [];
  const clientErrors = useMemo(
    () =>
      new Map(
        rows.map((row) => {
          const errors = validateRow(variables, effectiveValues(rows, row.id));
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
    let incomplete = 0;
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
        incomplete += 1;
      else if (row.check.state === 'ready') ready += 1;
      else incomplete += 1;
    }
    return {
      state: blocked ? 'BLOCKED' : incomplete ? 'INCOMPLETE' : 'READY',
      blocked,
      incomplete,
      ready,
      findings: [...findings.entries()],
    };
  }, [rows, clientErrors]);

  useEffect(() => {
    if (!contract) return;
    const { key, contractHash } = contract.template;
    for (const row of rows) {
      if (row.check.state !== 'idle' || timers.current.has(row.id)) continue;
      if (Object.keys(clientErrors.get(row.id) ?? {}).length > 0) continue;
      const resolved = effectiveValues(rows, row.id);
      const encode = effectiveEncode(rows, row.id);
      const snapshot = JSON.stringify(resolved);
      const timer = setTimeout(async () => {
        timers.current.delete(row.id);
        setRows((current) =>
          current.map((r) =>
            r.id === row.id && JSON.stringify(effectiveValues(current, r.id)) === snapshot
              ? { ...r, check: { state: 'checking' } }
              : r,
          ),
        );
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
        // Stale guard: a row edited while its check was in flight keeps its newer `idle`.
        setRows((current) =>
          current.map((r) =>
            r.id === row.id &&
            JSON.stringify(effectiveValues(current, r.id)) === snapshot &&
            r.check.state === 'checking'
              ? { ...r, check }
              : r,
          ),
        );
      }, PREFLIGHT_DEBOUNCE_MS);
      timers.current.set(row.id, timer);
    }
  }, [rows, contract, clientErrors, brandId, bindingId, multiEnv]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  // --- columns ----------------------------------------------------------------------------
  const boxes = contract?.layout?.boxes ?? [];
  const outputs = contract?.outputs ?? [];
  const hasEncode = Boolean(contract?.encode);
  const columns = useMemo<ColumnDef<RequestRow>[]>(() => {
    const perVariable: ColumnDef<RequestRow>[] = variables.map((variable) => {
      const Icon = variable.reserved ? KIND_ICONS.reserved : KIND_ICONS[variable.kind];
      return {
        id: variable.key,
        header: () => (
          <span className="flex items-center gap-1">
            <Icon className="size-3" aria-hidden />
            {variable.label}
            {variable.required && !variable.reserved ? ' *' : ''}
          </span>
        ),
        cell: ({ row: { original: row } }) => {
          const error = clientErrors.get(row.id)?.[variable.key];
          const value = effectiveValues(rows, row.id)[variable.key];
          if (variable.reserved)
            return <span className="text-2xs text-muted-foreground">Continuum fills this</span>;
          if (isMedia(variable)) {
            const resolvedMedia = effectiveMedia(rows, row.id);
            const dims = resolvedMedia[variable.key];
            const verdict = checkAssetSwap({
              key: variable.key,
              placement: variable.placement,
              asset: dims?.w && dims.h ? { w: dims.w, h: dims.h } : null,
              neighbours: boxes.filter((box) => box.key !== variable.key),
            });
            return (
              <div title={error} className={cn(error && 'rounded-md ring-1 ring-destructive')}>
                <MediaCell
                  variable={variable}
                  row={{
                    ...row,
                    values: effectiveValues(rows, row.id),
                    media: resolvedMedia,
                  }}
                  brandId={brandId}
                  verdict={verdict}
                  onPick={(assets) => pickMedia(row.id, variable, assets)}
                  onClear={() =>
                    row.parentId
                      ? clearValue(row.id, variable.key)
                      : clearMedia(row.id, variable.key)
                  }
                />
                <InheritanceAction
                  row={row}
                  variable={variable}
                  onClear={() => clearValue(row.id, variable.key)}
                  onReset={() => resetValue(row.id, variable.key)}
                />
              </div>
            );
          }
          if (variable.kind === 'boolean')
            return (
              <div className="flex items-center gap-1">
                <Switch
                  size="sm"
                  aria-label={variable.label}
                  checked={value === true}
                  onCheckedChange={(next) => setValue(row.id, variable.key, next)}
                />
                <InheritanceAction
                  row={row}
                  variable={variable}
                  onClear={() => clearValue(row.id, variable.key)}
                  onReset={() => resetValue(row.id, variable.key)}
                />
              </div>
            );
          if (variable.kind === 'enum' && variable.options.length > 0)
            return (
              <div className="flex items-center gap-1">
                <Select
                  value={String(value ?? '')}
                  onValueChange={(next) =>
                    setValue(row.id, variable.key, next === UNSET ? undefined : next)
                  }
                >
                  <SelectTrigger
                    className={cn('h-7 min-w-28 text-xs', error && 'border-destructive')}
                    aria-label={variable.label}
                    title={error}
                  >
                    <SelectValue placeholder={variable.required ? 'Choose…' : 'Not set…'} />
                  </SelectTrigger>
                  <SelectContent>
                    {variable.required ? null : <SelectItem value={UNSET}>Not set…</SelectItem>}
                    {variable.options.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <InheritanceAction
                  row={row}
                  variable={variable}
                  onClear={() => clearValue(row.id, variable.key)}
                  onReset={() => resetValue(row.id, variable.key)}
                />
              </div>
            );
          const used = typeof value === 'string' ? value.length : 0;
          const over = variable.charBudget !== null && used > variable.charBudget;
          return (
            <div className="flex min-w-36 items-center gap-1.5">
              <Input
                className={cn('h-7 text-xs', error && 'border-destructive')}
                type={variable.kind === 'number' ? 'number' : 'text'}
                aria-label={variable.label}
                title={error}
                placeholder={variable.sample ?? undefined}
                value={value === undefined ? '' : String(value)}
                onChange={(event) => {
                  const raw = event.target.value;
                  setValue(
                    row.id,
                    variable.key,
                    raw === '' ? undefined : variable.kind === 'number' ? Number(raw) : raw,
                  );
                }}
              />
              {variable.charBudget !== null ? (
                <span
                  className={cn(
                    'shrink-0 tabular-nums text-2xs text-muted-foreground',
                    over && 'text-warning',
                  )}
                  title={`${used} of ${variable.charBudget} characters the design has room for${over ? ' — the type shrinks to fit, or overflows' : ''}`}
                >
                  {used}/{variable.charBudget}
                </span>
              ) : null}
              <InheritanceAction
                row={row}
                variable={variable}
                onClear={() => clearValue(row.id, variable.key)}
                onReset={() => resetValue(row.id, variable.key)}
              />
            </div>
          );
        },
      };
    });
    return [
      selectColumn<RequestRow>(),
      {
        id: 'label',
        size: 220,
        header: 'Label',
        cell: ({ row: tableRow }) => {
          const row = tableRow.original;
          const breadcrumb = rowBreadcrumb(rows, row.id).slice(0, -1).join(' / ');
          return (
            <div className="flex min-w-48 items-center gap-1 pl-[calc(var(--depth)*0.75rem)] [--depth:0]">
              {tableRow.getCanExpand() ? (
                <button
                  type="button"
                  className="rounded-md p-0.5 text-muted-foreground hover:bg-muted/50"
                  aria-label={`${tableRow.getIsExpanded() ? 'Collapse' : 'Expand'} ${row.label}`}
                  onClick={tableRow.getToggleExpandedHandler()}
                >
                  {tableRow.getIsExpanded() ? (
                    <ChevronDown className="size-3" aria-hidden />
                  ) : (
                    <ChevronRight className="size-3" aria-hidden />
                  )}
                </button>
              ) : (
                <span className="size-4" />
              )}
              <div className="min-w-0 flex-1" style={{ paddingLeft: tableRow.depth * 8 }}>
                {breadcrumb ? (
                  <p className="truncate text-3xs text-muted-foreground" title={breadcrumb}>
                    {breadcrumb}
                  </p>
                ) : null}
                <Input
                  className="h-7 text-xs"
                  aria-label={`Label ${row.label}`}
                  placeholder={`Render ${rows.indexOf(row) + 1}`}
                  value={row.label}
                  onChange={(event) =>
                    updateRow(row.id, (current) => ({ ...current, label: event.target.value }))
                  }
                />
              </div>
            </div>
          );
        },
      },
      ...(outputs.length
        ? [
            {
              id: 'outputs',
              size: 150,
              header: 'Formats',
              cell: ({ row: { original: row } }) => {
                const inherited = effectiveOutputIds(rows, row.id);
                const selectedIds = inherited.length
                  ? inherited
                  : outputs.map((output) => output.id);
                return (
                  <div className="flex items-center gap-1">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button type="button" size="xs" variant="outline">
                            {selectedIds.length === outputs.length
                              ? 'All formats'
                              : `${selectedIds.length} format${selectedIds.length === 1 ? '' : 's'}`}
                          </Button>
                        }
                      />
                      <DropdownMenuContent>
                        {outputs.map((output) => (
                          <DropdownMenuCheckboxItem
                            key={output.id}
                            checked={selectedIds.includes(output.id)}
                            disabled={selectedIds.length === 1 && selectedIds.includes(output.id)}
                            onCheckedChange={(checked) =>
                              updateRow(row.id, (current) => ({
                                ...current,
                                outputIds: checked
                                  ? [...selectedIds, output.id]
                                  : selectedIds.filter((id) => id !== output.id),
                              }))
                            }
                          >
                            {output.label}
                            {output.ratio ? ` · ${output.ratio}` : ''}
                          </DropdownMenuCheckboxItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {row.parentId && row.outputIds.length ? (
                      <button
                        type="button"
                        className="rounded-md p-0.5 text-muted-foreground hover:bg-muted/50"
                        aria-label="Reset formats to inherited"
                        onClick={() =>
                          updateRow(row.id, (current) => ({ ...current, outputIds: [] }))
                        }
                      >
                        <RotateCcw className="size-3" aria-hidden />
                      </button>
                    ) : null}
                  </div>
                );
              },
            } satisfies ColumnDef<RequestRow>,
          ]
        : []),
      ...(hasEncode
        ? [
            {
              id: 'encode',
              size: 160,
              header: 'Output settings',
              cell: ({ row: { original: row } }) => (
                <EncodeOverrideCell
                  row={row}
                  rows={rows}
                  outputs={outputs}
                  onChange={(patch) => updateRow(row.id, (current) => ({ ...current, ...patch }))}
                />
              ),
            } satisfies ColumnDef<RequestRow>,
          ]
        : []),
      ...perVariable,
      {
        id: 'status',
        size: 110,
        header: 'Status',
        cell: ({ row: { original: row } }) => (
          <StatusBadge row={row} invalid={Object.keys(clientErrors.get(row.id) ?? {}).length > 0} />
        ),
      },
    ];
  }, [
    variables,
    outputs,
    hasEncode,
    boxes,
    brandId,
    clientErrors,
    rows,
    pickMedia,
    clearMedia,
    clearValue,
    resetValue,
    setValue,
    updateRow,
  ]);

  const nestedRows = useMemo(() => nestRows(rows), [rows]);
  const table = useReactTable({
    data: nestedRows,
    columns,
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

  // --- row operations ---------------------------------------------------------------------
  const latestRows = useRef(rows);
  latestRows.current = rows;
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
  const addRow = () =>
    appendRows([{ ...seedRow(variables, 'Root'), outputIds: outputs.map((output) => output.id) }]);
  const forkSelected = () => {
    const parents = selected.filter((row) => rowDepth(rows, row.id) < 3);
    if (parents.length !== selected.length) {
      toast.error('Fork depth is limited to three levels. Nothing was added.');
      return;
    }
    const children = parents.map((row) => seedRow([], `${row.label} fork`, row.id));
    if (children.length === 0) return;
    if (!appendRows(children)) return;
    setExpanded(true);
    setRowSelection(Object.fromEntries(children.map((row) => [row.id, true])));
  };
  const duplicateSelected = () =>
    appendRows(
      selected.map((row) => ({
        ...structuredClone(row),
        id: newRowId(),
        check: { state: 'idle' },
      })),
    );
  const deleteSelected = () => {
    setRows((current) => current.filter((row) => !deleteIds?.has(row.id)));
    setRowSelection({});
    setDeleteIds(null);
  };
  const loadInputSet = (set: ApiRenderInputSet) =>
    appendRows([{ ...seedRow([], set.name), values: { ...set.variables } }]);
  const saveAsInputSet = async () => {
    const row = selected[0];
    if (!contract || !row || selected.length !== 1) return;
    // ponytail: window.prompt; a Popover if anyone objects.
    const name = window.prompt('Name this input set', row.label || undefined)?.trim();
    if (!name) return;
    try {
      const created = await apiRendersApi.createInputSet({
        brandId,
        templateKey: contract.template.key,
        contractHash: contract.template.contractHash,
        name,
        variables: toVariableMap(row),
      });
      setInputSets((current) => [created, ...current]);
      toast.success(`Saved “${name}”`);
    } catch (error) {
      toast.error(describeRenderDiscoveryFailure(error instanceof Error ? error.message : ''));
    }
  };

  const loadRenderSet = (set: ForgeRenderSet) => {
    setActiveSet(set);
    setRows(
      set.rows.map((row) => ({
        id: row.id,
        parentId: row.parentId,
        label: row.label,
        values: { ...row.overrides },
        clearedKeys: [...row.clearedKeys],
        outputIds: [...row.outputIds],
        encode: row.encode,
        clearedEncodeKeys: row.clearedEncodeKeys,
        media: {},
        check: { state: 'idle' },
      })),
    );
    setRowSelection({});
    setExpanded(true);
  };

  const saveRenderSet = async (): Promise<ForgeRenderSet | null> => {
    if (!contract || !bindingId || rows.length === 0) return null;
    const wireRows = rows.map((row) => ({
      id: row.id,
      parentId: row.parentId,
      label: row.label.trim() || 'Untitled',
      overrides: toVariableMap(row),
      clearedKeys: row.clearedKeys,
      outputIds:
        row.parentId === null && row.outputIds.length === 0
          ? contract.outputs.map((output) => output.id)
          : row.outputIds,
      ...(compactEncodeBlock(row.encode) ? { encode: compactEncodeBlock(row.encode) } : {}),
      ...(row.clearedEncodeKeys ? { clearedEncodeKeys: row.clearedEncodeKeys } : {}),
    }));
    try {
      const saved = activeSet
        ? await apiRendersApi.updateRenderSet(activeSet.id, {
            brandId,
            expectedRevision: activeSet.revision,
            rows: wireRows,
          })
        : await (async () => {
            const name = window.prompt('Name this render set', 'Untitled set')?.trim();
            if (!name) return null;
            return apiRendersApi.createRenderSet({
              brandId,
              bindingId,
              name,
              templateKey: contract.template.key,
              contractHash: contract.template.contractHash,
              rows: wireRows,
            });
          })();
      if (!saved) return null;
      setActiveSet(saved);
      setRenderSets((current) => [saved, ...current.filter((set) => set.id !== saved.id)]);
      setDraftOffer(null);
      toast.success(`Saved “${saved.name}”`);
      return saved;
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('render_set_revision_conflict') && activeSet) {
        const fresh = await apiRendersApi.getRenderSet(brandId, activeSet.id).catch(() => null);
        // Keep the stale revision attached to the local edits until an explicit reload.
        if (fresh) setRenderSets((sets) => sets.map((set) => (set.id === fresh.id ? fresh : set)));
        toast.error('This set changed elsewhere. Reload it before saving again.');
      } else toast.error(describeRenderDiscoveryFailure(message));
      return null;
    }
  };

  // The agentic half of "data set-up": a brief becomes rows. Proposals only — every row lands
  // as a Draft and goes through the same checks as a typed one before it can be rendered.
  const suggest = async () => {
    if (!contract || !brief.trim()) return;
    setBusy('suggesting');
    try {
      const response = await apiRendersApi.suggestRows({
        brandId,
        ...(multiEnv && bindingId ? { bindingId } : {}),
        templateKey: contract.template.key,
        contractHash: contract.template.contractHash,
        prompt: brief.trim(),
        count: briefCount,
        // The selected row, if exactly one, is the seed: "like this one, but…".
        ...(selected.length === 1 ? { seed: toVariableMap(selected[0]!) } : {}),
      });
      if (response.rows.length === 0) {
        toast.error('Nothing usable came back. Try a more specific brief.');
        return;
      }
      if (
        !appendRows(
          response.rows.map((row) => ({
            ...seedRow([], row.label),
            values: { ...row.variables },
          })),
        )
      )
        return;
      setSuggestOpen(false);
      toast.success(
        `${response.rows.length} row${response.rows.length === 1 ? '' : 's'} drafted${
          response.dropped.length
            ? ` — ${response.dropped.length} value${response.dropped.length === 1 ? '' : 's'} dropped as off-contract`
            : ''
        }`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      toast.error(
        message.includes('suggest_unavailable')
          ? 'The writer is unavailable right now. Add rows by hand or paste them.'
          : describeRenderDiscoveryFailure(message),
      );
    } finally {
      setBusy(null);
    }
  };

  const onPaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    // A paste INTO a cell is that cell's; only a paste onto the grid body is rows.
    if ((event.target as HTMLElement).closest('input, textarea, [contenteditable]')) return;
    const text = event.clipboardData.getData('text');
    const { rows: pasted, unmatched } = parseClipboardRows(text, variables);
    if (pasted.length === 0) return;
    event.preventDefault();
    if (!appendRows(pasted)) return;
    toast.success(
      `${pasted.length} row${pasted.length === 1 ? '' : 's'} pasted${
        unmatched.length
          ? ` — ignored column${unmatched.length === 1 ? '' : 's'}: ${unmatched.join(', ')}`
          : ''
      }`,
    );
  };

  // Saves the set, then hands the exact selection to the pre-flight dialog, which fires it.
  const fire = async () => {
    if (!contract || !readyToFire) return;
    setBusy('firing');
    try {
      const submittedSet = await saveRenderSet();
      if (!submittedSet) return;
      setPreflight({
        rows: selected.map((row) => ({
          rowId: row.id,
          label: row.label.trim() || 'Untitled',
          labelPath: rowBreadcrumb(rows, row.id),
          outputIds: effectiveOutputIds(rows, row.id),
        })),
        records: selected.map((row) => ({
          label: row.label.trim() || 'Untitled',
          renderSetId: submittedSet.id,
          renderSetRowId: row.id,
          expectedRenderSetRevision: submittedSet.revision,
          rootRowId: rootRowId(rows, row.id),
          parentRowId: row.parentId ?? undefined,
          variables: effectiveValues(rows, row.id),
          ...(effectiveOutputIds(rows, row.id).length
            ? { outputIds: effectiveOutputIds(rows, row.id) }
            : {}),
          ...(effectiveEncode(rows, row.id) ? { encode: effectiveEncode(rows, row.id) } : {}),
        })),
      });
    } finally {
      setBusy(null);
    }
  };

  // --- render -----------------------------------------------------------------------------
  const ready = rows.filter((row) => row.check.state === 'ready').length;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {multiEnv ? (
          <Select value={bindingId ?? ''} onValueChange={(next) => setBindingId(next)}>
            <SelectTrigger className="h-8 w-44 text-xs" aria-label="Render workspace">
              <SelectValue placeholder="Workspace">
                {environments.find((item) => item.bindingId === bindingId)?.workspace}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {environments.map((env) => (
                <SelectItem key={env.bindingId} value={env.bindingId}>
                  {env.workspace}
                  {env.isDefault ? ' (default)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <Select
          value={templateKey}
          onValueChange={setTemplateKey}
          disabled={templates.length === 0}
        >
          <SelectTrigger className="h-8 w-64 text-xs" aria-label="Template">
            <SelectValue
              placeholder={
                busy === 'loading'
                  ? 'Loading templates…'
                  : templates.length
                    ? 'Choose a template'
                    : 'No renderable templates yet'
              }
            >
              {templates.find((item) => item.key === templateKey)?.name}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {templates.map((template) => (
              <SelectItem key={template.key} value={template.key}>
                {template.name}
                {template.ratios.length ? ` · ${template.ratios.join(' ')}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {problem ? <p className="text-xs text-destructive">{problem}</p> : null}

        {contract ? (
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <RenderRowsImport
              key={`${brandId}:${contract.template.key}:${contract.template.contractHash}`}
              brandId={brandId}
              variables={variables}
              existingRows={rows.length}
              onImport={(imported) =>
                appendRows(
                  imported.map((row) => ({
                    ...row,
                    outputIds: outputs.map((output) => output.id),
                  })),
                )
              }
            />
            {renderSets.length ? (
              <Select
                value={activeSet?.id ?? UNSET}
                onValueChange={(id) => {
                  if (id === UNSET) {
                    setActiveSet(null);
                    setRows([
                      {
                        ...seedRow(variables, 'Root'),
                        outputIds: outputs.map((output) => output.id),
                      },
                    ]);
                    return;
                  }
                  const set = renderSets.find((item) => item.id === id);
                  if (set) loadRenderSet(set);
                }}
              >
                <SelectTrigger className="h-7 w-44 text-xs" aria-label="Render set">
                  <SelectValue placeholder="Render set">{activeSet?.name ?? 'New set'}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value={UNSET}>New set</SelectItem>
                    {renderSets.map((set) => (
                      <SelectItem key={set.id} value={set.id}>
                        {set.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            ) : null}
            {draftOffer ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setActiveSet(null);
                  setRows(draftOffer);
                  setDraftOffer(null);
                }}
              >
                Import browser draft
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!bindingId || rows.length === 0}
              onClick={saveRenderSet}
            >
              <BookmarkPlus data-icon="inline-start" />
              {activeSet ? `Save ${activeSet.name}` : 'Save render set'}
            </Button>
            <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={addRow}>
              <Plus className="size-3.5" aria-hidden /> Row
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={
                selected.length === 0 ||
                rows.length >= MAX_BATCH_ROWS ||
                selected.every((row) => rowDepth(rows, row.id) >= 3)
              }
              title="Create child rows that inherit until overridden"
              onClick={forkSelected}
            >
              <GitFork data-icon="inline-start" /> Fork
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={selected.length === 0 || rows.length >= MAX_BATCH_ROWS}
              onClick={duplicateSelected}
            >
              <Copy data-icon="inline-start" /> Duplicate
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={selected.length === 0}
              onClick={() =>
                setDeleteIds(
                  descendantsOf(
                    rows,
                    selected.map((row) => row.id),
                  ),
                )
              }
            >
              <Trash2 data-icon="inline-start" /> Delete
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={inputSets.length === 0}
                  >
                    <FolderOpen className="size-3.5" aria-hidden /> Load set
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                {inputSets.map((set) => (
                  <DropdownMenuItem key={set.id} onClick={() => loadInputSet(set)}>
                    {set.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={selected.length !== 1}
              title="Save the selected row as a named input set"
              onClick={saveAsInputSet}
            >
              <BookmarkPlus className="size-3.5" aria-hidden /> Save set
            </Button>
            <Popover open={suggestOpen} onOpenChange={setSuggestOpen}>
              <PopoverTrigger
                render={
                  <Button type="button" size="sm" variant="outline" className="gap-1.5">
                    <Sparkles className="size-3.5" aria-hidden /> Fill with AI
                  </Button>
                }
              />
              <PopoverContent align="end" className="w-80 space-y-2">
                <p className="text-xs font-medium">Draft rows from a brief</p>
                <Textarea
                  value={brief}
                  onChange={(event) => setBrief(event.target.value)}
                  placeholder="Five summer-sale variants in Spanish, prices ending in 990, one per size"
                  rows={4}
                  className="text-xs"
                  aria-label="Brief"
                />
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={API_RENDER_SUGGEST_ROWS_MAX}
                    value={briefCount}
                    onChange={(event) =>
                      setBriefCount(
                        Math.min(
                          API_RENDER_SUGGEST_ROWS_MAX,
                          Math.max(1, Number(event.target.value) || 1),
                        ),
                      )
                    }
                    className="h-7 w-16 text-xs"
                    aria-label="How many rows"
                  />
                  <span className="text-2xs text-muted-foreground">
                    rows{selected.length === 1 ? ' · seeded from the selected row' : ''}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    className="ml-auto gap-1.5"
                    disabled={!brief.trim() || busy !== null}
                    onClick={suggest}
                  >
                    {busy === 'suggesting' ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Sparkles className="size-3.5" aria-hidden />
                    )}
                    Draft
                  </Button>
                </div>
                <p className="text-2xs text-muted-foreground">
                  Pictures are never guessed — pick them after. Every drafted row is checked like a
                  typed one.
                </p>
              </PopoverContent>
            </Popover>
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              disabled={!readyToFire || busy !== null}
              title={fireHint ?? undefined}
              onClick={fire}
            >
              {busy === 'firing' ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Play className="size-3.5" aria-hidden />
              )}
              Render {selected.length || ''}
            </Button>
          </div>
        ) : null}
      </div>

      {contract ? (
        <>
          <DataGrid
            table={table}
            onPaste={onPaste}
            groupHeader={`${rows.length} request${rows.length === 1 ? '' : 's'} • ${ready} ready • ${selected.length} selected`}
            empty="No rows. Add one, load a set, or paste from a spreadsheet."
          />
          <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs">
            <p className="font-medium">
              {readiness.state} · {readiness.ready} ready · {readiness.blocked} blocked ·{' '}
              {readiness.incomplete} incomplete
            </p>
            {readiness.findings.length ? (
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {readiness.findings.map(([key, finding]) => (
                  <li key={key}>
                    {variables.find((variable) => variable.key === key)?.label ?? 'Preflight'}:{' '}
                    {finding.message} — {finding.rows.join(', ')}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="mt-1 text-muted-foreground">
              {variables.some((variable) => ['boolean', 'number', 'enum'].includes(variable.kind))
                ? 'Template-authorized toggles, numbers, and options are editable here. '
                : ''}
              New fields, hierarchy, or unexposed layout changes require a designer and a new source
              revision.
            </p>
          </div>
          <p className="text-2xs text-muted-foreground">
            Paste rows from a spreadsheet onto the grid: a header line of variable names, then one
            line per render. Each row is dry-run against the workspace as soon as it is complete
            {contract.template.contractSource === 'template_forge'
              ? ''
              : ' — this template carries no roles or budgets, so cells are unlabelled beyond their type'}
            .{fireHint && selected.length ? ` ${fireHint}.` : ''}
            {
              ' Output selection stays locked to every published format until the template contract exposes named output IDs.'
            }
          </p>
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
          onDeliveryChange={(rowId, delivery) =>
            setPreflight((current) =>
              current && {
                ...current,
                rows: current.rows.map((row) =>
                  row.rowId === rowId ? { ...row, delivery: delivery ?? undefined } : row,
                ),
              },
            )
          }
          onClose={() => setPreflight(null)}
          onFired={(jobIds) => {
            setPreflight(null);
            setRowSelection({});
            onFired?.(jobIds);
          }}
        />
      ) : null}
      <AlertDialog open={deleteIds !== null} onOpenChange={(open) => !open && setDeleteIds(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete selected rows?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteIds && deleteIds.size > selected.length
                ? `${deleteIds.size - selected.length} descendant row${deleteIds.size - selected.length === 1 ? '' : 's'} will also be deleted.`
                : 'This removes the selected draft rows.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={deleteSelected}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

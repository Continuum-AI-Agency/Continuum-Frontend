'use client';

import {
  API_RENDER_MEDIA_LIST_MAX,
  API_RENDER_SUGGEST_ROWS_MAX,
  type ApiRenderEnvironment,
  type ApiRenderFitVerdict,
  type ApiRenderInputSet,
  type ApiRenderInputValue,
  type ApiRenderTemplateContract,
  type ApiRenderTemplateSummary,
  type ApiRenderVariable,
  checkAssetSwap,
  type MediaAsset,
} from '@continuum/contracts';
import {
  type ColumnDef,
  getCoreRowModel,
  type RowSelectionState,
  useReactTable,
} from '@tanstack/react-table';
import {
  BookmarkPlus,
  Copy,
  FolderOpen,
  ImageIcon,
  Library,
  Loader2,
  Play,
  Plus,
  Sparkles,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DataGrid, KIND_ICONS, selectColumn } from '@/components/forge/DataGrid';
import {
  draftStorageKey,
  MAX_BATCH_ROWS,
  newRowId,
  parseClipboardRows,
  type RequestRow,
  seedRow,
  toVariableMap,
  validateRow,
} from '@/components/forge/renderRequestRows';
import { MediaSelectPopover } from '@/components/organic/primitives/MediaSelectPopover';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast-imperative';
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
// Drafts live in localStorage. Fired rows become `media.ad_render_jobs`, which is the durable
// record; an unfired draft is scratch, and scratch does not need a table.
// ponytail: localStorage drafts; move to render_input_sets if drafts must roam across devices.

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
    return parsed.rows.map((row) => ({ ...row, check: { state: 'idle' } }));
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

export function RenderRequestsGrid({
  brandId,
  onFired,
}: {
  brandId: string;
  /** Called with the new job ids once a batch is queued — the tab shell switches to the renders view. */
  onFired?: (jobIds: string[]) => void;
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
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [busy, setBusy] = useState<'loading' | 'firing' | 'suggesting' | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [brief, setBrief] = useState('');
  const [briefCount, setBriefCount] = useState(5);
  const [problem, setProblem] = useState<string | null>(null);

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
    if (!templateKey) {
      setContract(null);
      setRows([]);
      return;
    }
    let cancelled = false;
    Promise.all([
      apiRendersApi.getContract(brandId, templateKey, multiEnv ? bindingId : null),
      apiRendersApi.listInputSets(brandId, templateKey).catch(() => ({ items: [] })),
    ])
      .then(([next, sets]) => {
        if (cancelled) return;
        setContract(next);
        setInputSets(sets.items);
        setRows(readDrafts(draftStorageKey(brandId, templateKey)) ?? [seedRow(next.variables)]);
        setRowSelection({});
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        toast.error(describeRenderDiscoveryFailure(error instanceof Error ? error.message : ''));
      });
    return () => {
      cancelled = true;
    };
  }, [brandId, templateKey, bindingId, multiEnv]);

  // --- drafts ------------------------------------------------------------------------------
  useEffect(() => {
    if (!contract) return;
    writeDrafts(draftStorageKey(brandId, contract.template.key), rows);
  }, [brandId, contract, rows]);

  // --- row edits ---------------------------------------------------------------------------
  const updateRow = useCallback((id: string, patch: (row: RequestRow) => RequestRow) => {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...patch(row), check: { state: 'idle' } } : row)),
    );
  }, []);

  const setValue = useCallback(
    (id: string, key: string, value: ApiRenderInputValue | undefined) =>
      updateRow(id, (row) => {
        const values = { ...row.values };
        if (value === undefined) delete values[key];
        else values[key] = value;
        return { ...row, values };
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
    () => new Map(rows.map((row) => [row.id, validateRow(variables, row.values)] as const)),
    [rows, variables],
  );

  useEffect(() => {
    if (!contract) return;
    const { key, contractHash } = contract.template;
    for (const row of rows) {
      if (row.check.state !== 'idle' || timers.current.has(row.id)) continue;
      if (Object.keys(clientErrors.get(row.id) ?? {}).length > 0) continue;
      const snapshot = JSON.stringify(row.values);
      const timer = setTimeout(async () => {
        timers.current.delete(row.id);
        setRows((current) =>
          current.map((r) =>
            r.id === row.id && JSON.stringify(r.values) === snapshot
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
            variables: toVariableMap(row),
          });
          check = { state: 'ready', fit: response.fit, test: response.test };
        } catch (error) {
          check = {
            state: 'error',
            message: describeRenderDiscoveryFailure(error instanceof Error ? error.message : ''),
          };
        }
        // Stale guard: a row edited while its check was in flight keeps its newer `idle`.
        setRows((current) =>
          current.map((r) =>
            r.id === row.id && JSON.stringify(r.values) === snapshot && r.check.state === 'checking'
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
          const value = row.values[variable.key];
          if (variable.reserved)
            return <span className="text-2xs text-muted-foreground">Continuum fills this</span>;
          if (isMedia(variable)) {
            const dims = row.media[variable.key];
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
                  row={row}
                  brandId={brandId}
                  verdict={verdict}
                  onPick={(assets) => pickMedia(row.id, variable, assets)}
                  onClear={() => clearMedia(row.id, variable.key)}
                />
              </div>
            );
          }
          if (variable.kind === 'boolean')
            return (
              <Switch
                size="sm"
                aria-label={variable.label}
                checked={value === true}
                onCheckedChange={(next) => setValue(row.id, variable.key, next)}
              />
            );
          if (variable.kind === 'enum' && variable.options.length > 0)
            return (
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
            </div>
          );
        },
      };
    });
    return [
      selectColumn<RequestRow>(),
      {
        id: 'label',
        size: 140,
        header: 'Label',
        cell: ({ row: { original: row } }) => (
          <Input
            className="h-7 text-xs"
            aria-label="Label"
            placeholder={`Render ${rows.indexOf(row) + 1}`}
            value={row.label}
            onChange={(event) => updateRow(row.id, (r) => ({ ...r, label: event.target.value }))}
          />
        ),
      },
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
  }, [variables, boxes, brandId, clientErrors, rows, pickMedia, clearMedia, setValue, updateRow]);

  const table = useReactTable({
    data: rows,
    columns,
    getRowId: (row) => row.id,
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
  });

  const selected = rows.filter((row) => rowSelection[row.id]);
  const readyToFire =
    selected.length > 0 &&
    selected.length <= MAX_BATCH_ROWS &&
    selected.every((row) => row.check.state === 'ready');
  const fireHint =
    selected.length === 0
      ? 'Select the rows to render'
      : selected.length > MAX_BATCH_ROWS
        ? `At most ${MAX_BATCH_ROWS} renders per batch`
        : !readyToFire
          ? 'Every selected row has to be Ready'
          : null;

  // --- row operations ---------------------------------------------------------------------
  const addRow = () => setRows((current) => [...current, seedRow(variables)]);
  const duplicateSelected = () =>
    setRows((current) =>
      current.flatMap((row) =>
        rowSelection[row.id]
          ? [row, { ...structuredClone(row), id: newRowId(), check: { state: 'idle' } }]
          : [row],
      ),
    );
  const deleteSelected = () => {
    setRows((current) => current.filter((row) => !rowSelection[row.id]));
    setRowSelection({});
  };
  const loadInputSet = (set: ApiRenderInputSet) =>
    setRows((current) => [...current, { ...seedRow([], set.name), values: { ...set.variables } }]);
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
      setRows((current) => [
        ...current,
        ...response.rows.map((row) => ({
          ...seedRow([], row.label),
          values: { ...row.variables },
        })),
      ]);
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
    setRows((current) => [...current, ...pasted]);
    toast.success(
      `${pasted.length} row${pasted.length === 1 ? '' : 's'} pasted${
        unmatched.length
          ? ` — ignored column${unmatched.length === 1 ? '' : 's'}: ${unmatched.join(', ')}`
          : ''
      }`,
    );
  };

  const fire = async () => {
    if (!contract || !readyToFire) return;
    setBusy('firing');
    try {
      const preflight = await apiRendersApi.batchPreflight({
        brandId,
        ...(multiEnv && bindingId ? { bindingId } : {}),
        templateKey: contract.template.key,
        contractHash: contract.template.contractHash,
        records: selected.map((row) => ({
          ...(row.label.trim() ? { label: row.label.trim() } : {}),
          variables: toVariableMap(row),
        })),
      });
      const batch = await apiRendersApi.createBatch({
        confirmationToken: preflight.confirmationToken,
      });
      const fired = new Set(selected.map((row) => row.id));
      setRows((current) => current.filter((row) => !fired.has(row.id)));
      setRowSelection({});
      toast.success(`${batch.jobs.length} render${batch.jobs.length === 1 ? '' : 's'} queued`);
      onFired?.(batch.jobs.map((job) => job.id));
    } catch (error) {
      toast.error(describeRenderDiscoveryFailure(error instanceof Error ? error.message : ''));
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
              <SelectValue placeholder="Workspace" />
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
            />
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
            <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={addRow}>
              <Plus className="size-3.5" aria-hidden /> Row
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={selected.length === 0}
              onClick={duplicateSelected}
            >
              <Copy className="size-3.5" aria-hidden /> Duplicate
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={selected.length === 0}
              onClick={deleteSelected}
            >
              <Trash2 className="size-3.5" aria-hidden /> Delete
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
          <p className="text-2xs text-muted-foreground">
            Paste rows from a spreadsheet onto the grid: a header line of variable names, then one
            line per render. Each row is dry-run against the workspace as soon as it is complete
            {contract.template.contractSource === 'template_forge'
              ? ''
              : ' — this template carries no roles or budgets, so cells are unlabelled beyond their type'}
            .{fireHint && selected.length ? ` ${fireHint}.` : ''}
          </p>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          Choose a template to set up renders.
        </div>
      )}
    </div>
  );
}

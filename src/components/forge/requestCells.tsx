'use client';

import {
  API_RENDER_MEDIA_LIST_MAX,
  type ApiRenderFitVerdict,
  type ApiRenderInputValue,
  type ApiRenderTemplateContract,
  type ApiRenderVariable,
  checkAssetSwap,
  FORGE_RENDER_SET_MAX_DESCENDANT_DEPTH,
  type MediaAsset,
} from '@continuum/contracts';
import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import type { CellContext, Table } from '@tanstack/react-table';
import {
  BookmarkPlus,
  ChevronDown,
  ChevronRight,
  Copy,
  GitFork,
  GripVertical,
  ImageIcon,
  Library,
  Loader2,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { BrandColorField } from '@/components/forge/BrandColorField';
import type { DataGridRowProps } from '@/components/forge/DataGrid';
import { EncodeOverrideCell } from '@/components/forge/EncodeOverrideCell';
import {
  effectiveMedia,
  effectiveOutputIds,
  effectiveValues,
  MAX_BATCH_ROWS,
  type RequestRow,
  type RowDrop,
  rowBreadcrumb,
  rowDepth,
} from '@/components/forge/renderRequestRows';
import { MediaSelectPopover } from '@/components/organic/primitives/MediaSelectPopover';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { pickedPins } from '@/StudioCanvas/nodes/api-render/RenderVariableFields';

// The render-requests grid's cells, as module-level components.
//
// Why this file exists: react-table's `flexRender` does `createElement(columnDef.cell)`, so a
// cell function created inside the grid's render is a NEW component type on every keystroke —
// React unmounts the input you are typing in and focus drops. These components never change
// identity. Everything that changes per render (rows, errors, callbacks) reaches them through
// the table's `meta`, and the variable a column draws rides on its `columnDef.meta`.

const UNSET = '__unset__';

export type RequestRowActions = {
  updateRow: (id: string, patch: (row: RequestRow) => RequestRow) => void;
  setValue: (id: string, key: string, value: ApiRenderInputValue | undefined) => void;
  clearValue: (id: string, key: string) => void;
  resetValue: (id: string, key: string) => void;
  pickMedia: (id: string, variable: ApiRenderVariable, assets: MediaAsset[]) => void;
  clearMedia: (id: string, key: string) => void;
  fork: (ids: string[]) => void;
  duplicate: (ids: string[]) => void;
  /** Asks first — a row takes its descendants with it. */
  remove: (ids: string[]) => void;
  saveAsInputs: (id: string) => void;
};

export type RequestGridMeta = {
  brandId: string;
  contract: ApiRenderTemplateContract;
  rows: RequestRow[];
  clientErrors: Map<string, Record<string, string>>;
  actions: RequestRowActions;
};

export type VariableColumnMeta = { variable: ApiRenderVariable };

// react-table types `meta` as an empty interface; augmenting it globally would retype every
// other table in the app, so the one cast lives here.
const gridMeta = (table: Table<RequestRow>) => table.options.meta as RequestGridMeta;

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

function MediaPicker({
  variable,
  value,
  thumbnailUrl,
  brandId,
  verdict,
  onPick,
  onClear,
}: {
  variable: ApiRenderVariable;
  value: ApiRenderInputValue | undefined;
  thumbnailUrl: string | null;
  brandId: string;
  verdict: ApiRenderFitVerdict | null;
  onPick: (assets: MediaAsset[]) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const pins = pickedPins(value);
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
            {thumbnailUrl ? (
              <img src={thumbnailUrl} alt="" className="size-5 rounded-sm object-cover" />
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
  actions,
}: {
  row: RequestRow;
  variable: ApiRenderVariable;
  actions: RequestRowActions;
}) {
  if (!row.parentId) return null;
  const changed = variable.key in row.values || row.clearedKeys.includes(variable.key);
  return changed ? (
    <button
      type="button"
      className="rounded-md p-0.5 text-muted-foreground hover:bg-muted/50"
      aria-label={`Reset ${variable.label} to inherited`}
      title="Reset to inherited"
      onClick={() => actions.resetValue(row.id, variable.key)}
    >
      <RotateCcw className="size-3" aria-hidden />
    </button>
  ) : (
    <button
      type="button"
      className="rounded-md p-0.5 text-muted-foreground hover:bg-muted/50"
      aria-label={`Clear inherited ${variable.label}`}
      title="Clear inherited value"
      onClick={() => actions.clearValue(row.id, variable.key)}
    >
      <X className="size-3" aria-hidden />
    </button>
  );
}

/**
 * A number typed as text. The draft is the source of truth while typing, so `1.` and `-` stay
 * on screen; only a finite number (or an empty cell) is committed to the row.
 */
function NumberInput({
  label,
  value,
  error,
  placeholder,
  onCommit,
}: {
  label: string;
  value: ApiRenderInputValue | undefined;
  error: string | undefined;
  placeholder: string | undefined;
  onCommit: (value: number | undefined) => void;
}) {
  const [draft, setDraft] = useState(value === undefined ? '' : String(value));
  // A value that changed underneath (reset, paste, another row's inheritance) replaces the
  // draft — unless the draft already means that number.
  useEffect(() => {
    setDraft((current) =>
      current.trim() !== '' && Number(current) === value
        ? current
        : value === undefined
          ? ''
          : String(value),
    );
  }, [value]);
  return (
    <Input
      className={cn('h-7 text-xs tabular-nums', error && 'border-destructive')}
      type="text"
      inputMode="decimal"
      aria-label={label}
      title={error}
      placeholder={placeholder}
      value={draft}
      onChange={(event) => {
        const raw = event.target.value;
        setDraft(raw);
        if (raw.trim() === '') onCommit(undefined);
        else if (Number.isFinite(Number(raw))) onCommit(Number(raw));
      }}
    />
  );
}

export function VariableCell({
  row: { original: row },
  column,
  table,
}: CellContext<RequestRow, unknown>) {
  const { variable } = column.columnDef.meta as VariableColumnMeta;
  const { brandId, contract, rows, clientErrors, actions } = gridMeta(table);
  const error = clientErrors.get(row.id)?.[variable.key];
  const value = effectiveValues(rows, row.id)[variable.key];
  const inheritance = <InheritanceAction row={row} variable={variable} actions={actions} />;

  if (variable.reserved)
    return <span className="text-2xs text-muted-foreground">Continuum fills this</span>;

  if (isMedia(variable)) {
    const dims = effectiveMedia(rows, row.id)[variable.key];
    const verdict = checkAssetSwap({
      key: variable.key,
      placement: variable.placement,
      asset: dims?.w && dims.h ? { w: dims.w, h: dims.h } : null,
      neighbours: (contract.layout?.boxes ?? []).filter((box) => box.key !== variable.key),
    });
    return (
      <div title={error} className={cn(error && 'rounded-md ring-1 ring-destructive')}>
        <MediaPicker
          variable={variable}
          value={value}
          thumbnailUrl={dims?.thumbnailUrl ?? null}
          brandId={brandId}
          verdict={verdict}
          onPick={(assets) => actions.pickMedia(row.id, variable, assets)}
          onClear={() =>
            row.parentId
              ? actions.clearValue(row.id, variable.key)
              : actions.clearMedia(row.id, variable.key)
          }
        />
        {inheritance}
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
          onCheckedChange={(next) => actions.setValue(row.id, variable.key, next)}
        />
        {inheritance}
      </div>
    );

  if (variable.kind === 'enum' && variable.options.length > 0)
    return (
      <div className="flex items-center gap-1">
        <Select
          value={String(value ?? '')}
          onValueChange={(next) =>
            actions.setValue(row.id, variable.key, next === UNSET ? undefined : (next ?? undefined))
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
        {inheritance}
      </div>
    );

  if (variable.kind === 'color')
    return (
      <div
        title={error}
        className={cn(
          'flex min-w-44 items-center gap-1',
          error && 'rounded-md ring-1 ring-destructive',
        )}
      >
        <BrandColorField
          brandId={brandId}
          label={variable.label}
          value={typeof value === 'string' && value ? value : null}
          onChange={(hex) => actions.setValue(row.id, variable.key, hex)}
        />
        {inheritance}
      </div>
    );

  if (variable.kind === 'number')
    return (
      <div className="flex min-w-28 items-center gap-1.5">
        <NumberInput
          label={variable.label}
          value={value}
          error={error}
          placeholder={variable.sample ?? undefined}
          onCommit={(next) => actions.setValue(row.id, variable.key, next)}
        />
        {inheritance}
      </div>
    );

  const used = typeof value === 'string' ? value.length : 0;
  const over = variable.charBudget !== null && used > variable.charBudget;
  return (
    <div className="flex min-w-36 items-center gap-1.5">
      <Input
        className={cn('h-7 text-xs', error && 'border-destructive')}
        aria-label={variable.label}
        title={error}
        placeholder={variable.sample ?? undefined}
        value={value === undefined ? '' : String(value)}
        onChange={(event) =>
          actions.setValue(
            row.id,
            variable.key,
            event.target.value === '' ? undefined : event.target.value,
          )
        }
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
      {inheritance}
    </div>
  );
}

function RowMenu({
  row,
  rows,
  actions,
  labelInput,
}: {
  row: RequestRow;
  rows: RequestRow[];
  actions: RequestRowActions;
  labelInput: React.RefObject<HTMLInputElement | null>;
}) {
  const renaming = useRef(false);
  const full = rows.length >= MAX_BATCH_ROWS;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label={`Row actions for ${row.label || 'Untitled'}`}
          >
            <MoreHorizontal aria-hidden />
          </Button>
        }
      />
      <DropdownMenuContent
        align="end"
        className="w-44"
        // Rename hands focus straight to the name field instead of back to this button.
        finalFocus={() => {
          if (!renaming.current) return true;
          renaming.current = false;
          queueMicrotask(() => labelInput.current?.select());
          return labelInput.current;
        }}
      >
        <DropdownMenuItem onClick={() => (renaming.current = true)}>
          <Pencil aria-hidden /> Rename
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={full || rowDepth(rows, row.id) >= FORGE_RENDER_SET_MAX_DESCENDANT_DEPTH}
          onClick={() => actions.fork([row.id])}
        >
          <GitFork aria-hidden /> Fork
        </DropdownMenuItem>
        <DropdownMenuItem disabled={full} onClick={() => actions.duplicate([row.id])}>
          <Copy aria-hidden /> Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => actions.saveAsInputs(row.id)}>
          <BookmarkPlus aria-hidden /> Save as inputs
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => actions.remove([row.id])}>
          <Trash2 aria-hidden /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function deliveryNote(row: RequestRow): string | null {
  const delivery = row.delivery;
  if (!delivery) return null;
  if (delivery.action === 'replace')
    return `Replaces ad ${'adName' in delivery && delivery.adName ? delivery.adName : delivery.adId}`;
  return `New ad in ${delivery.adsetName ?? delivery.adsetId}`;
}

export function LabelCell({ row: tableRow, table }: CellContext<RequestRow, unknown>) {
  const { rows, actions } = gridMeta(table);
  const row = tableRow.original;
  const labelInput = useRef<HTMLInputElement>(null);
  const breadcrumb = rowBreadcrumb(rows, row.id).slice(0, -1).join(' / ');
  const note = deliveryNote(row);
  return (
    <div className="flex min-w-52 items-center gap-1">
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
          ref={labelInput}
          className="h-7 text-xs"
          aria-label="Row name"
          placeholder={`Render ${rows.findIndex((item) => item.id === row.id) + 1}`}
          value={row.label}
          onChange={(event) =>
            actions.updateRow(row.id, (current) => ({ ...current, label: event.target.value }))
          }
        />
        {note ? (
          <p className="truncate text-3xs text-muted-foreground" title={note}>
            {note}
          </p>
        ) : null}
      </div>
      <RowMenu row={row} rows={rows} actions={actions} labelInput={labelInput} />
    </div>
  );
}

export function FormatsCell({ row: { original: row }, table }: CellContext<RequestRow, unknown>) {
  const { contract, rows, actions } = gridMeta(table);
  const outputs = contract.outputs;
  const inherited = effectiveOutputIds(rows, row.id);
  const selectedIds = inherited.length ? inherited : outputs.map((output) => output.id);
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
                actions.updateRow(row.id, (current) => ({
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
          onClick={() => actions.updateRow(row.id, (current) => ({ ...current, outputIds: [] }))}
        >
          <RotateCcw className="size-3" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

export function EncodeCell({ row: { original: row }, table }: CellContext<RequestRow, unknown>) {
  const { contract, rows, actions } = gridMeta(table);
  return (
    <EncodeOverrideCell
      row={row}
      rows={rows}
      outputs={contract.outputs}
      onChange={(patch) => actions.updateRow(row.id, (current) => ({ ...current, ...patch }))}
    />
  );
}

export function StatusCell({ row: { original: row }, table }: CellContext<RequestRow, unknown>) {
  const { clientErrors } = gridMeta(table);
  return <StatusBadge row={row} invalid={Object.keys(clientErrors.get(row.id) ?? {}).length > 0} />;
}

// --- drag and drop -------------------------------------------------------------------------

type SortableHandle = {
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
  setActivatorNodeRef: (element: HTMLElement | null) => void;
};

const SortableHandleContext = createContext<SortableHandle | null>(null);

/** Where the row being dragged would land, drawn by the row it would land on. */
export const RowDropHintContext = createContext<RowDrop | null>(null);

const DROP_HINT_CLASS = {
  before: 'shadow-[inset_0_2px_0_0_var(--color-primary)]',
  after: 'shadow-[inset_0_-2px_0_0_var(--color-primary)]',
  inside: 'bg-primary/10 hover:bg-primary/10',
} as const;

/**
 * A draggable, droppable `tr`. Other rows do not shift while dragging — a drop is "before",
 * "inside" or "after" the row under the pointer, so the rows have to stay where they are for
 * the middle of one to mean anything.
 */
export function SortableRequestRow({ row, className, ...props }: DataGridRowProps<RequestRow>) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useSortable({
    id: row.id,
  });
  const hint = useContext(RowDropHintContext);
  const position = hint?.rowId === row.id ? hint.position : null;
  return (
    <SortableHandleContext.Provider value={{ attributes, listeners, setActivatorNodeRef }}>
      <TableRow
        ref={setNodeRef}
        data-drop={position ?? undefined}
        className={cn(className, isDragging && 'opacity-40', position && DROP_HINT_CLASS[position])}
        {...props}
      />
    </SortableHandleContext.Provider>
  );
}

export function DragHandleCell({ row: { original: row } }: CellContext<RequestRow, unknown>) {
  const handle = useContext(SortableHandleContext);
  if (!handle) return null;
  return (
    <button
      type="button"
      ref={handle.setActivatorNodeRef}
      className="flex cursor-grab touch-none items-center rounded-md p-0.5 text-muted-foreground hover:bg-muted/50 active:cursor-grabbing"
      {...handle.attributes}
      {...handle.listeners}
      aria-label={`Drag ${row.label || 'Untitled'}`}
      onClick={(event) => event.stopPropagation()}
    >
      <GripVertical className="size-3.5" aria-hidden />
    </button>
  );
}

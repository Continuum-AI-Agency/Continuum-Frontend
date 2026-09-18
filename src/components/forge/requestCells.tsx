'use client';

import {
  API_RENDER_MEDIA_LIST_MAX,
  type ApiRenderFitReport,
  type ApiRenderFitVerdict,
  type ApiRenderInputValue,
  type ApiRenderTemplateContract,
  type ApiRenderVariable,
  checkAssetSwap,
  FORGE_RENDER_SET_MAX_DESCENDANT_DEPTH,
  type MediaAsset,
  readableLayerName,
} from '@continuum/contracts';
import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import type { CellContext, Table } from '@tanstack/react-table';
import {
  BookmarkPlus,
  ChevronDown,
  ChevronRight,
  Copy,
  CornerDownRight,
  GripVertical,
  ImageIcon,
  Library,
  Loader2,
  type LucideIcon,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { BrandColorField } from '@/components/forge/BrandColorField';
import type { DataGridRowProps } from '@/components/forge/DataGrid';
import { EncodeOverrideCell } from '@/components/forge/EncodeOverrideCell';
import { RatioGlyph } from '@/components/forge/RatioGlyph';
import {
  effectiveMedia,
  effectiveOutputIds,
  effectiveValues,
  isEmptyInput,
  MAX_BATCH_ROWS,
  missingInputs,
  ownChangeCount,
  type RequestRow,
  type RequestRowMedia,
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
  DropdownMenuGroup,
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
  /** Child rows that inherit until changed. Focuses the first; the selection stays as it is. */
  fork: (ids: string[]) => void;
  /** A row straight after this one's subtree, under the same parent. */
  addRowBelow: (id: string) => void;
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
  media,
  brandId,
  verdict,
  onPick,
  onClear,
}: {
  variable: ApiRenderVariable;
  value: ApiRenderInputValue | undefined;
  media: RequestRowMedia | undefined;
  brandId: string;
  verdict: ApiRenderFitVerdict | null;
  onPick: (assets: MediaAsset[]) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const pins = pickedPins(value);
  const fit = fitTone(pins.length ? verdict : null);
  const Kind = variable.kind === 'video' ? Video : ImageIcon;
  const picked = pins.length
    ? variable.multiple
      ? `${pins.length} picked`
      : (media?.name ?? 'Picked')
    : 'Choose';
  // One line whatever was picked: a fixed-width anchor that truncates, controls that never wrap.
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
            title={pins.length ? picked : undefined}
            className="flex h-7 w-32 shrink-0 items-center gap-1.5 rounded-md border border-border/70 px-1.5 text-2xs text-muted-foreground hover:bg-muted/50"
            onClick={() => setOpen(true)}
          >
            {media?.thumbnailUrl ? (
              <img
                src={media.thumbnailUrl}
                alt=""
                className="size-5 shrink-0 rounded-sm object-cover"
              />
            ) : (
              <Kind className="size-3 shrink-0" aria-hidden />
            )}
            <span className="min-w-0 flex-1 truncate text-left">{picked}</span>
            {!pins.length ? <Library className="size-3 shrink-0" aria-hidden /> : null}
          </button>
        }
      />
      {fit ? (
        <Badge variant={fit.variant} title={fit.title} className="shrink-0 px-1 py-0 text-2xs">
          {fit.text}
        </Badge>
      ) : null}
      {pins.length ? (
        <button
          type="button"
          aria-label={`Clear ${variable.label}`}
          className="shrink-0 rounded-md p-0.5 text-muted-foreground hover:bg-muted/50"
          onClick={onClear}
        >
          <X className="size-3" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

/** Why a row's frame goes to the AI check, from the slots the placement check could not settle. */
function aiCheckWhy(fit: ApiRenderFitReport): string {
  const reasons = [
    fit.slots.some((slot) => slot.state === 'unknown')
      ? 'where an image lands couldn’t be measured'
      : null,
    fit.slots.some((slot) => slot.state === 'clipped') ? 'an image may be cut off' : null,
  ].filter(Boolean);
  return `An AI model checks the finished frame after it renders, because ${
    reasons.join(' and ') || 'placement couldn’t be measured'
  }.`;
}

/** A status word with its one-sentence reason, on hover and on keyboard focus. */
function Explained({ why, children }: { why: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger className="rounded-md text-left focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-hidden">
        {children}
      </TooltipTrigger>
      <TooltipContent side="bottom">{why}</TooltipContent>
    </Tooltip>
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
        <Explained why={aiCheckWhy(row.check.fit)}>
          <Badge variant="warning">AI check after render</Badge>
        </Explained>
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
  invalid,
  placeholder,
  onCommit,
}: {
  label: string;
  value: ApiRenderInputValue | undefined;
  error: string | undefined;
  invalid: boolean;
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
      className={cn('h-7 text-xs tabular-nums', invalid && 'border-destructive')}
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
  // A required blank is "Needs input" on the row, not a red cell: only a wrong value is marked.
  const invalid = error !== undefined && !(variable.required && isEmptyInput(variable, value));
  const inheritance = <InheritanceAction row={row} variable={variable} actions={actions} />;

  if (variable.reserved)
    return (
      <Explained why="The brand’s logo, filled in automatically at render time.">
        <span className="text-2xs text-muted-foreground underline decoration-dotted underline-offset-2">
          Continuum fills this
        </span>
      </Explained>
    );

  if (isMedia(variable)) {
    const dims = effectiveMedia(rows, row.id)[variable.key];
    const verdict = checkAssetSwap({
      key: variable.key,
      placement: variable.placement,
      asset: dims?.w && dims.h ? { w: dims.w, h: dims.h } : null,
      neighbours: (contract.layout?.boxes ?? []).filter((box) => box.key !== variable.key),
    });
    return (
      <div
        title={error}
        className={cn('flex items-center gap-1', invalid && 'rounded-md ring-1 ring-destructive')}
      >
        <MediaPicker
          variable={variable}
          value={value}
          media={dims}
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
            className={cn('h-7 min-w-28 text-xs', invalid && 'border-destructive')}
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
          invalid && 'rounded-md ring-1 ring-destructive',
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
          invalid={invalid}
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
        className={cn('h-7 text-xs', invalid && 'border-destructive')}
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
          <CornerDownRight aria-hidden /> Add variation
        </DropdownMenuItem>
        <DropdownMenuItem disabled={full} onClick={() => actions.duplicate([row.id])}>
          <Copy aria-hidden /> Copy
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

/**
 * A row's quick add, shown while the row is hovered or holds focus. Disabled with the reason
 * rather than hidden, so the limit is something a person can read.
 */
function RowAddButton({
  label,
  hint,
  disabledReason,
  icon: Icon,
  onAdd,
}: {
  label: string;
  hint: string;
  disabledReason: string | null;
  icon: LucideIcon;
  onAdd: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label={label}
            disabled={disabledReason !== null}
            focusableWhenDisabled
            className="invisible group-focus-within/row:visible group-hover/row:visible"
            // The row's own click previews that row; this one previews the row it adds.
            onClick={(event) => {
              event.stopPropagation();
              onAdd();
            }}
          >
            <Icon aria-hidden />
          </Button>
        }
      />
      <TooltipContent side="bottom">{disabledReason ?? hint}</TooltipContent>
    </Tooltip>
  );
}

export function LabelCell({ row: tableRow, table }: CellContext<RequestRow, unknown>) {
  const { rows, actions } = gridMeta(table);
  const row = tableRow.original;
  const labelInput = useRef<HTMLInputElement>(null);
  const breadcrumb = rowBreadcrumb(rows, row.id).slice(0, -1).join(' / ');
  const note = deliveryNote(row);
  const full =
    rows.length >= MAX_BATCH_ROWS ? `A render set holds at most ${MAX_BATCH_ROWS} rows` : null;
  return (
    <div className="flex min-w-72 items-center gap-1">
      {/* One guide per level, reaching through the cell's padding so a branch reads as a line. */}
      {Array.from({ length: tableRow.depth }, (_, level) => (
        <span
          key={level}
          aria-hidden
          data-guide
          className="-my-1 ml-1.5 w-1.5 shrink-0 self-stretch border-l border-border"
        />
      ))}
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
      <div className="min-w-0 flex-1">
        {breadcrumb ? (
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate text-3xs text-muted-foreground" title={breadcrumb}>
              {breadcrumb}
            </p>
            <span className="shrink-0 rounded-sm bg-muted px-1 font-mono text-3xs tabular-nums text-muted-foreground">
              inherits · {ownChangeCount(row)} changed
            </span>
          </div>
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
      <RowAddButton
        label="Add variation"
        hint="Add variation — inherits every value until you change it"
        icon={CornerDownRight}
        disabledReason={
          full ??
          (tableRow.depth >= FORGE_RENDER_SET_MAX_DESCENDANT_DEPTH
            ? `Variations go at most ${FORGE_RENDER_SET_MAX_DESCENDANT_DEPTH} levels deep`
            : null)
        }
        onAdd={() => actions.fork([row.id])}
      />
      <RowAddButton
        label="Row below"
        hint={row.parentId ? 'Add another variation of the same parent' : 'Add a row below'}
        icon={Plus}
        disabledReason={full}
        onAdd={() => actions.addRowBelow(row.id)}
      />
      <RowMenu row={row} rows={rows} actions={actions} labelInput={labelInput} />
    </div>
  );
}

const VISIBLE_RATIOS = 3;

/**
 * Which ratios a row renders, as their shapes: up to three, then `+N`. An inherited set is drawn
 * muted with dashed shapes — the row renders it, but changing it happens on an ancestor.
 */
export function RatioChips({ ratios, inherited }: { ratios: string[]; inherited?: boolean }) {
  return (
    <span
      data-formats={inherited ? 'inherited' : 'own'}
      className={cn(
        'flex items-center gap-1.5 font-mono text-2xs tabular-nums',
        inherited ? 'text-muted-foreground' : 'text-foreground',
      )}
    >
      {ratios.slice(0, VISIBLE_RATIOS).map((ratio, index) => (
        <span key={`${ratio}:${index}`} data-ratio={ratio} className="flex items-center gap-1">
          <RatioGlyph ratio={ratio} className={inherited ? 'border-dashed' : undefined} />
          {ratio}
        </span>
      ))}
      {ratios.length > VISIBLE_RATIOS ? <span>+{ratios.length - VISIBLE_RATIOS}</span> : null}
    </span>
  );
}

/** The nearest ancestor that picks formats — else the root, whose "none" is every format. */
function formatsSource(rows: RequestRow[], row: RequestRow): RequestRow | undefined {
  const byId = new Map(rows.map((item) => [item.id, item]));
  let source = row.parentId ? byId.get(row.parentId) : undefined;
  while (source?.parentId && source.outputIds.length === 0) source = byId.get(source.parentId);
  return source;
}

export function FormatsCell({ row: { original: row }, table }: CellContext<RequestRow, unknown>) {
  const { contract, rows, actions } = gridMeta(table);
  const outputs = contract.outputs;
  if (outputs.length === 0) {
    const { ratios } = contract.template;
    const together = 'This template renders every format together';
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            // biome-ignore lint/a11y/useSemanticElements: a labelled run of chips, not a form fieldset.
            <span
              role="group"
              // biome-ignore lint/a11y/noNoninteractiveTabindex: read-only formats, focusable so the keyboard reaches why they cannot be picked.
              tabIndex={0}
              aria-label={`Formats ${ratios.join(', ')}. ${together}`}
              className="flex h-6 w-max items-center rounded-md px-1.5 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-hidden"
            >
              <RatioChips ratios={ratios} />
            </span>
          }
        />
        <TooltipContent side="bottom">{together}</TooltipContent>
      </Tooltip>
    );
  }
  const effective = effectiveOutputIds(rows, row.id);
  const selectedIds = effective.length ? effective : outputs.map((output) => output.id);
  const ratios = outputs
    .filter((output) => selectedIds.includes(output.id))
    .map((output) => output.ratio ?? output.label);
  const inheritedFrom =
    row.parentId && row.outputIds.length === 0
      ? formatsSource(rows, row)?.label.trim() || 'Untitled'
      : null;
  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        {/* Always mounted, only disabled: a trigger that changed shape on the first tick would
            remount under the open menu. */}
        <Tooltip disabled={inheritedFrom === null}>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    aria-label={`Formats ${ratios.join(', ')}${inheritedFrom ? `, inherited from ${inheritedFrom}` : ''}`}
                  >
                    <RatioChips ratios={ratios} inherited={inheritedFrom !== null} />
                    <ChevronDown
                      data-icon="inline-end"
                      className="text-muted-foreground"
                      aria-hidden
                    />
                  </Button>
                }
              />
            }
          />
          <TooltipContent side="bottom">Inherited from {inheritedFrom}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent className="w-48">
          <DropdownMenuGroup>
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
                <RatioGlyph ratio={output.ratio} />
                {output.label}
                {output.ratio ? (
                  <span className="ml-auto font-mono text-2xs tabular-nums text-muted-foreground">
                    {output.ratio}
                  </span>
                ) : null}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuGroup>
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
  const { contract, rows, clientErrors } = gridMeta(table);
  const errorKeys = Object.keys(clientErrors.get(row.id) ?? {});
  const missing = missingInputs(contract.variables, effectiveValues(rows, row.id));
  // Blank is not wrong: a row that is only waiting on required inputs reads muted, never red.
  if (errorKeys.length && errorKeys.every((key) => missing.includes(key))) {
    const names = missing.map((key) =>
      readableLayerName(contract.variables.find((item) => item.key === key)?.label ?? key),
    );
    return (
      <Badge variant="muted" title={`Fill in ${names.join(', ')}`}>
        Needs input
      </Badge>
    );
  }
  return <StatusBadge row={row} invalid={errorKeys.length > 0} />;
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

// Drawn by the cells, not the row: a sticky cell paints over its row, so a line on the `tr` would
// stop short under the handle, checkbox and name.
const DROP_HINT_CLASS = {
  before: '[&>td]:shadow-[inset_0_2px_0_0_var(--color-primary)]',
  after: '[&>td]:shadow-[inset_0_-2px_0_0_var(--color-primary)]',
  // Opaque, like every row surface, so the sticky cells that inherit it hide what scrolls under.
  inside:
    'bg-[color-mix(in_oklab,var(--color-primary)_10%,var(--color-card))] hover:bg-[color-mix(in_oklab,var(--color-primary)_10%,var(--color-card))]',
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
        data-row-id={row.id}
        data-drop={position ?? undefined}
        className={cn(
          'group/row',
          className,
          isDragging && 'opacity-40',
          position && DROP_HINT_CLASS[position],
        )}
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

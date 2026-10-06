'use client';

import {
  type ApiRenderInputSet,
  type ApiRenderTemplateSummary,
  type ApiRenderVariable,
  readableLayerName,
  templateDisplayName,
  templateRefOf,
} from '@continuum/contracts';
import {
  ChevronDown,
  ClipboardPaste,
  Download,
  Eye,
  FolderOpen,
  GitCommitHorizontal,
  Loader2,
  Play,
  Plus,
  Save,
  Settings2,
  Sparkles,
  Upload,
} from 'lucide-react';
import { Fragment, type ReactNode, type Ref } from 'react';
import { RatioGlyph } from '@/components/forge/RatioGlyph';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { cn } from '@/lib/utils';
import type { CheckpointGraph } from './templateCheckpoints';
import { shortSha } from './templateVersion';

// The Render tab's toolbar: four controls, left to right in the order a person uses them —
// which template, add rows, import rows, save and render. Which set the rows belong to is the
// rail beside the grid (RenderSetRail); everything else a row can do lives on the row (its hover
// buttons and menu) or on the selection (the bar under this).

export const templateLabel = (template: ApiRenderTemplateSummary): string =>
  template.displayName ?? templateDisplayName(template.name);

/** Marks one top-level control, so "at most five" is something a test can count. */
function Control({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div data-toolbar-control className={cn('flex items-center gap-1.5', className)}>
      {children}
    </div>
  );
}

export function RenderToolbar({
  templates,
  templateKey,
  variants = [],
  sourceVariants,
  variant = '',
  onVariantChange,
  templatesLoading,
  onTemplateChange,
  onOpenTemplateSettings,
  bindingId,
  ready,
  inputSets,
  canAddRows,
  onAddRow,
  onDraftWithAi,
  draftAnchorRef,
  onAddFromInputs,
  layerSwitches,
  onAskSwitch,
  checkpoints,
  templateRef,
  onTemplateRefChange,
  onUpload,
  onDownloadTemplate,
  dirty,
  saveStatus,
  canSave,
  onSave,
  selectedCount,
  files,
  readyToFire,
  fireHint,
  busy,
  onRender,
}: {
  templates: ApiRenderTemplateSummary[];
  templateKey: string;
  variants?: Array<{ id: string; label: string }>;
  sourceVariants?: ApiRenderTemplateSummary[];
  variant?: string | null;
  onVariantChange?: (id: string) => void;
  templatesLoading: boolean;
  /** Called with the template REF (`bindingId:key`), never a bare key. */
  onTemplateChange: (ref: string) => void;
  /** Open the chosen template's settings on the Templates tab; absent when its source is unknown. */
  onOpenTemplateSettings?: () => void;
  /** The chosen template's binding, so a key held in two of them resolves to the right row. */
  bindingId: string | null;
  /** False until a template's contract is loaded; so are the controls after the picker. */
  ready: boolean;
  inputSets: ApiRenderInputSet[];
  canAddRows: boolean;
  onAddRow: () => void;
  /** Rows from a brief, proposed by the AI — they land in the grid unsaved until kept. */
  onDraftWithAi: () => void;
  draftAnchorRef?: Ref<HTMLButtonElement>;
  onAddFromInputs: (set: ApiRenderInputSet) => void;
  /** The template's checkpoints (null until its history is read) and the one this render pins. */
  checkpoints: CheckpointGraph | null;
  templateRef: string | null;
  onTemplateRefChange: (ref: string | null) => void;
  /** Layer Show switches no row can change yet; picking one asks for it per row. */
  layerSwitches: ApiRenderVariable[];
  onAskSwitch: (variable: ApiRenderVariable) => void;
  onUpload: () => void;
  onDownloadTemplate: () => void;
  dirty: boolean;
  /**
   * What autosave is doing: writing now, written at a time, or failed — with why, and whether it
   * retries by itself or waits for a change or Save. Null while there is nothing saved or to save.
   */
  saveStatus:
    | { phase: 'saving' }
    | { phase: 'saved'; at: string }
    | { phase: 'failed'; reason: string; retrying: boolean }
    | null;
  canSave: boolean;
  onSave: () => void;
  selectedCount: number;
  /** Every file the selection renders, and how many of them come out in each ratio. */
  files: { total: number; byRatio: Array<[ratio: string, count: number]>; replacements: number };
  readyToFire: boolean;
  fireHint: string | null;
  busy: 'saving' | 'firing' | null;
  onRender: () => void;
}) {
  const current = templates.find(
    (template) => template.key === templateKey && (!bindingId || template.bindingId === bindingId),
  );
  const currentRef = current ? templateRefOf(current) : '';
  const siblings =
    sourceVariants ??
    (current?.sourceAssetId
      ? templates.filter(
          (item) =>
            item.sourceAssetId === current.sourceAssetId && item.bindingId === current.bindingId,
        )
      : []);
  return (
    <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Render">
      <Control className="max-w-full min-w-0 flex-wrap">
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={templates.length === 0}
            render={
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-64 justify-between gap-1.5"
                aria-label="Template"
              >
                <span className="truncate">
                  {current
                    ? templateLabel(current)
                    : templatesLoading
                      ? 'Loading templates…'
                      : templates.length
                        ? 'Choose a template'
                        : 'No renderable templates yet'}
                </span>
                <ChevronDown className="size-3.5 shrink-0" aria-hidden />
              </Button>
            }
          />
          <DropdownMenuContent align="start" className="w-72">
            {/* Keyed and valued by the REF. Two templates can share a key — 133 exists in two
                sub-apps — and React silently drops the second child of a duplicated key, so a
                person would see one row where they hold two and render the wrong tenant's comp. */}
            <DropdownMenuRadioGroup value={currentRef} onValueChange={onTemplateChange}>
              {templates.map((template) => (
                <DropdownMenuRadioItem
                  key={templateRefOf(template)}
                  value={templateRefOf(template)}
                >
                  <span className="truncate">{templateLabel(template)}</span>
                  {template.ratios.length ? (
                    <span className="ml-auto text-2xs text-muted-foreground">
                      {template.ratios.join(' ')}
                    </span>
                  ) : null}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        {onOpenTemplateSettings ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Template settings"
                  onClick={onOpenTemplateSettings}
                >
                  <Settings2 className="size-4" aria-hidden />
                </Button>
              }
            />
            <TooltipContent>Template settings — layers, variants, revisions</TooltipContent>
          </Tooltip>
        ) : null}
        {ready && siblings.length > 0 ? (
          <label className="flex items-center gap-1.5 text-xs">
            Variant
            <select
              aria-label="Template source variant"
              value={currentRef}
              onChange={(event) => onTemplateChange(event.target.value)}
              className="h-8 max-w-56 rounded-md border border-input bg-background px-2 text-xs"
              disabled={busy !== null}
            >
              {siblings.map((item) => (
                <option key={templateRefOf(item)} value={templateRefOf(item)}>
                  {templateLabel(item)}
                  {siblings.some(
                    (other) => other !== item && templateLabel(other) === templateLabel(item),
                  )
                    ? ` · ${templateDisplayName(item.name)}`
                    : ''}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {ready && variants.length > 1 && onVariantChange ? (
          <label className="flex items-center gap-1.5 text-xs">
            Artboard / layer variant
            <select
              aria-label="Template variant"
              value={variant === null ? 'mixed:' : variant}
              onChange={(event) => onVariantChange(event.target.value)}
              className="h-8 max-w-56 rounded-md border border-input bg-background px-2 text-xs"
              disabled={busy !== null}
            >
              <option value="">All artboards / variants</option>
              {variant === null ? (
                <option value="mixed:" disabled>
                  Mixed selections
                </option>
              ) : null}
              {variants.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {checkpoints?.live ? (
          <CheckpointPicker
            graph={checkpoints}
            templateRef={templateRef}
            onChange={onTemplateRefChange}
          />
        ) : null}
      </Control>

      {ready ? (
        <>
          <Control>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    ref={draftAnchorRef}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                  >
                    <Plus className="size-3.5" aria-hidden /> Add
                    <ChevronDown className="size-3.5" aria-hidden />
                  </Button>
                }
              />
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem disabled={!canAddRows} onClick={onAddRow}>
                  <Plus aria-hidden /> Blank row
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canAddRows} onClick={onDraftWithAi}>
                  <Sparkles aria-hidden /> Draft with AI…
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger disabled={inputSets.length === 0 || !canAddRows}>
                    <FolderOpen aria-hidden /> From saved inputs
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-56">
                    {inputSets.map((set) => (
                      <DropdownMenuItem key={set.id} onClick={() => onAddFromInputs(set)}>
                        <span className="truncate">{set.name}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                {layerSwitches.length > 0 ? (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Eye aria-hidden /> Switch a layer per row
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-64">
                      <DropdownMenuGroup>
                        <DropdownMenuLabel className="text-2xs font-normal text-muted-foreground">
                          Adds a Shown / Hidden column to this template. Every row starts as
                          designed.
                        </DropdownMenuLabel>
                        {layerSwitches.map((variable) => (
                          <DropdownMenuItem
                            key={variable.key}
                            onClick={() => onAskSwitch(variable)}
                          >
                            <span className="truncate">{readableLayerName(variable.label)}</span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </Control>

          <Control>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button type="button" size="sm" variant="outline" className="gap-1.5">
                    <Upload className="size-3.5" aria-hidden /> Import
                    <ChevronDown className="size-3.5" aria-hidden />
                  </Button>
                }
              />
              <DropdownMenuContent align="start" className="w-72">
                <DropdownMenuItem onClick={onUpload}>
                  <Upload aria-hidden /> Upload CSV or XLSX…
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDownloadTemplate}>
                  <Download aria-hidden /> Download spreadsheet template
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="flex gap-1.5 font-normal text-muted-foreground">
                    <ClipboardPaste className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span className="text-2xs">
                      Or paste rows onto the grid: copy a header line of variable names and the rows
                      under it straight from a spreadsheet.
                    </span>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </Control>

          <Control className="ml-auto">
            <span
              role="status"
              aria-label="Save status"
              title={saveStatus?.phase === 'failed' ? saveStatus.reason : undefined}
              className={cn(
                'max-w-96 truncate text-2xs tabular-nums',
                saveStatus?.phase === 'failed' ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {saveStatus?.phase === 'saving'
                ? 'Saving…'
                : saveStatus?.phase === 'failed'
                  ? `Couldn’t save: ${saveStatus.reason}${saveStatus.retrying ? ' Retrying…' : ''}`
                  : dirty
                    ? 'Unsaved changes'
                    : saveStatus?.phase === 'saved'
                      ? `Saved · ${formatRelativeTime(saveStatus.at)}`
                      : null}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="relative gap-1.5"
              disabled={!canSave || busy !== null}
              title={dirty ? 'Save now (⌘S) — edits also save by themselves' : 'Saved'}
              onClick={onSave}
            >
              {busy === 'saving' ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Save className="size-3.5" aria-hidden />
              )}
              Save
              {dirty ? (
                <>
                  <span
                    className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary"
                    aria-hidden
                  />
                  <span className="sr-only">(unsaved edits)</span>
                </>
              ) : null}
            </Button>
            <RenderButton
              selectedCount={selectedCount}
              files={files}
              disabled={!readyToFire || busy !== null}
              fireHint={fireHint}
              firing={busy === 'firing'}
              onRender={onRender}
            />
          </Control>
        </>
      ) : null}
    </div>
  );
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/**
 * `Render 4 rows · 12 files`, with the files per ratio on hover. A disabled button takes no
 * pointer, so while it waits it says why in its title instead.
 */
function RenderButton({
  selectedCount,
  files,
  disabled,
  fireHint,
  firing,
  onRender,
}: {
  selectedCount: number;
  files: { total: number; byRatio: Array<[ratio: string, count: number]>; replacements: number };
  disabled: boolean;
  fireHint: string | null;
  firing: boolean;
  onRender: () => void;
}) {
  const button = (
    <Button
      type="button"
      size="sm"
      className="gap-1.5"
      disabled={disabled}
      title={disabled ? (fireHint ?? undefined) : undefined}
      onClick={onRender}
    >
      {firing ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <Play className="size-3.5" aria-hidden />
      )}
      {selectedCount
        ? `Render ${plural(selectedCount, 'row')} · ${plural(files.total, 'file')}`
        : 'Render'}
    </Button>
  );
  if (!selectedCount) return button;
  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent side="bottom" className="font-mono text-2xs tabular-nums">
        {files.byRatio.map(([ratio, count], index) => (
          <Fragment key={ratio}>
            {index > 0 ? <span aria-hidden>·</span> : null}
            <RatioGlyph ratio={ratio} />
            {ratio} ×{count}
          </Fragment>
        ))}
        {files.replacements ? (
          <span>
            {files.byRatio.length ? '· ' : ''}
            {plural(files.replacements, 'ad replacement')}, one file each
          </span>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Which checkpoint of the template this render uses — git's choice between following a branch and
 * checking out a commit. "Follow live" renders whatever is live when the render runs; "Pin" sends
 * the live checkpoint's name, and the preflight refuses if the template's live checkpoint has moved
 * since. A checkpoint that is not live is listed but cannot be picked: the fleet renders one live
 * checkpoint per template, so rendering another one means making it live first.
 */
function CheckpointPicker({
  graph,
  templateRef,
  onChange,
}: {
  graph: CheckpointGraph;
  templateRef: string | null;
  onChange: (ref: string | null) => void;
}) {
  const live = graph.live;
  if (!live) return null;
  const others = graph.rows.filter((row) => !row.live);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="gap-1.5 px-2 text-xs"
            aria-label="Checkpoint"
          >
            <GitCommitHorizontal className="size-3.5" aria-hidden />
            <span className="font-mono">{shortSha(live.id)}</span>
            <span className="text-muted-foreground">{templateRef ? 'pinned' : 'live'}</span>
            <ChevronDown className="size-3.5" aria-hidden />
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="w-80">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-2xs font-normal text-muted-foreground">
            Which checkpoint of this template renders
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={templateRef ?? 'live'}
            onValueChange={(value) => onChange(value === 'live' ? null : value)}
          >
            <DropdownMenuRadioItem value="live">
              Follow live — whatever is live when it renders
            </DropdownMenuRadioItem>
            {graph.liveRef ? (
              <DropdownMenuRadioItem value={graph.liveRef}>
                Pin {live.kind.toLowerCase()} {shortSha(live.id)} — refuse if live moves
              </DropdownMenuRadioItem>
            ) : null}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        {others.length ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-2xs font-normal text-muted-foreground">
                Not live — make one live to render from it
              </DropdownMenuLabel>
              {others.map((row) => (
                <DropdownMenuItem key={row.id} disabled>
                  <span className="truncate">
                    {row.kind}
                    {row.branch ? ` · ${row.branch}` : ''}
                  </span>
                  <span className="ml-auto font-mono text-2xs text-muted-foreground">
                    {shortSha(row.id)}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

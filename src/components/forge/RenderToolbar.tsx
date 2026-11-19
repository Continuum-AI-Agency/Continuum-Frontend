'use client';

import {
  type ApiRenderInputSet,
  type ApiRenderTemplateSummary,
  type ApiRenderVariable,
  isWebTemplateKey,
  motionLabel,
  readableLayerName,
  TEMPLATE_SOURCE_KIND_LABELS,
  type TemplateSourceKind,
  templateDisplayName,
  templateRefOf,
} from '@continuum/contracts';
import { defaultFilter } from 'cmdk';
import {
  Check,
  ChevronDown,
  ClipboardPaste,
  Download,
  Eye,
  FolderOpen,
  GitCommitHorizontal,
  Loader2,
  Play,
  Plus,
  Settings2,
  Sparkles,
  Upload,
} from 'lucide-react';
import { useLocale as useUiLocale, useTranslations as useUiTranslations } from 'next-intl';
import { Fragment, type ReactNode, type Ref, useId, useMemo, useState } from 'react';
import { draftDropTarget, type SelectedFile } from '@/components/forge/AiVariationsDialog';
import { RatioGlyph } from '@/components/forge/RatioGlyph';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { cn } from '@/lib/utils';
import type { CheckpointGraph } from './templateCheckpoints';
import { shortSha } from './templateVersion';

// The Render tab's toolbar: four controls, left to right in the order a person uses them —
// which template, add rows, import rows, and render (edits save themselves; ⌘S saves now). Which
// set the rows belong to is the tab strip over the grid (RenderSetTabs); everything else a row can
// do lives on the row (its hover buttons and menu) or on the selection (the bar under this).

export const templateLabel = (template: ApiRenderTemplateSummary): string =>
  template.displayName ?? templateDisplayName(template.name);

/**
 * Which template, as a searchable list that scrolls: a brand holds dozens, and a menu of dozens has
 * no way to the bottom. Matching reads the name and key only — the value is the REF, and a binding
 * uuid's hex letters would otherwise match almost any search. Highlighting a row, by pointer or
 * arrows, reports it, so its reads can start before the click lands.
 */
export function TemplatePicker({
  templates,
  currentRef,
  placeholder,
  onChange,
  onHighlight,
  sourceKinds = null,
}: {
  templates: ApiRenderTemplateSummary[];
  currentRef: string;
  /**
   * What each template's upload was authored in, by source asset id — null until the registry
   * answers, and until then rows carry no type rather than a guess.
   */
  sourceKinds?: ReadonlyMap<string, TemplateSourceKind> | null;
  /** What the trigger says while nothing is chosen. */
  placeholder: string;
  /** Called with the REF (`bindingId:key`), never a bare key. */
  onChange: (ref: string) => void;
  onHighlight?: (template: ApiRenderTemplateSummary) => void;
}) {
  const translateUi = useUiTranslations('forge');

  const [open, setOpen] = useState(false);
  // Controlled because cmdk only reports a highlight change for a controlled value.
  const [highlighted, setHighlighted] = useState('');
  const byRef = useMemo(
    () => new Map(templates.map((template) => [templateRefOf(template), template])),
    [templates],
  );
  const current = byRef.get(currentRef);
  // Grouped by what each was authored in, in the Templates filter's order. A template with no
  // upload here came from the shared render workspace, which is a fact; one the registry does not
  // know is Other, never After Effects by default. A `web:` key says what it is by itself.
  const groups = useMemo(() => {
    if (!sourceKinds) return [{ heading: null, templates }];
    const order = [...Object.values(TEMPLATE_SOURCE_KIND_LABELS), 'Shared workspace'];
    const byHeading = new Map<string, ApiRenderTemplateSummary[]>();
    for (const template of templates) {
      const kind = isWebTemplateKey(template.key)
        ? 'web_component'
        : template.sourceAssetId
          ? sourceKinds.get(template.sourceAssetId)
          : undefined;
      const heading =
        template.sourceAssetId || kind
          ? TEMPLATE_SOURCE_KIND_LABELS[kind ?? 'other']
          : 'Shared workspace';
      byHeading.set(heading, [...(byHeading.get(heading) ?? []), template]);
    }
    return [...byHeading]
      .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
      .map(([heading, members]) => ({ heading, templates: members }));
  }, [sourceKinds, templates]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={templates.length === 0}
        render={
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-64 justify-between gap-1.5"
            aria-label={translateUi('template_0575f29d')}
          >
            <span className="truncate">{current ? templateLabel(current) : placeholder}</span>
            <ChevronDown className="size-3.5 shrink-0" aria-hidden />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-80 p-0">
        <Command
          filter={(_ref, search, keywords = []) => defaultFilter(keywords.join(' '), search)}
          value={highlighted}
          onValueChange={(ref) => {
            setHighlighted(ref);
            const template = byRef.get(ref);
            if (template) onHighlight?.(template);
          }}
        >
          <CommandInput
            placeholder={translateUi('search_templates_9eb0054d')}
            aria-label={translateUi('search_templates_04b9835b')}
          />
          <CommandList>
            <CommandEmpty>{translateUi('no_template_matches_7e5eeb05')}</CommandEmpty>
            {groups.map(({ heading, templates: members }) => (
              <CommandGroup key={heading ?? 'all'} heading={heading ?? undefined}>
                {/* Keyed and valued by the REF. Two templates can share a key — 133 exists in two
                  sub-apps — and React silently drops the second child of a duplicated key, so a
                  person would see one row where they hold two and render the wrong tenant's comp. */}
                {members.map((template) => {
                  const ref = templateRefOf(template);
                  const facts = [template.ratios.join(' '), motionLabel(template.motion)]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <CommandItem
                      key={ref}
                      value={ref}
                      keywords={[templateLabel(template), template.key, heading ?? '']}
                      onSelect={() => {
                        setOpen(false);
                        onChange(ref);
                      }}
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate">{templateLabel(template)}</span>
                        {facts ? (
                          <span className="truncate text-2xs text-muted-foreground">{facts}</span>
                        ) : null}
                      </span>
                      {/* Null means nobody checked, which must not read as "none missing". */}
                      {template.fontsMissing ? (
                        <Badge variant="warning">
                          {template.fontsMissing} {translateUi('fonts_missing_e24f938e')}
                        </Badge>
                      ) : null}
                      {ref === currentRef ? <Check aria-hidden /> : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

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
  onTemplateHighlight,
  templateSourceKinds,
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
  selectedCount,
  files,
  readyToFire,
  fireHint,
  busy,
  onRender,
  heldLabel,
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
  /** A template the picker is pointing at, before it is chosen — so its reads can start early. */
  onTemplateHighlight?: (template: ApiRenderTemplateSummary) => void;
  templateSourceKinds?: ReadonlyMap<string, TemplateSourceKind> | null;
  /** Open the chosen template's settings on the Templates tab; absent when its source is unknown. */
  onOpenTemplateSettings?: () => void;
  /** The chosen template's binding, so a key held in two of them resolves to the right row. */
  bindingId: string | null;
  /** False until a template's contract is loaded; so are the controls after the picker. */
  ready: boolean;
  inputSets: ApiRenderInputSet[];
  canAddRows: boolean;
  onAddRow: () => void;
  /**
   * Rows from a brief, proposed by the AI — they land in the grid unsaved until kept. `dropped`:
   * files dropped on Add, attached when the draft opens.
   */
  onDraftWithAi: (dropped?: Promise<SelectedFile[]>) => void;
  draftAnchorRef?: Ref<HTMLButtonElement>;
  onAddFromInputs: (set: ApiRenderInputSet) => void;
  /** Layer Show switches no row can change yet; picking one asks for it per row. */
  layerSwitches: ApiRenderVariable[];
  onAskSwitch: (variable: ApiRenderVariable) => void;
  checkpoints?: CheckpointGraph | null;
  templateRef?: string | null;
  onTemplateRefChange?: (ref: string | null) => void;
  onUpload: () => void;
  onDownloadTemplate: () => void;
  dirty: boolean;
  /**
   * What autosave is doing: writing now, written at a time, or failed — with why, and whether it
   * retries by itself or waits for a change or ⌘S. Null while there is nothing saved or to save.
   */
  saveStatus:
    | { phase: 'saving' }
    | { phase: 'saved'; at: string }
    | {
        phase: 'failed';
        reason: string;
        retrying: boolean;
        onRepair?: () => void;
        /** Saves now — what the Save button was, only where a save is stuck. */
        onRetry?: () => void;
      }
    | null;
  selectedCount: number;
  /** Every file the selection renders, and how many of them come out in each ratio. */
  files: { total: number; byRatio: Array<[ratio: string, count: number]>; replacements: number };
  readyToFire: boolean;
  fireHint: string | null;
  busy: 'saving' | 'firing' | null;
  onRender: () => void;
  /** The set holds an unconfirmed render: Render opens it, and says so. */
  heldLabel?: string;
}) {
  const currentUiLocale = useUiLocale();

  const translateUi = useUiTranslations('forge');

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
    <div
      className="flex flex-wrap items-center gap-2"
      role="toolbar"
      data-render-toolbar
      aria-label={translateUi('render_6d89eb7d')}
    >
      <Control className="max-w-full min-w-0 flex-wrap">
        <TemplatePicker
          templates={templates}
          currentRef={currentRef}
          placeholder={
            templatesLoading
              ? translateUi('loading_templates_3800ee71')
              : templates.length
                ? translateUi('choose_a_template_329a8ef3')
                : translateUi('no_renderable_templates_yet_dcf5a1ed')
          }
          onChange={onTemplateChange}
          onHighlight={onTemplateHighlight}
          sourceKinds={templateSourceKinds}
        />
        {checkpoints?.live && onTemplateRefChange ? (
          <CheckpointPicker
            graph={checkpoints}
            templateRef={templateRef ?? null}
            onChange={onTemplateRefChange}
          />
        ) : null}
        {onOpenTemplateSettings ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={translateUi('template_settings_5a053b14')}
                  onClick={onOpenTemplateSettings}
                >
                  <Settings2 className="size-4" aria-hidden />
                </Button>
              }
            />
            <TooltipContent>
              {translateUi('template_settings_layers_variants_r_c56f6bd3')}
            </TooltipContent>
          </Tooltip>
        ) : null}
        {ready && siblings.length > 0 ? (
          <label className="flex items-center gap-1.5 text-xs">
            {' '}
            {translateUi('variant_3f19fe84')}{' '}
            <select
              aria-label={translateUi('template_source_variant_04aa003a')}
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
            {' '}
            {translateUi('artboard_6536eef7')}{' '}
            <select
              aria-label={translateUi('artboard_6536eef7')}
              value={variant === null ? 'mixed:' : variant}
              onChange={(event) => onVariantChange(event.target.value)}
              className="h-8 max-w-56 rounded-md border border-input bg-background px-2 text-xs"
              disabled={busy !== null}
            >
              <option value="">{translateUi('all_artboards_bc5dc688')}</option>
              {variant === null ? (
                <option value="mixed:" disabled>
                  {' '}
                  {translateUi('mixed_selections_0403cf49')}{' '}
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
                    title={translateUi('add_rows_or_drop_files_here_to_draf_b8d62494')}
                    {...draftDropTarget(canAddRows ? onDraftWithAi : null)}
                  >
                    <Plus className="size-3.5" aria-hidden /> {translateUi('add_9fd728c6')}{' '}
                    <ChevronDown className="size-3.5" aria-hidden />
                  </Button>
                }
              />
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem disabled={!canAddRows} onClick={onAddRow}>
                  <Plus aria-hidden /> {translateUi('blank_row_a35c43ee')}{' '}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canAddRows} onClick={() => onDraftWithAi()}>
                  <Sparkles aria-hidden /> {translateUi('draft_with_ai_27ee7657')}{' '}
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger disabled={inputSets.length === 0 || !canAddRows}>
                    <FolderOpen aria-hidden /> {translateUi('from_saved_inputs_2104de04')}{' '}
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
                      <Eye aria-hidden /> {translateUi('switch_a_layer_per_row_621d6fc7')}{' '}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-64">
                      <DropdownMenuGroup>
                        <DropdownMenuLabel className="text-2xs font-normal text-muted-foreground">
                          {' '}
                          {translateUi('adds_a_shown_hidden_column_to_this__1e2fefe5')}{' '}
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
                    <Upload className="size-3.5" aria-hidden /> {translateUi('import_2cff9baa')}{' '}
                    <ChevronDown className="size-3.5" aria-hidden />
                  </Button>
                }
              />
              <DropdownMenuContent align="start" className="w-72">
                <DropdownMenuItem onClick={onUpload}>
                  <Upload aria-hidden /> {translateUi('upload_csv_or_xlsx_f1301fab')}{' '}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDownloadTemplate}>
                  <Download aria-hidden /> {translateUi(
                    'download_spreadsheet_template_be1dfcc7',
                  )}{' '}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="flex gap-1.5 font-normal text-muted-foreground">
                    <ClipboardPaste className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span className="text-2xs">
                      {' '}
                      {translateUi('or_paste_rows_onto_the_grid_copy_a__ef4c25e9')}{' '}
                    </span>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </Control>

          <Control className="ml-auto">
            <span
              role="status"
              aria-label={translateUi('save_status_a371cfda')}
              title={saveStatus?.phase === 'failed' ? saveStatus.reason : undefined}
              className={cn(
                'max-w-96 truncate text-2xs tabular-nums',
                saveStatus?.phase === 'failed' ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {saveStatus?.phase === 'saving'
                ? translateUi('saving_23e39291')
                : saveStatus?.phase === 'failed'
                  ? translateUi('couldn_t_save_value0_value1_e970f1cd', {
                      value0: String(saveStatus.reason),
                      value1: String(saveStatus.retrying ? translateUi('retrying_ad08a5b4') : ''),
                    })
                  : dirty
                    ? translateUi('unsaved_changes_a710c2b9')
                    : saveStatus?.phase === 'saved'
                      ? translateUi('saved_value0_25d8c5ca', {
                          value0: String(
                            formatRelativeTime(saveStatus.at, undefined, currentUiLocale),
                          ),
                        })
                      : null}
            </span>
            {saveStatus?.phase === 'failed' && saveStatus.onRepair ? (
              <Button type="button" size="xs" variant="outline" onClick={saveStatus.onRepair}>
                {' '}
                {translateUi('open_template_42b4387d')}{' '}
              </Button>
            ) : saveStatus?.phase === 'failed' && !saveStatus.retrying && saveStatus.onRetry ? (
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={busy !== null}
                onClick={saveStatus.onRetry}
              >
                {' '}
                {translateUi('retry_save_71fdfa79')}{' '}
              </Button>
            ) : null}
            <RenderButton
              selectedCount={selectedCount}
              files={files}
              disabled={!readyToFire || busy !== null}
              fireHint={fireHint}
              firing={busy === 'firing'}
              onRender={onRender}
              heldLabel={heldLabel}
            />
          </Control>
        </>
      ) : null}
    </div>
  );
}

function CheckpointPicker({
  graph,
  templateRef,
  onChange,
}: {
  graph: CheckpointGraph;
  templateRef: string | null;
  onChange: (ref: string | null) => void;
}) {
  const translateUi = useUiTranslations('forge');

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
            aria-label={translateUi('checkpoint_ee325afd')}
          >
            <GitCommitHorizontal className="size-3.5" aria-hidden />
            <span className="font-mono">{shortSha(live.id)}</span>
            <span className="text-muted-foreground">
              {templateRef ? translateUi('pinned_3fab5c18') : translateUi('live_247610f4')}
            </span>
            <ChevronDown className="size-3.5" aria-hidden />
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="w-80">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-2xs font-normal text-muted-foreground">
            {' '}
            {translateUi('which_checkpoint_of_this_template_r_d9412270')}{' '}
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={templateRef ?? 'live'}
            onValueChange={(value) => onChange(value === 'live' ? null : value)}
          >
            <DropdownMenuRadioItem value="live">
              {' '}
              {translateUi('follow_live_whatever_is_live_when_i_55d24408')}{' '}
            </DropdownMenuRadioItem>
            {graph.liveRef ? (
              <DropdownMenuRadioItem value={graph.liveRef}>
                {' '}
                {translateUi('pin_ff1cee74')} {live.kind.toLowerCase()} {shortSha(live.id)}{' '}
                {translateUi('refuse_if_live_moves_cccf6821')}{' '}
              </DropdownMenuRadioItem>
            ) : null}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        {others.length ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-2xs font-normal text-muted-foreground">
                {' '}
                {translateUi('not_live_make_one_live_to_render_fr_5b92aee4')}{' '}
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

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/**
 * `Render 4 rows · 12 files`, with the files per ratio on hover. A disabled button takes no
 * pointer, so while it waits the reason remains visible beside it.
 */
function RenderButton({
  selectedCount,
  files,
  disabled,
  fireHint,
  firing,
  onRender,
  heldLabel,
}: {
  selectedCount: number;
  files: { total: number; byRatio: Array<[ratio: string, count: number]>; replacements: number };
  disabled: boolean;
  fireHint: string | null;
  firing: boolean;
  onRender: () => void;
  /** The set holds an unconfirmed render: Render opens it, and says so. */
  heldLabel?: string;
}) {
  const translateUi = useUiTranslations('forge');

  const hintId = useId();
  const showHint = disabled && selectedCount > 0 && Boolean(fireHint);
  const button = (
    <Button
      type="button"
      size="sm"
      className="gap-1.5"
      disabled={disabled}
      title={disabled ? (fireHint ?? undefined) : undefined}
      aria-describedby={showHint ? hintId : undefined}
      onClick={onRender}
    >
      {firing ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <Play className="size-3.5" aria-hidden />
      )}
      {heldLabel
        ? heldLabel
        : selectedCount
          ? translateUi('render_value0_value1_efa99af8', {
              value0: String(plural(selectedCount, 'row')),
              value1: String(plural(files.total, 'file')),
            })
          : translateUi('render_6d89eb7d')}
    </Button>
  );
  const content =
    heldLabel || !selectedCount ? (
      button
    ) : (
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
              {plural(files.replacements, 'ad replacement')}
              {translateUi('one_file_each_940efb14')}{' '}
            </span>
          ) : null}
        </TooltipContent>
      </Tooltip>
    );
  return (
    <div className="flex max-w-md flex-col items-start gap-1">
      {content}
      {showHint ? (
        <p id={hintId} role="status" className="text-xs text-muted-foreground">
          {fireHint}
        </p>
      ) : null}
    </div>
  );
}

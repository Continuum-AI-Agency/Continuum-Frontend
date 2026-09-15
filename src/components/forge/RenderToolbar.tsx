'use client';

import {
  type ApiRenderEnvironment,
  type ApiRenderInputSet,
  type ApiRenderTemplateSummary,
  templateDisplayName,
} from '@continuum/contracts';
import {
  ChevronDown,
  ClipboardPaste,
  Download,
  FolderOpen,
  Loader2,
  Play,
  Plus,
  Save,
  Upload,
} from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
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
import { cn } from '@/lib/utils';

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
  templatesLoading,
  onTemplateChange,
  environments,
  bindingId,
  onBindingChange,
  ready,
  inputSets,
  canAddRows,
  onAddRow,
  onAddFromInputs,
  onUpload,
  onDownloadTemplate,
  dirty,
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
  templatesLoading: boolean;
  onTemplateChange: (key: string) => void;
  environments: ApiRenderEnvironment[];
  bindingId: string | null;
  onBindingChange: (bindingId: string) => void;
  /** False until a template's contract is loaded; so are the controls after the picker. */
  ready: boolean;
  inputSets: ApiRenderInputSet[];
  canAddRows: boolean;
  onAddRow: () => void;
  onAddFromInputs: (set: ApiRenderInputSet) => void;
  onUpload: () => void;
  onDownloadTemplate: () => void;
  dirty: boolean;
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
  const current = templates.find((template) => template.key === templateKey);
  const multiEnv = environments.length > 1;
  return (
    <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Render">
      <Control>
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
            <DropdownMenuRadioGroup value={templateKey} onValueChange={onTemplateChange}>
              {templates.map((template) => (
                <DropdownMenuRadioItem key={template.key} value={template.key}>
                  <span className="truncate">{templateLabel(template)}</span>
                  {template.ratios.length ? (
                    <span className="ml-auto text-2xs text-muted-foreground">
                      {template.ratios.join(' ')}
                    </span>
                  ) : null}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            {multiEnv ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Render workspace</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuRadioGroup value={bindingId ?? ''} onValueChange={onBindingChange}>
                      {environments.map((env) => (
                        <DropdownMenuRadioItem key={env.bindingId} value={env.bindingId}>
                          {env.workspace}
                          {env.isDefault ? ' (default)' : ''}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </Control>

      {ready ? (
        <>
          <Control>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button type="button" size="sm" variant="outline" className="gap-1.5">
                    <Plus className="size-3.5" aria-hidden /> Add
                    <ChevronDown className="size-3.5" aria-hidden />
                  </Button>
                }
              />
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem disabled={!canAddRows} onClick={onAddRow}>
                  <Plus aria-hidden /> Blank row
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
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="relative gap-1.5"
              disabled={!canSave || busy !== null}
              title={dirty ? 'Unsaved edits' : 'Saved'}
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

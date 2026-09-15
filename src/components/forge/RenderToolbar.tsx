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
  Copy,
  Download,
  FolderOpen,
  GitFork,
  Loader2,
  Play,
  Plus,
  Save,
  Upload,
} from 'lucide-react';
import type { ReactNode } from 'react';
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
import { cn } from '@/lib/utils';

// The Render tab's toolbar: five controls, left to right in the order a person uses them —
// which template, which set, add rows, import rows, save and render. Everything else a row can
// do lives on the row (its menu) or on the selection (the bar under this).

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
  setMenu,
  inputSets,
  canAddRows,
  canFork,
  canDuplicate,
  onAddRow,
  onForkSelected,
  onDuplicateSelected,
  onAddFromInputs,
  onUpload,
  onDownloadTemplate,
  dirty,
  canSave,
  onSave,
  selectedCount,
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
  /** Null until a template's contract is loaded; so are the controls after it. */
  setMenu: ReactNode;
  inputSets: ApiRenderInputSet[];
  canAddRows: boolean;
  canFork: boolean;
  canDuplicate: boolean;
  onAddRow: () => void;
  onForkSelected: () => void;
  onDuplicateSelected: () => void;
  onAddFromInputs: (set: ApiRenderInputSet) => void;
  onUpload: () => void;
  onDownloadTemplate: () => void;
  dirty: boolean;
  canSave: boolean;
  onSave: () => void;
  selectedCount: number;
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

      {setMenu ? (
        <>
          <Control>{setMenu}</Control>

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
                <DropdownMenuItem disabled={!canFork} onClick={onForkSelected}>
                  <GitFork aria-hidden /> Fork selected
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canDuplicate} onClick={onDuplicateSelected}>
                  <Copy aria-hidden /> Duplicate selected
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
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              disabled={!readyToFire || busy !== null}
              title={fireHint ?? undefined}
              onClick={onRender}
            >
              {busy === 'firing' ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Play className="size-3.5" aria-hidden />
              )}
              Render {selectedCount || ''}
            </Button>
          </Control>
        </>
      ) : null}
    </div>
  );
}

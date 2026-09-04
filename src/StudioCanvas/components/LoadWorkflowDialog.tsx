import { Download, Ellipsis, Pencil, RotateCw, Trash2, X } from 'lucide-react';
import React from 'react';
import { useApplyLibraryWorkflow, WorkflowCard } from '@/components/ai-studio/WorkflowLibrary';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/components/ui/ToastProvider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useWorkflowLibrary } from '@/lib/ai-studio/useWorkflowLibrary';
import {
  deleteAiStudioWorkflowAction,
  listAiStudioWorkflowsAction,
  updateAiStudioWorkflowAction,
} from '@/lib/ai-studio/workflowActions';
import type { AiStudioWorkflow } from '@/lib/schemas/aiStudio';
import type { WorkflowLibraryItem } from '@/lib/schemas/workflowLibrary';
import { useApplyWorkflow } from '../hooks/useApplyWorkflow';
import {
  filterWorkflowsByQuery,
  partitionSavedWorkflows,
  sortPremades,
  sortWorkflowsByRecency,
} from '../utils/workflowList';

const WORKFLOW_VISIBLE_ROWS = 6;
const WORKFLOW_ROW_HEIGHT = 72;

type MutationState =
  | { kind: 'idle' }
  | { kind: 'renaming'; workflowId: string; pendingName: string }
  | { kind: 'confirming-delete'; workflowId: string }
  | { kind: 'deleting'; workflowId: string }
  | { kind: 'saving'; workflowId: string };

const formatTimestamp = (value?: string) => {
  if (!value) return 'Unknown date';
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return 'Unknown date';
  return new Date(timestamp).toLocaleDateString();
};

type LoadWorkflowDialogProps = {
  brandProfileId?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
};

/**
 * The three things a person can reach for, and they are genuinely different kinds.
 *
 * `premade`  — shipped with the product, the same ten for everyone, in their curated order.
 * `saved`    — this brand's own, whole canvases and sub-graph techniques alike.
 * `pipeline` — published for the optimizer to run unattended. A promise, not a template.
 */
type WorkflowTab = 'premade' | 'saved' | 'pipeline';

type WorkflowPanelProps = {
  activeTab: WorkflowTab;
  onTabChange: (tab: WorkflowTab) => void;
  premades: WorkflowLibraryItem[];
  premadesLoading: boolean;
  onUsePremade: (item: WorkflowLibraryItem) => Promise<void> | void;
  pipelines: AiStudioWorkflow[];
  brandProfileId?: string;
  error: string | null;
  filteredWorkflows: AiStudioWorkflow[];
  isLoading: boolean;
  mutationState: MutationState;
  onApplyWorkflow: (workflow: AiStudioWorkflow) => Promise<void> | void;
  onClose?: () => void;
  onDeleteConfirm: (workflowId: string) => Promise<void> | void;
  onDeleteRequest: (workflowId: string) => void;
  onMutationCancel: () => void;
  onQueryChange: (query: string) => void;
  onRefresh: () => void;
  onRenameCommit: (workflowId: string, name: string) => Promise<void> | void;
  onRenameRequest: (workflow: AiStudioWorkflow) => void;
  query: string;
};

function WorkflowRow({
  workflow,
  mutationState,
  onApplyWorkflow,
  onDeleteConfirm,
  onDeleteRequest,
  onMutationCancel,
  onRenameCommit,
  onRenameRequest,
}: {
  workflow: AiStudioWorkflow;
  mutationState: MutationState;
  onApplyWorkflow: (workflow: AiStudioWorkflow) => Promise<void> | void;
  onDeleteConfirm: (workflowId: string) => Promise<void> | void;
  onDeleteRequest: (workflowId: string) => void;
  onMutationCancel: () => void;
  onRenameCommit: (workflowId: string, name: string) => Promise<void> | void;
  onRenameRequest: (workflow: AiStudioWorkflow) => void;
}) {
  const isRenaming = mutationState.kind === 'renaming' && mutationState.workflowId === workflow.id;
  const isConfirmingDelete =
    mutationState.kind === 'confirming-delete' && mutationState.workflowId === workflow.id;
  const isDeleting = mutationState.kind === 'deleting' && mutationState.workflowId === workflow.id;
  const isSaving = mutationState.kind === 'saving' && mutationState.workflowId === workflow.id;

  const renameInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [isRenaming]);

  if (isRenaming || isSaving) {
    const pendingName =
      mutationState.kind === 'renaming' ? mutationState.pendingName : workflow.name;
    return (
      <div className="flex items-center gap-2 px-3 py-2">
        <Input
          ref={renameInputRef}
          defaultValue={pendingName}
          className="h-7 text-xs"
          disabled={isSaving}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              void onRenameCommit(workflow.id, e.currentTarget.value.trim());
            }
            if (e.key === 'Escape') {
              onMutationCancel();
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="default"
          className="h-7 shrink-0 px-2 text-xs"
          disabled={isSaving}
          onClick={(e) => {
            const input = e.currentTarget.previousElementSibling as HTMLInputElement;
            void onRenameCommit(workflow.id, input.value.trim());
          }}
        >
          {isSaving ? 'Saving…' : 'Save'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 shrink-0 px-2 text-xs"
          disabled={isSaving}
          onClick={onMutationCancel}
        >
          Cancel
        </Button>
      </div>
    );
  }

  if (isConfirmingDelete || isDeleting) {
    return (
      <div className="flex flex-col gap-2 px-3 py-2">
        <p className="text-xs text-foreground">
          Delete <span className="font-medium">{workflow.name}</span>? This cannot be undone.
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="destructive"
            className="h-7 px-2 text-xs"
            disabled={isDeleting}
            onClick={() => void onDeleteConfirm(workflow.id)}
          >
            {isDeleting ? 'Deleting…' : 'Delete'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            disabled={isDeleting}
            onClick={onMutationCancel}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex w-full items-start gap-3 px-3 py-2">
      <button
        type="button"
        className="min-w-0 flex-1 text-left transition-colors hover:text-primary"
        onClick={() => void onApplyWorkflow(workflow)}
      >
        <p className="truncate text-sm font-medium text-primary">{workflow.name}</p>
        {workflow.description && (
          <p className="truncate text-xs text-secondary">{workflow.description}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Updated {formatTimestamp(workflow.updatedAt ?? workflow.createdAt)}
        </p>
      </button>

      <div className="mt-1 flex shrink-0 items-center gap-1">
        <span className="rounded border border-border/70 px-2 py-0.5 text-2xs font-medium text-muted-foreground">
          Load
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                aria-label={`Options for ${workflow.name}`}
                onClick={(e) => e.stopPropagation()}
              >
                <Ellipsis className="h-3.5 w-3.5" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onSelect={() => onRenameRequest(workflow)}>
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => onDeleteRequest(workflow.id)}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function WorkflowPanel({
  activeTab,
  onTabChange,
  premades,
  premadesLoading,
  onUsePremade,
  pipelines,
  brandProfileId,
  error,
  filteredWorkflows,
  isLoading,
  mutationState,
  onApplyWorkflow,
  onClose,
  onDeleteConfirm,
  onDeleteRequest,
  onMutationCancel,
  onQueryChange,
  onRefresh,
  onRenameCommit,
  onRenameRequest,
  query,
}: WorkflowPanelProps) {
  // Search applies to whichever list is on screen; a query that filters the tab you are not
  // looking at is how a tab reads as empty when it is not.
  const rows = React.useMemo(
    () => (activeTab === 'pipeline' ? filterWorkflowsByQuery(pipelines, query) : filteredWorkflows),
    [activeTab, filteredWorkflows, pipelines, query],
  );
  const savedCount = filteredWorkflows.length;

  return (
    <div className="grid gap-3 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-primary">My Workflows</p>
          <p className="text-xs text-muted-foreground">
            {activeTab === 'premade'
              ? 'Templates that ship with Continuum — load one and make it yours.'
              : activeTab === 'pipeline'
                ? 'Published for the optimizer to run on its own.'
                : 'Your saved workflows — search, load, rename, or delete.'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onRefresh}
            disabled={!brandProfileId || isLoading}
            aria-label="Refresh workflows"
            title={
              !brandProfileId ? 'Select a brand profile to load workflows.' : 'Refresh workflows'
            }
          >
            <RotateCw className="h-4 w-4" />
          </Button>
          {onClose && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onClose}
              aria-label="Close workflow loader"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as WorkflowTab)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="premade" className="text-xs">
            Pre-mades
          </TabsTrigger>
          <TabsTrigger value="saved" className="text-xs">
            Saved{savedCount > 0 ? ` (${savedCount})` : ''}
          </TabsTrigger>
          <TabsTrigger value="pipeline" className="text-xs">
            Pipelines{pipelines.length > 0 ? ` (${pipelines.length})` : ''}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {activeTab === 'premade' ? (
        <PremadeGrid items={premades} isLoading={premadesLoading} onUse={onUsePremade} />
      ) : (
        <>
          <Input
            placeholder={
              activeTab === 'pipeline' ? 'Search your pipelines…' : 'Search your saved workflows…'
            }
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            disabled={!brandProfileId}
          />

          {!brandProfileId && (
            <p className="text-xs text-muted-foreground">
              Select a brand profile to see your saved workflows.
            </p>
          )}
          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="overflow-hidden rounded-md border border-subtle bg-surface">
            <ScrollArea style={{ height: `${WORKFLOW_VISIBLE_ROWS * WORKFLOW_ROW_HEIGHT}px` }}>
              {isLoading ? (
                <div className="p-3 text-xs text-secondary">Loading workflows…</div>
              ) : rows.length === 0 ? (
                <EmptyState tab={activeTab} query={query} />
              ) : (
                <div className="divide-y divide-border/70">
                  {rows.map((workflow) => (
                    <WorkflowRow
                      key={workflow.id}
                      workflow={workflow}
                      mutationState={mutationState}
                      onApplyWorkflow={onApplyWorkflow}
                      onDeleteConfirm={onDeleteConfirm}
                      onDeleteRequest={onDeleteRequest}
                      onMutationCancel={onMutationCancel}
                      onRenameCommit={onRenameCommit}
                      onRenameRequest={onRenameRequest}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * What an empty tab says. Each one names the action that fills it — "nothing here" with no
 * way forward is the state people screenshot and send to support.
 */
function EmptyState({ tab, query }: { tab: WorkflowTab; query: string }) {
  if (query) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
        <Download className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm font-medium text-muted-foreground">Nothing matches “{query}”</p>
        <p className="text-xs text-muted-foreground">Try a different name.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      <Download className="h-8 w-8 text-muted-foreground/40" />
      <p className="text-sm font-medium text-muted-foreground">
        {tab === 'pipeline' ? 'No pipelines published yet' : 'No saved workflows yet'}
      </p>
      <p className="text-xs text-muted-foreground">
        {tab === 'pipeline'
          ? 'Build a canvas, leave an input unwired, then Save → Pipeline. The optimizer can run what you publish here.'
          : 'Build a workflow in the canvas and save it to see it here.'}
      </p>
    </div>
  );
}

/** The pre-mades, with the mini-canvas preview the Templates popover used. */
function PremadeGrid({
  items,
  isLoading,
  onUse,
}: {
  items: WorkflowLibraryItem[];
  isLoading: boolean;
  onUse: (item: WorkflowLibraryItem) => Promise<void> | void;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-subtle bg-surface">
      <ScrollArea style={{ height: `${WORKFLOW_VISIBLE_ROWS * WORKFLOW_ROW_HEIGHT}px` }}>
        {isLoading ? (
          <div className="p-3 text-xs text-secondary">Loading templates…</div>
        ) : items.length === 0 ? (
          <div className="p-3 text-xs text-secondary">No templates available.</div>
        ) : (
          <div className="grid gap-3 p-3">
            {items.map((item) => (
              <WorkflowCard key={item.id} item={item} onUse={onUse} />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

export function LoadWorkflowDialog({
  brandProfileId,
  open,
  onOpenChange,
  showTrigger = true,
}: LoadWorkflowDialogProps) {
  const applyWorkflowToCanvas = useApplyWorkflow();
  const { show } = useToast();
  const [internalOpen, setInternalOpen] = React.useState(false);
  const [workflows, setWorkflows] = React.useState<AiStudioWorkflow[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  // Pre-mades first: someone opening this without having saved anything should land on the
  // tab that has something in it, not on their own empty shelf.
  const [activeTab, setActiveTab] = React.useState<WorkflowTab>('premade');
  const [mutationState, setMutationState] = React.useState<MutationState>({ kind: 'idle' });
  const isOpen = open ?? internalOpen;

  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (open === undefined) {
        setInternalOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [onOpenChange, open],
  );

  const fetchWorkflows = React.useCallback(async () => {
    if (!brandProfileId) {
      setWorkflows([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await listAiStudioWorkflowsAction(brandProfileId);
      setWorkflows(sortWorkflowsByRecency(result));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load workflows';
      setError(message);
      show({ title: 'Load failed', description: message, variant: 'error' });
    } finally {
      setIsLoading(false);
    }
  }, [brandProfileId, show]);

  React.useEffect(() => {
    if (isOpen) {
      void fetchWorkflows();
    }
  }, [fetchWorkflows, isOpen]);

  // A published pipeline leaves the saved list — see partitionSavedWorkflows for why showing
  // it twice makes the third tab meaningless.
  const { saved, pipelines } = React.useMemo(() => partitionSavedWorkflows(workflows), [workflows]);

  const filteredWorkflows = React.useMemo(
    () => filterWorkflowsByQuery(saved, query),
    [query, saved],
  );

  // Fetched only while the panel is open, and cached for 30 minutes by the query — the ten
  // templates are the same for everyone and change about never.
  const library = useWorkflowLibrary({ enabled: isOpen });
  const premades = React.useMemo(() => sortPremades(library.items), [library.items]);
  const applyLibraryWorkflow = useApplyLibraryWorkflow();

  const usePremade = React.useCallback(
    async (item: WorkflowLibraryItem) => {
      await applyLibraryWorkflow(item);
      setOpen(false);
    },
    [applyLibraryWorkflow, setOpen],
  );

  const applyWorkflow = React.useCallback(
    async (workflow: AiStudioWorkflow) => {
      await applyWorkflowToCanvas(workflow);
      setOpen(false);
    },
    [applyWorkflowToCanvas, setOpen],
  );

  const handleRenameRequest = React.useCallback((workflow: AiStudioWorkflow) => {
    setMutationState({ kind: 'renaming', workflowId: workflow.id, pendingName: workflow.name });
  }, []);

  const handleRenameCommit = React.useCallback(
    async (workflowId: string, name: string) => {
      if (!brandProfileId) return;
      const trimmed = name.trim();
      if (!trimmed) return;

      setMutationState({ kind: 'saving', workflowId });
      try {
        await updateAiStudioWorkflowAction({ brandProfileId, workflowId, name: trimmed });
        show({ title: 'Workflow renamed', description: trimmed, variant: 'success' });
        setMutationState({ kind: 'idle' });
        void fetchWorkflows();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Rename failed';
        show({ title: 'Rename failed', description: message, variant: 'error' });
        setMutationState({ kind: 'idle' });
      }
    },
    [brandProfileId, fetchWorkflows, show],
  );

  const handleDeleteRequest = React.useCallback((workflowId: string) => {
    setMutationState({ kind: 'confirming-delete', workflowId });
  }, []);

  const handleDeleteConfirm = React.useCallback(
    async (workflowId: string) => {
      if (!brandProfileId) return;

      setMutationState({ kind: 'deleting', workflowId });
      try {
        await deleteAiStudioWorkflowAction({ brandProfileId, workflowId });
        show({ title: 'Workflow deleted', variant: 'success' });
        setMutationState({ kind: 'idle' });
        void fetchWorkflows();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Delete failed';
        show({ title: 'Delete failed', description: message, variant: 'error' });
        setMutationState({ kind: 'idle' });
      }
    },
    [brandProfileId, fetchWorkflows, show],
  );

  const handleMutationCancel = React.useCallback(() => {
    setMutationState({ kind: 'idle' });
  }, []);

  const panelProps: WorkflowPanelProps = {
    activeTab,
    onTabChange: setActiveTab,
    premades,
    premadesLoading: library.isLoading,
    onUsePremade: usePremade,
    pipelines,
    brandProfileId,
    error,
    filteredWorkflows,
    isLoading,
    mutationState,
    onApplyWorkflow: applyWorkflow,
    onClose: () => setOpen(false),
    onDeleteConfirm: handleDeleteConfirm,
    onDeleteRequest: handleDeleteRequest,
    onMutationCancel: handleMutationCancel,
    onQueryChange: setQuery,
    onRefresh: () => {
      void fetchWorkflows();
    },
    onRenameCommit: handleRenameCommit,
    onRenameRequest: handleRenameRequest,
    query,
  };

  if (!showTrigger) {
    if (!isOpen) return null;
    return (
      <div className="fixed right-4 top-20 z-[120] w-[clamp(340px,85vw,500px)] rounded-md border bg-popover text-popover-foreground shadow-lg">
        <WorkflowPanel {...panelProps} />
      </div>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" /> My Workflows
          </Button>
        }
      />
      <PopoverContent align="end" className="w-[clamp(340px,85vw,500px)] p-0">
        <WorkflowPanel {...panelProps} />
      </PopoverContent>
    </Popover>
  );
}

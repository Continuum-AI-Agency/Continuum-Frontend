import React from 'react';
import { Cross2Icon, DotsHorizontalIcon, DownloadIcon, Pencil1Icon, ReloadIcon, TrashIcon } from '@radix-ui/react-icons';
import { useReactFlow } from '@xyflow/react';
import type { Edge } from '@xyflow/react';
import type { StudioNode } from '../types';

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
import {
  listAiStudioWorkflowsAction,
  updateAiStudioWorkflowAction,
  deleteAiStudioWorkflowAction,
} from '@/lib/ai-studio/workflowActions';
import type { AiStudioWorkflow } from '@/lib/schemas/aiStudio';
import { useStudioStore } from '../stores/useStudioStore';
import { normalizeWorkflowSnapshot } from '../utils/workflowSerialization';
import { filterWorkflowsByQuery, sortWorkflowsByRecency } from '../utils/workflowList';
import { rehydrateWorkflowMediaNodes } from '../utils/rehydrateWorkflowMedia';

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

type WorkflowPanelProps = {
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
  const isConfirmingDelete = mutationState.kind === 'confirming-delete' && mutationState.workflowId === workflow.id;
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
    const pendingName = mutationState.kind === 'renaming' ? mutationState.pendingName : workflow.name;
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
        {workflow.description && <p className="truncate text-xs text-secondary">{workflow.description}</p>}
        <p className="text-[11px] text-muted-foreground">
          Updated {formatTimestamp(workflow.updatedAt ?? workflow.createdAt)}
        </p>
      </button>

      <div className="mt-1 flex shrink-0 items-center gap-1">
        <span className="rounded border border-border/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          Load
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
              aria-label={`Options for ${workflow.name}`}
              onClick={(e) => e.stopPropagation()}
            >
              <DotsHorizontalIcon className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem
              onSelect={() => onRenameRequest(workflow)}
            >
              <Pencil1Icon className="mr-2 h-3.5 w-3.5" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => onDeleteRequest(workflow.id)}
            >
              <TrashIcon className="mr-2 h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function WorkflowPanel({
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
  return (
    <div className="grid gap-3 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-primary">My Workflows</p>
          <p className="text-xs text-muted-foreground">Your saved workflows — search, load, rename, or delete.</p>
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
          >
            <ReloadIcon className="h-4 w-4" />
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
              <Cross2Icon className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <Input
        placeholder="Search your saved workflows…"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        disabled={!brandProfileId}
      />

      {!brandProfileId && <p className="text-xs text-muted-foreground">Select a brand profile to see your saved workflows.</p>}
      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="overflow-hidden rounded-md border border-subtle bg-surface">
        <ScrollArea style={{ height: `${WORKFLOW_VISIBLE_ROWS * WORKFLOW_ROW_HEIGHT}px` }}>
          {isLoading ? (
            <div className="p-3 text-xs text-secondary">Loading workflows…</div>
          ) : filteredWorkflows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 px-4 text-center">
              <DownloadIcon className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">No saved workflows yet</p>
              <p className="text-xs text-muted-foreground">
                {query
                  ? 'No workflows match your search. Try a different name.'
                  : 'Build a workflow in the canvas and save it to see it here.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/70">
              {filteredWorkflows.map((workflow) => (
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
    </div>
  );
}

export function LoadWorkflowDialog({
  brandProfileId,
  open,
  onOpenChange,
  showTrigger = true,
}: LoadWorkflowDialogProps) {
  const { setNodes, setEdges, takeSnapshot, defaultEdgeType } = useStudioStore();
  const { fitView } = useReactFlow();
  const { show } = useToast();
  const [internalOpen, setInternalOpen] = React.useState(false);
  const [workflows, setWorkflows] = React.useState<AiStudioWorkflow[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const [mutationState, setMutationState] = React.useState<MutationState>({ kind: 'idle' });
  const isOpen = open ?? internalOpen;

  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (open === undefined) {
        setInternalOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [onOpenChange, open]
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

  const filteredWorkflows = React.useMemo(() => filterWorkflowsByQuery(workflows, query), [query, workflows]);

  const applyWorkflow = React.useCallback(
    async (workflow: AiStudioWorkflow) => {
      const snapshot = normalizeWorkflowSnapshot(
        { nodes: (workflow.nodes ?? []) as unknown as StudioNode[], edges: (workflow.edges ?? []) as unknown as Edge[] },
        defaultEdgeType
      );
      const hydratedNodes = await rehydrateWorkflowMediaNodes(snapshot.nodes);

      takeSnapshot();
      setNodes(hydratedNodes);
      setEdges(snapshot.edges);
      requestAnimationFrame(() => {
        fitView({ padding: 0.2, duration: 300 });
      });

      show({ title: 'Workflow loaded', description: workflow.name, variant: 'success' });
      setOpen(false);
    },
    [defaultEdgeType, fitView, setEdges, setNodes, setOpen, show, takeSnapshot]
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
    [brandProfileId, fetchWorkflows, show]
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
    [brandProfileId, fetchWorkflows, show]
  );

  const handleMutationCancel = React.useCallback(() => {
    setMutationState({ kind: 'idle' });
  }, []);

  const panelProps: WorkflowPanelProps = {
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
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <DownloadIcon className="mr-2 h-4 w-4" /> My Workflows
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[clamp(340px,85vw,500px)] p-0">
        <WorkflowPanel {...panelProps} />
      </PopoverContent>
    </Popover>
  );
}

import React from 'react';
import { Cross2Icon, DownloadIcon, ReloadIcon } from '@radix-ui/react-icons';
import { useReactFlow } from '@xyflow/react';
import type { Edge } from '@xyflow/react';
import type { StudioNode } from '../types';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/components/ui/ToastProvider';
import { listAiStudioWorkflowsAction } from '@/lib/ai-studio/workflowActions';
import type { AiStudioWorkflow } from '@/lib/schemas/aiStudio';
import { useStudioStore } from '../stores/useStudioStore';
import { normalizeWorkflowSnapshot } from '../utils/workflowSerialization';
import { filterWorkflowsByQuery, sortWorkflowsByRecency } from '../utils/workflowList';
import { rehydrateWorkflowMediaNodes } from '../utils/rehydrateWorkflowMedia';

const WORKFLOW_VISIBLE_ROWS = 6;
const WORKFLOW_ROW_HEIGHT = 72;

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
  onApplyWorkflow: (workflow: AiStudioWorkflow) => Promise<void> | void;
  onClose?: () => void;
  onQueryChange: (query: string) => void;
  onRefresh: () => void;
  query: string;
};

function WorkflowPanel({
  brandProfileId,
  error,
  filteredWorkflows,
  isLoading,
  onApplyWorkflow,
  onClose,
  onQueryChange,
  onRefresh,
  query,
}: WorkflowPanelProps) {
  return (
    <div className="grid gap-3 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-primary">Load workflow</p>
          <p className="text-xs text-muted-foreground">Top workflows first. Search and scroll for the full list.</p>
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
        placeholder="Search saved workflows"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        disabled={!brandProfileId}
      />

      {!brandProfileId && <p className="text-xs text-muted-foreground">Select a brand profile to load saved workflows.</p>}
      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="overflow-hidden rounded-md border border-subtle bg-surface">
        <ScrollArea style={{ height: `${WORKFLOW_VISIBLE_ROWS * WORKFLOW_ROW_HEIGHT}px` }}>
          {isLoading ? (
            <div className="p-3 text-xs text-secondary">Loading workflows...</div>
          ) : filteredWorkflows.length === 0 ? (
            <div className="p-3 text-xs text-secondary">No saved workflows yet.</div>
          ) : (
            <div className="divide-y divide-border/70">
              {filteredWorkflows.map((workflow) => (
                <button
                  key={workflow.id}
                  type="button"
                  className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-accent/50"
                  onClick={() => {
                    void onApplyWorkflow(workflow);
                  }}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-primary">{workflow.name}</p>
                    {workflow.description && <p className="truncate text-xs text-secondary">{workflow.description}</p>}
                    <p className="text-[11px] text-muted-foreground">
                      Updated {formatTimestamp(workflow.updatedAt ?? workflow.createdAt)}
                    </p>
                  </div>
                  <span className="mt-1 rounded border border-border/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    Load
                  </span>
                </button>
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

  const panelProps: WorkflowPanelProps = {
    brandProfileId,
    error,
    filteredWorkflows,
    isLoading,
    onApplyWorkflow: applyWorkflow,
    onClose: () => setOpen(false),
    onQueryChange: setQuery,
    onRefresh: () => {
      void fetchWorkflows();
    },
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
          <DownloadIcon className="mr-2 h-4 w-4" /> Load
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[clamp(340px,85vw,500px)] p-0">
        <WorkflowPanel {...panelProps} />
      </PopoverContent>
    </Popover>
  );
}

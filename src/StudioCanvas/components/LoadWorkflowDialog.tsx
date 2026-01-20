import React from 'react';
import { DownloadIcon, ReloadIcon } from '@radix-ui/react-icons';
import { useReactFlow } from '@xyflow/react';
import type { Edge } from '@xyflow/react';
import type { StudioNode } from '../types';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/ToastProvider';
import { listAiStudioWorkflowsAction } from '@/lib/ai-studio/workflowActions';
import type { AiStudioWorkflow } from '@/lib/schemas/aiStudio';
import { useStudioStore } from '../stores/useStudioStore';
import { normalizeWorkflowSnapshot } from '../utils/workflowSerialization';

const formatTimestamp = (value?: string) => {
  if (!value) return 'Unknown date';
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return 'Unknown date';
  return new Date(timestamp).toLocaleDateString();
};

type LoadWorkflowDialogProps = {
  brandProfileId?: string;
};

export function LoadWorkflowDialog({ brandProfileId }: LoadWorkflowDialogProps) {
  const { setNodes, setEdges, takeSnapshot, defaultEdgeType } = useStudioStore();
  const { fitView } = useReactFlow();
  const { show } = useToast();
  const [open, setOpen] = React.useState(false);
  const [workflows, setWorkflows] = React.useState<AiStudioWorkflow[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');

  const fetchWorkflows = React.useCallback(async () => {
    if (!brandProfileId) {
      setWorkflows([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await listAiStudioWorkflowsAction(brandProfileId);
      setWorkflows(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load workflows';
      setError(message);
      show({ title: 'Load failed', description: message, variant: 'error' });
    } finally {
      setIsLoading(false);
    }
  }, [brandProfileId, show]);

  React.useEffect(() => {
    if (open) {
      fetchWorkflows();
    }
  }, [open, fetchWorkflows]);

  const filteredWorkflows = React.useMemo(() => {
    if (!query.trim()) return workflows;
    const normalized = query.toLowerCase();
    return workflows.filter((workflow) => workflow.name.toLowerCase().includes(normalized));
  }, [query, workflows]);

  const applyWorkflow = React.useCallback(
    (workflow: AiStudioWorkflow) => {
      const snapshot = normalizeWorkflowSnapshot(
        { nodes: (workflow.nodes ?? []) as unknown as StudioNode[], edges: (workflow.edges ?? []) as unknown as Edge[] },
        defaultEdgeType
      );

      takeSnapshot();
      setNodes(snapshot.nodes);
      setEdges(snapshot.edges);
      requestAnimationFrame(() => {
        fitView({ padding: 0.2, duration: 300 });
      });

      show({ title: 'Workflow loaded', description: workflow.name, variant: 'success' });
      setOpen(false);
    },
    [defaultEdgeType, fitView, setEdges, setNodes, show, takeSnapshot]
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <DownloadIcon className="w-4 h-4 mr-2" /> Load
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Load workflow</DialogTitle>
          <DialogDescription>
            Reuse a saved workflow template for this brand.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search saved workflows"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              disabled={!brandProfileId}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={fetchWorkflows}
              disabled={!brandProfileId || isLoading}
              aria-label="Refresh workflows"
            >
              <ReloadIcon className="w-4 h-4" />
            </Button>
          </div>

          {!brandProfileId && (
            <p className="text-xs text-muted-foreground">
              Select a brand profile to load saved workflows.
            </p>
          )}

          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="grid gap-2 max-h-56 overflow-y-auto">
            {isLoading ? (
              <div className="text-xs text-secondary">Loading workflows...</div>
            ) : filteredWorkflows.length === 0 ? (
              <div className="text-xs text-secondary">No saved workflows yet.</div>
            ) : (
              filteredWorkflows.map((workflow) => (
                <div
                  key={workflow.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-subtle bg-surface px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-primary truncate">{workflow.name}</div>
                    {workflow.description && (
                      <div className="text-xs text-secondary truncate">{workflow.description}</div>
                    )}
                    <div className="text-[11px] text-muted-foreground">
                      Updated {formatTimestamp(workflow.updatedAt ?? workflow.createdAt)}
                    </div>
                  </div>
                  <Button type="button" size="sm" onClick={() => applyWorkflow(workflow)}>
                    Load
                  </Button>
                </div>
              ))
            )}
          </div>

        </div>

        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

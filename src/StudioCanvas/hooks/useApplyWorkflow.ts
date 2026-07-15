'use client';

// Re-applies a saved workflow/starter graph onto the live canvas. The single apply
// path shared by the Load-workflow dialog and the composer's starter picker, so the
// two never drift on how a saved recipe is rehydrated — edge normalization, media
// URL re-signing, undo snapshot, and fit-to-view.

import type { Edge } from '@xyflow/react';
import { useReactFlow } from '@xyflow/react';
import { useCallback } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import type { AiStudioWorkflow } from '@/lib/schemas/aiStudio';
import { useStudioStore } from '../stores/useStudioStore';
import type { StudioNode } from '../types';
import { rehydrateWorkflowMediaNodes } from '../utils/rehydrateWorkflowMedia';
import { normalizeWorkflowSnapshot } from '../utils/workflowSerialization';

export function useApplyWorkflow() {
  const { setNodes, setEdges, takeSnapshot, defaultEdgeType } = useStudioStore();
  const { fitView } = useReactFlow();
  const { show } = useToast();

  return useCallback(
    async (workflow: AiStudioWorkflow, options?: { toastTitle?: string }) => {
      const snapshot = normalizeWorkflowSnapshot(
        {
          nodes: (workflow.nodes ?? []) as unknown as StudioNode[],
          edges: (workflow.edges ?? []) as unknown as Edge[],
        },
        defaultEdgeType,
      );
      const hydratedNodes = await rehydrateWorkflowMediaNodes(snapshot.nodes);

      takeSnapshot();
      setNodes(hydratedNodes);
      setEdges(snapshot.edges);
      requestAnimationFrame(() => {
        fitView({ padding: 0.2, duration: 300 });
      });

      show({
        title: options?.toastTitle ?? 'Workflow loaded',
        description: workflow.name,
        variant: 'success',
      });
    },
    [defaultEdgeType, fitView, setEdges, setNodes, show, takeSnapshot],
  );
}

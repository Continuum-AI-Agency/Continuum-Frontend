'use client';

// Re-applies a saved workflow/starter graph onto the live canvas. The single apply
// path shared by the Load-workflow dialog and the composer's starter picker, so the
// two never drift on how a saved recipe is rehydrated — edge normalization, media
// URL re-signing, undo snapshot, and fit-to-view.

import { mergeGraphs, type WorkflowGraph } from '@continuum/contracts';
import type { Edge } from '@xyflow/react';
import { useReactFlow } from '@xyflow/react';
import { useCallback } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import type { AiStudioWorkflow } from '@/lib/schemas/aiStudio';
import { useStudioStore } from '../stores/useStudioStore';
import type { StudioNode } from '../types';
import { STUDIO_FIT_VIEW_OPTIONS } from '../utils/fitViewOptions';
import { namespaceWorkflowSnapshot } from '../utils/namespaceWorkflowSnapshot';
import { rehydrateWorkflowMediaNodes } from '../utils/rehydrateWorkflowMedia';
import { normalizeWorkflowSnapshot } from '../utils/workflowSerialization';

export function useApplyWorkflow() {
  const { setNodes, setEdges, takeSnapshot, triggerSave, defaultEdgeType } = useStudioStore();
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
      const hydratedNodes = await rehydrateWorkflowMediaNodes(
        snapshot.nodes,
        undefined,
        useStudioStore.getState().brandId,
      );
      const namespaced = namespaceWorkflowSnapshot(
        { nodes: hydratedNodes, edges: snapshot.edges },
        `module:${crypto.randomUUID()}`,
      );
      const current = useStudioStore.getState();
      const merged = mergeGraphs(
        {
          nodes: current.nodes,
          edges: current.edges,
        } as WorkflowGraph,
        {
          nodes: namespaced.nodes,
          edges: namespaced.edges,
          metadata: {
            workflowModule: {
              version: 1,
              sourceWorkflowId: workflow.id,
              label: workflow.name,
              nodeIds: namespaced.nodes.map((node) => node.id),
            },
          },
        } as WorkflowGraph,
      );

      takeSnapshot();
      setNodes(merged.nodes as StudioNode[]);
      setEdges(merged.edges as Edge[]);
      triggerSave();
      requestAnimationFrame(() => {
        fitView({ ...STUDIO_FIT_VIEW_OPTIONS, duration: 300 });
      });

      show({
        title: options?.toastTitle ?? 'Workflow module added',
        description: `${workflow.name} was expanded into ${namespaced.nodes.length} editable nodes.`,
        variant: 'success',
      });
    },
    [defaultEdgeType, fitView, setEdges, setNodes, show, takeSnapshot, triggerSave],
  );
}

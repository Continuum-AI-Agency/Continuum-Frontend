import { useEffect, useRef } from 'react';

import { inlineRemoteImage } from '@/lib/ai-studio/inlineRemoteImage';
import type { PlannerAiStudioHandoff } from '@/lib/organic/ai-studio-bridge';
import { useStudioStore } from '../stores/useStudioStore';
import { inlineReferenceImageNodes } from '../utils/inlineReferenceImageNodes';
import { buildStarterFlow } from '../utils/seedStarterFlow';

// A Planner handoff seeds the canvas ONCE per room+draft, and only into an empty
// canvas — a seed that overwrote existing work would eat the user's flow. The ref
// key is what makes a re-render, a save round-trip or a room switch back idempotent.
export function usePlannerSeedHydration({
  organicPlannerSeed,
  activeRoomId,
  isLoading,
}: {
  organicPlannerSeed?: PlannerAiStudioHandoff | null;
  activeRoomId?: string;
  isLoading: boolean;
}): void {
  const { nodes, edges, setNodes, setEdges, takeSnapshot, triggerSave, updateNodeData } =
    useStudioStore();
  const hydratedPlannerSeedRef = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!organicPlannerSeed) return;
    if (nodes.length > 0 || edges.length > 0) return;

    const roomScope = activeRoomId ?? 'default-room';
    const hydrationKey = `${roomScope}:${organicPlannerSeed.draftId}`;
    if (hydratedPlannerSeedRef.current === hydrationKey) return;
    const starter = buildStarterFlow(organicPlannerSeed);

    takeSnapshot();
    setNodes(starter.nodes);
    setEdges(starter.edges);
    triggerSave();
    hydratedPlannerSeedRef.current = hydrationKey;

    // Load the Library/planner seed image into the node as inline base64 (like an
    // upload), so it reaches the generation model and survives a save+reload via
    // re-hydration. Mirrors the unfurl drop path; runs in the background with a
    // per-node processing/ready status.
    void inlineReferenceImageNodes(starter.nodes, {
      inline: inlineRemoteImage,
      updateNodeData,
    });
  }, [
    activeRoomId,
    edges.length,
    isLoading,
    nodes.length,
    organicPlannerSeed,
    setEdges,
    setNodes,
    takeSnapshot,
    triggerSave,
    updateNodeData,
  ]);
}

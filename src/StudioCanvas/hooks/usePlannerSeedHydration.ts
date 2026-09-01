import type { Edge } from '@xyflow/react';
import { useEffect, useRef } from 'react';
import { inlineRemoteImage } from '@/lib/ai-studio/inlineRemoteImage';
import type { PlannerAiStudioHandoff } from '@/lib/organic/ai-studio-bridge';
import { useStudioStore } from '../stores/useStudioStore';
import type { StudioNode } from '../types';
import { inlineReferenceImageNodes } from '../utils/inlineReferenceImageNodes';
import { mergeSeedIntoGraph } from '../utils/mergeSeedIntoGraph';
import { buildStarterFlow, offsetSeedBelow } from '../utils/seedStarterFlow';

// A Planner handoff APPENDS its starter flow to the room the user lands in.
//
// It used to seed only into an empty canvas, to avoid eating the user's work. That
// guard is what Airtable #307 reported: the planner link carries no roomId, so the
// page resolves the user's LAST-VIEWED room, realtime loads that room's saved graph
// into the store, and a non-empty store made this hook return — no seed, no error,
// no toast. "I just go to whatever I had done previously" is that early return.
// Filings #195 and #256 both improved what the seed CONTAINS and never reached this
// line, which is why the same seam has now been filed three times.
//
// Appending keeps the concern the guard was protecting: nothing is dropped,
// reordered or overwritten (mergeSeedIntoGraph is append-only), and the seed's node
// ids are deterministic and draft-scoped, so re-opening the same draft adds nothing
// rather than stamping a duplicate flow onto live work. `isLoading` still gates the
// whole effect — it is what orders the append AFTER the room's own graph has
// loaded; without it the merge would run against an empty store and autosave a
// graph that has just erased the room.
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

    const roomScope = activeRoomId ?? 'default-room';
    const hydrationKey = `${roomScope}:${organicPlannerSeed.draftId}`;
    if (hydratedPlannerSeedRef.current === hydrationKey) return;

    const starter = offsetSeedBelow(buildStarterFlow(organicPlannerSeed), nodes);
    const merged = mergeSeedIntoGraph({ nodes, edges }, starter);
    // Claim the key before the write: a re-render triggered by setNodes must not
    // re-enter, and a seed already present in the room must not keep re-checking.
    hydratedPlannerSeedRef.current = hydrationKey;

    // Already in this room — a reload, or a second visit to the same draft. There is
    // nothing to add and nothing to save; writing anyway would burn a revision and
    // make the idempotency claim unprovable at the persisted row.
    if (merged.nodes.length === nodes.length && merged.edges.length === edges.length) return;

    takeSnapshot();
    setNodes(merged.nodes as StudioNode[]);
    setEdges(merged.edges as Edge[]);
    triggerSave();

    // Load the Library/planner seed image into the node as inline base64 (like an
    // upload), so it reaches the generation model and survives a save+reload via
    // re-hydration. Mirrors the unfurl drop path; runs in the background with a
    // per-node processing/ready status. Only the seeded nodes are handed over —
    // the room's pre-existing nodes were already inlined when they were created.
    void inlineReferenceImageNodes(starter.nodes, {
      inline: inlineRemoteImage,
      updateNodeData,
    });
  }, [
    activeRoomId,
    edges,
    isLoading,
    nodes,
    organicPlannerSeed,
    setEdges,
    setNodes,
    takeSnapshot,
    triggerSave,
    updateNodeData,
  ]);
}

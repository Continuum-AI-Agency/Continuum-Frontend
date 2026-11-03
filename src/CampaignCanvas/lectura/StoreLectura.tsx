'use client';

import { useMemo } from 'react';
import { campaignViewFromCanvasGraph, scaffoldMarksOf } from '@/lib/campaign-canvas/lectura';
import { diffForCanvas, type ScaffoldStructureDiff } from '@/lib/campaign-canvas/scaffoldDiff';
import { useCampaignStore } from '../stores/useCampaignStore';
import { LecturaView } from './LecturaView';

/**
 * The marks of the graph on the canvas: the Backend's diff when the chat carried one for this
 * very scaffold (a campaign copy), else what the graph says by itself. Read and the Map both
 * draw from it, so they always agree on what changes.
 */
export function useStoreScaffoldMarks(structureDiff: ScaffoldStructureDiff | null | undefined) {
  const nodes = useCampaignStore((store) => store.nodes);
  const edges = useCampaignStore((store) => store.edges);
  const hydration = useCampaignStore((store) => store.hydration);
  const diff = diffForCanvas(structureDiff, hydration);
  return useMemo(() => scaffoldMarksOf(nodes, edges, diff), [nodes, edges, diff]);
}

/**
 * Read, drawn from the same graph the Map edits — a save in one is what the other shows. The
 * companion pane draws it at `panel` size, the full Canvas page at `page`.
 */
export function StoreLectura({
  size = 'panel',
  structureDiff = null,
}: {
  size?: 'panel' | 'page';
  /** The Backend's diff of a campaign copy, from the chat beside the canvas. */
  structureDiff?: ScaffoldStructureDiff | null;
}) {
  const nodes = useCampaignStore((store) => store.nodes);
  const edges = useCampaignStore((store) => store.edges);
  const marks = useStoreScaffoldMarks(structureDiff);
  const model = useMemo(
    () => campaignViewFromCanvasGraph(nodes, edges, marks),
    [nodes, edges, marks],
  );
  if (model.campaigns.length === 0) {
    return (
      <div className="grid h-full place-items-center p-6 text-center text-[13px] text-muted-foreground">
        No campaign on the canvas yet. When Jaina proposes one, it appears here.
      </div>
    );
  }
  return <LecturaView model={model} size={size} />;
}

'use client';

import { useMemo } from 'react';
import { campaignViewFromCanvasGraph } from '@/lib/campaign-canvas/lectura';
import { useCampaignStore } from '../stores/useCampaignStore';
import { LecturaView } from './LecturaView';

/**
 * Read, drawn from the same graph the Map edits — a save in one is what the other shows. The
 * companion pane draws it at `panel` size, the full Canvas page at `page`.
 */
export function StoreLectura({ size = 'panel' }: { size?: 'panel' | 'page' }) {
  const nodes = useCampaignStore((store) => store.nodes);
  const edges = useCampaignStore((store) => store.edges);
  const model = useMemo(() => campaignViewFromCanvasGraph(nodes, edges), [nodes, edges]);
  if (model.campaigns.length === 0) {
    return (
      <div className="grid h-full place-items-center p-6 text-center text-[13px] text-muted-foreground">
        No campaign on the canvas yet. When Jaina proposes one, it appears here.
      </div>
    );
  }
  return <LecturaView model={model} size={size} />;
}

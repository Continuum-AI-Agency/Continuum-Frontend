'use client';

import { memo } from 'react';
import { Node, NodeContent, NodeHeader, NodeTitle } from '@/components/ai-elements/node';
import type { ScaffoldNodeStatus } from '@/lib/paid-media/scaffoldTree';
import { ScaffoldStatusPill } from './ScaffoldStatusPill';

/**
 * The three read-only node types for the scaffold tree canvas.
 *
 * They carry the SAME status pill as the table so the two views speak one visual
 * language — a reader moving between them should not have to relearn what a colour
 * means. Only `transition-colors` is animated: animating position thrashes at two
 * hundred nodes and buys nothing on a tree that never re-lays-out.
 *
 * Built on the shared ai-elements primitives rather than anything under
 * src/CampaignCanvas/, which is an editor end to end (add/remove/undo, inline
 * editable labels, a Deploy button) and would drag mutation into a surface whose
 * entire contract is that it edits nothing.
 */

type CampaignData = {
  name: string;
  status: ScaffoldNodeStatus;
  adSetCount: number;
  adCount: number;
};

type AdSetData = {
  name: string;
  productKey: string | null;
  angleKey: string | null;
  status: ScaffoldNodeStatus;
  adCount: number;
  errorMessage: string | null;
};

type AdData = {
  name: string;
  conceptKey: string | null;
  status: ScaffoldNodeStatus;
};

const NODE_BASE = 'transition-colors duration-300';

export const ScaffoldCampaignNode = memo(function ScaffoldCampaignNode({
  data,
  selected,
}: {
  data: CampaignData;
  selected?: boolean;
}) {
  return (
    <Node
      handles={{ target: false, source: true }}
      selected={selected}
      className={`w-[300px] ${NODE_BASE}`}
    >
      <NodeHeader>
        <NodeTitle className="truncate">{data.name}</NodeTitle>
      </NodeHeader>
      <NodeContent className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs">
          {data.adSetCount} ad sets · {data.adCount} ads
        </span>
        <ScaffoldStatusPill status={data.status} />
      </NodeContent>
    </Node>
  );
});

export const ScaffoldAdSetNode = memo(function ScaffoldAdSetNode({
  data,
  selected,
}: {
  data: AdSetData;
  selected?: boolean;
}) {
  return (
    <Node
      handles={{ target: true, source: true }}
      selected={selected}
      className={`w-[260px] ${NODE_BASE}`}
    >
      <NodeHeader>
        <NodeTitle className="truncate text-sm">{data.name}</NodeTitle>
      </NodeHeader>
      <NodeContent className="flex flex-col gap-1.5">
        <span className="truncate text-muted-foreground text-xs">
          {[data.productKey, data.angleKey].filter(Boolean).join(' · ') || '—'}
        </span>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-xs">{data.adCount} ads</span>
          <ScaffoldStatusPill status={data.status} />
        </div>
        {data.errorMessage ? (
          <span className="truncate text-destructive text-xs" title={data.errorMessage}>
            {data.errorMessage}
          </span>
        ) : null}
      </NodeContent>
    </Node>
  );
});

export const ScaffoldAdNode = memo(function ScaffoldAdNode({
  data,
  selected,
}: {
  data: AdData;
  selected?: boolean;
}) {
  return (
    <Node
      handles={{ target: true, source: false }}
      selected={selected}
      className={`w-[220px] ${NODE_BASE}`}
    >
      <NodeHeader>
        <NodeTitle className="truncate text-sm">{data.name}</NodeTitle>
      </NodeHeader>
      <NodeContent className="flex items-center justify-between gap-2">
        <span className="truncate text-muted-foreground text-xs">{data.conceptKey ?? '—'}</span>
        <ScaffoldStatusPill status={data.status} />
      </NodeContent>
    </Node>
  );
});

export const SCAFFOLD_NODE_TYPES = {
  scaffoldCampaign: ScaffoldCampaignNode,
  scaffoldAdSet: ScaffoldAdSetNode,
  scaffoldAd: ScaffoldAdNode,
} as const;

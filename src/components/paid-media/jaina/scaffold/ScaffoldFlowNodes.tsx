'use client';

import { memo, type ReactNode } from 'react';
import { Node, NodeContent, NodeHeader, NodeTitle } from '@/components/ai-elements/node';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import type {
  ScaffoldChoices,
  ScaffoldDerived,
  ScaffoldNodeStatus,
} from '@/lib/paid-media/scaffoldTree';
import {
  ScaffoldAdDetail,
  ScaffoldAdSetDetail,
  ScaffoldCampaignDetail,
} from './ScaffoldNodeDetail';
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
 *
 * DETAIL LIVES ON HOVER, NOT ON THE CARD. A card wide enough to show an objective, a
 * goal, a placement list and an audience is a card you cannot fit fifty of on a screen,
 * so the card stays down to name + status and `ScaffoldNodeDetail` carries the rest.
 * The hover content renders in a Radix portal, which is what keeps it upright and
 * legible while React Flow's canvas transform scales the node underneath it.
 */

type CampaignData = {
  name: string;
  status: ScaffoldNodeStatus;
  adSetCount: number;
  adCount: number;
  metaObjectId: string | null;
  choices?: ScaffoldChoices;
  derived?: ScaffoldDerived;
};

type AdSetData = {
  name: string;
  productKey: string | null;
  angleKey: string | null;
  status: ScaffoldNodeStatus;
  adCount: number;
  metaObjectId: string | null;
  errorMessage: string | null;
  choices?: ScaffoldChoices;
  derived?: ScaffoldDerived;
};

type AdData = {
  name: string;
  conceptKey: string | null;
  productKey: string | null;
  angleKey: string | null;
  status: ScaffoldNodeStatus;
  metaCreativeId: string | null;
  creativeAssetId: string | null;
  creativeMedia: Record<string, unknown> | null;
  errorMessage: string | null;
  choices?: ScaffoldChoices;
  derived?: ScaffoldDerived;
};

const NODE_BASE = 'transition-colors duration-300';

/**
 * `openDelay` is deliberate: panning a big tree drags the pointer across many nodes,
 * and a zero-delay hover would strobe a panel per node crossed.
 */
function NodeHover({
  title,
  detail,
  children,
}: {
  title: string;
  detail: ReactNode;
  children: ReactNode;
}) {
  return (
    <HoverCard openDelay={220} closeDelay={80}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent side="right" align="start" className="w-80">
        <p className="mb-2 font-medium text-sm break-words">{title}</p>
        {detail}
      </HoverCardContent>
    </HoverCard>
  );
}

export const ScaffoldCampaignNode = memo(function ScaffoldCampaignNode({
  data,
  selected,
}: {
  data: CampaignData;
  selected?: boolean;
}) {
  return (
    <NodeHover title={data.name} detail={<ScaffoldCampaignDetail data={data} />}>
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
    </NodeHover>
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
    <NodeHover title={data.name} detail={<ScaffoldAdSetDetail data={data} />}>
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
            <span className="truncate text-destructive text-xs">{data.errorMessage}</span>
          ) : null}
        </NodeContent>
      </Node>
    </NodeHover>
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
    <NodeHover title={data.name} detail={<ScaffoldAdDetail data={data} />}>
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
    </NodeHover>
  );
});

export const SCAFFOLD_NODE_TYPES = {
  scaffoldCampaign: ScaffoldCampaignNode,
  scaffoldAdSet: ScaffoldAdSetNode,
  scaffoldAd: ScaffoldAdNode,
} as const;

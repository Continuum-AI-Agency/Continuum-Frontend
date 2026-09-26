'use client';

/*
 * The node inspector: every field of the ONE selected Meta node, off the node.
 *
 * Docked top-right inside the canvas and non-modal — the graph stays live beside it, and
 * the minimap moved to the bottom-left to give it the right edge. It derives its node
 * from the selection, so mounting it is one line in the canvas and closing it is simply
 * deselecting. Same frame as the Studio canvas inspector, so the two canvases read as
 * one product.
 */

import {
  Image as ImageIcon,
  Layers,
  Layout,
  type LucideIcon,
  Megaphone,
  Users,
} from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { useMemo } from 'react';
import { CanvasFloatingPanel } from '@/StudioCanvas/components/CanvasFloatingPanel';
import { useCampaignStore } from '../../stores/useCampaignStore';
import type { CampaignCanvasNode, CampaignCanvasNodeMap, MetaCampaignNodeType } from '../../types';
import { AudienceSection } from './AudienceSection';
import { CreativeSection } from './CreativeSection';
import { AdSection, AdSetSection, CampaignSection } from './NodeSections';

const PRESENTATION: Record<
  MetaCampaignNodeType,
  { title: string; icon: LucideIcon; tone: string }
> = {
  campaign: { title: 'Campaign', icon: Layout, tone: 'bg-blue-500/10 text-blue-500' },
  'ad-set': { title: 'Ad set', icon: Layers, tone: 'bg-primary/10 text-primary' },
  ad: { title: 'Ad', icon: Megaphone, tone: 'bg-emerald-500/10 text-emerald-500' },
  audience: { title: 'Audience', icon: Users, tone: 'bg-orange-500/10 text-orange-500' },
  creative: { title: 'Creative', icon: ImageIcon, tone: 'bg-pink-500/10 text-pink-500' },
};

const isMetaNode = (
  node: CampaignCanvasNode,
): node is CampaignCanvasNode & {
  type: MetaCampaignNodeType;
} => node.type in PRESENTATION;

function InspectorBody({ node }: { node: CampaignCanvasNode & { type: MetaCampaignNodeType } }) {
  switch (node.type) {
    case 'campaign':
      return <CampaignSection node={node as CampaignCanvasNodeMap['campaign']} />;
    case 'ad-set':
      return <AdSetSection node={node as CampaignCanvasNodeMap['ad-set']} />;
    case 'ad':
      return <AdSection node={node as CampaignCanvasNodeMap['ad']} />;
    case 'audience':
      return <AudienceSection node={node as CampaignCanvasNodeMap['audience']} />;
    case 'creative':
      return <CreativeSection node={node as CampaignCanvasNodeMap['creative']} />;
  }
}

/**
 * Backspace on a focused chip or select would otherwise reach React Flow's delete-key
 * listener on `document` and delete the node being edited.
 */
const keepDeleteKeysInside = (event: KeyboardEvent<HTMLElement>) => {
  if (event.key === 'Backspace' || event.key === 'Delete') event.stopPropagation();
};

export function CanvasInspector() {
  const nodes = useCampaignStore((store) => store.nodes);
  const onNodesChange = useCampaignStore((store) => store.onNodesChange);
  const hydration = useCampaignStore((store) => store.hydration);
  const editLocked = useCampaignStore((store) => store.editLocked);
  const selected = useMemo(() => nodes.filter((node) => node.selected), [nodes]);

  const node = selected.length === 1 ? selected[0] : undefined;
  if (!node || !isMetaNode(node)) return null;

  const { title, icon: Icon, tone } = PRESENTATION[node.type];
  const errors = node.data.validationErrors ?? [];

  return (
    <CanvasFloatingPanel
      title={title}
      icon={
        <span className={`rounded-md p-1 ${tone}`}>
          <Icon className="size-3.5" aria-hidden />
        </span>
      }
      onClose={() => onNodesChange([{ id: node.id, type: 'select', selected: false }])}
      position="top-right"
      // Clears the record bar above it and the Jaina launcher below it.
      className="mt-[4.5rem] mr-4 max-h-[calc(100%-11.5rem)] w-[22rem] duration-200 animate-in fade-in slide-in-from-right-2 motion-reduce:animate-none"
    >
      <fieldset
        aria-label={`${title} settings`}
        // A save in flight owns the graph: fields read, nothing commits until it lands.
        disabled={editLocked}
        className="min-w-0 disabled:opacity-60"
        data-testid="canvas-inspector"
        data-node-id={node.id}
        data-node-type={node.type}
        onKeyDown={keepDeleteKeysInside}
        // Right-click inside a form is for the field (paste, spelling), not the canvas menu.
        onContextMenu={(event) => event.stopPropagation()}
      >
        {node.data.provenance && hydration ? (
          <p className="border-b border-border/70 bg-muted/40 px-4 py-2 text-2xs leading-snug text-muted-foreground">
            Part of “{hydration.scaffoldName}” v{hydration.version}. Edits stay on this canvas until
            they are saved as a new version.
          </p>
        ) : null}
        {errors.length > 0 ? (
          <ul
            className="flex flex-col gap-1 border-b border-destructive/20 bg-destructive/5 px-4 py-2.5 text-2xs leading-snug text-destructive"
            data-testid="inspector-validation-errors"
          >
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : null}
        <InspectorBody key={node.id} node={node} />
      </fieldset>
    </CanvasFloatingPanel>
  );
}

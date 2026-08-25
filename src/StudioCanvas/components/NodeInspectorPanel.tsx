'use client';

// The selection inspector: node configuration, off the node.
//
// Until now a generation node's model, size, ratio, resolution and reference mode
// were only reachable through a right-click into a nested submenu — up to four
// hover-throughs to change one value, and nothing on screen said what the current
// value was. This panel is the same settings as a visible surface, and it is the
// ONLY new write path: every field goes through `useNodeConfigPatch`, which is
// contracts' `coerceNodeConfig` plus the store's save trigger.
//
// It derives its own selection from the store rather than taking it as a prop, so
// mounting it is a single line inside the canvas and no state is threaded down.
//
// ADDITIVE for this wave: the node context menus keep their config copies. Slimming
// them is a separate change against files this shell does not own.

import {
  Blocks,
  Combine,
  ListChecks,
  type LucideIcon,
  Play,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useNodeConfigPatch } from '../hooks/useNodeConfigPatch';
import { useModuleFoldStore } from '../stores/useModuleFoldStore';
import { useStudioStore } from '../stores/useStudioStore';
import { moduleIdForNode } from '../utils/moduleFold';
import type {
  ExtendVideoNodeData,
  NanoGenNodeData,
  OmniGenNodeData,
  StudioNode,
  VideoGenNodeData,
} from '../types';
import { CanvasFloatingPanel } from './CanvasFloatingPanel';
import { ExtendVideoSection } from './inspector/ExtendVideoSection';
import { GenericSection } from './inspector/GenericSection';
import { GroundingSection } from './inspector/GroundingSection';
import { ImageGenSection } from './inspector/ImageGenSection';
import { OmniGenSection } from './inspector/OmniGenSection';
import { VideoGenSection } from './inspector/VideoGenSection';
import { SaveTechniqueDialog } from './SaveTechniqueDialog';

/** Only the types with a hand-written section; everything else is humanized. */
const TYPE_TITLES: Record<string, string> = {
  nanoGen: 'Image Generator',
  videoGen: 'Video Generator',
  veoDirector: 'Video Generator',
  veoFast: 'Video Generator',
  omniGen: 'Omni Generator',
  extendVideo: 'Extend Video',
};

/** The types that carry the three grounding vocabularies. */
const GROUNDED_TYPES = new Set(['nanoGen', 'videoGen', 'veoDirector', 'veoFast', 'omniGen']);

const humanizeType = (type: string): string =>
  type.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (character) => character.toUpperCase());

function nodeTitle(node: StudioNode): string {
  const label = (node.data as { label?: unknown }).label;
  if (typeof label === 'string' && label.trim().length > 0) return label;
  const type = node.type ?? '';
  return TYPE_TITLES[type] ?? humanizeType(type) ?? 'Node';
}

function ConfigSection({
  node,
  onPatch,
}: {
  node: StudioNode;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  switch (node.type) {
    case 'nanoGen':
      return <ImageGenSection data={node.data as NanoGenNodeData} onPatch={onPatch} />;
    case 'videoGen':
    case 'veoDirector':
    case 'veoFast':
      return (
        <VideoGenSection
          nodeType={node.type}
          data={node.data as VideoGenNodeData}
          onPatch={onPatch}
        />
      );
    case 'omniGen':
      return <OmniGenSection data={node.data as OmniGenNodeData} onPatch={onPatch} />;
    case 'extendVideo':
      return <ExtendVideoSection data={node.data as ExtendVideoNodeData} onPatch={onPatch} />;
    default:
      return <GenericSection node={node} onPatch={onPatch} />;
  }
}

function BulkAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button type="button" variant="outline" size="sm" className="justify-start" onClick={onClick}>
      <Icon className="mr-2 size-3.5" aria-hidden />
      {label}
    </Button>
  );
}

export function NodeInspectorPanel({
  onRunSelection,
  onEnforceBrandBook,
}: {
  /** Provided by the canvas shell, which owns the execution controls. */
  onRunSelection?: (nodeIds: string[]) => void;
  onEnforceBrandBook?: () => void;
}) {
  const nodes = useStudioStore((state) => state.nodes);
  const setNodes = useStudioStore((state) => state.setNodes);
  const brandId = useStudioStore((state) => state.brandId);
  const patch = useNodeConfigPatch();
  const collapseModule = useModuleFoldStore((state) => state.collapseModule);
  // The dialog lives here rather than in the canvas shell: the panel already
  // holds the selection and the brand, so nothing has to be threaded down.
  const [isSaveTechniqueOpen, setIsSaveTechniqueOpen] = useState(false);

  const selected = useMemo(() => nodes.filter((node) => node.selected), [nodes]);

  if (selected.length === 0) return null;

  const deselectAll = () =>
    setNodes(nodes.map((node) => (node.selected ? { ...node, selected: false } : node)));

  const multiple = selected.length > 1;
  const node = selected[0];

  // The counterpart to expanding, which lives on the collapsed card itself. Offered
  // whenever the whole selection sits inside ONE applied technique; membership is the
  // `module:<uuid>:` id namespace useApplyWorkflow already stamps, not a second record.
  const selectedModuleIds = new Set(
    selected.map((entry) => moduleIdForNode(entry.id)).filter(Boolean),
  );
  const collapsibleModuleId = selectedModuleIds.size === 1 ? [...selectedModuleIds][0] : undefined;
  const collapsibleMemberCount = collapsibleModuleId
    ? nodes.filter((entry) => moduleIdForNode(entry.id) === collapsibleModuleId).length
    : 0;
  const collapseSelectedModule = () => {
    if (!collapsibleModuleId) return;
    collapseModule(collapsibleModuleId);
    // The members stop rendering, so a selection pointing at them would leave this
    // panel open over nodes nobody can see.
    deselectAll();
  };

  return (
    <CanvasFloatingPanel
      title={multiple ? `${selected.length} nodes selected` : nodeTitle(node)}
      icon={
        multiple ? (
          <ListChecks className="size-4" aria-hidden />
        ) : (
          <SlidersHorizontal className="size-4" aria-hidden />
        )
      }
      onClose={deselectAll}
      // Not the default: the panel is anchored opposite the library/mode controls, and
      // CanvasFloatingPanel's own `mt-14` is what clears the validation-issues button
      // that already owns this corner.
      position="top-right"
      className="mr-1 w-[320px]"
      bodyClassName="nowheel max-h-[calc(100vh-12rem)] overflow-y-auto overscroll-contain"
    >
      <div className="flex flex-col gap-4 p-3" data-testid="node-inspector">
        {/* First, not last: the panel body scrolls, and an action at its bottom
            lands under the minimap and the composer where nothing can click it.
            Offered at any selection size — one configured generator with open
            inputs is as legitimate a technique as a whole branch. */}
        <BulkAction
          icon={Blocks}
          label="Save as technique"
          onClick={() => setIsSaveTechniqueOpen(true)}
        />

        {collapsibleModuleId ? (
          <BulkAction
            icon={Combine}
            label={`Collapse technique (${collapsibleMemberCount} nodes)`}
            onClick={collapseSelectedModule}
          />
        ) : null}

        {multiple ? (
          <>
            <p className="text-xs text-muted-foreground">
              Per-node settings stay on the node while more than one is selected.
            </p>
            <div className="flex flex-col gap-1.5">
              {onRunSelection ? (
                <BulkAction
                  icon={Play}
                  label="Run selection"
                  onClick={() => onRunSelection(selected.map((entry) => entry.id))}
                />
              ) : null}
              {onEnforceBrandBook ? (
                <BulkAction
                  icon={ShieldCheck}
                  label="Enforce brand book"
                  onClick={onEnforceBrandBook}
                />
              ) : null}
            </div>
            <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
              {selected.map((entry) => (
                <li key={entry.id} className="truncate">
                  {nodeTitle(entry)}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <ConfigSection node={node} onPatch={(next) => patch(node.id, node.type ?? '', next)} />
            {GROUNDED_TYPES.has(node.type ?? '') ? (
              <div className="-mx-1 border-t border-border/70 pt-1">
                <GroundingSection node={node} brandId={brandId} />
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* Mounted only while open: the port inference is a full pass over the
          selection, and the panel re-renders on every selection change. */}
      {isSaveTechniqueOpen ? (
        <SaveTechniqueDialog
          open
          onOpenChange={setIsSaveTechniqueOpen}
          brandProfileId={brandId ?? undefined}
          nodes={selected}
        />
      ) : null}
    </CanvasFloatingPanel>
  );
}

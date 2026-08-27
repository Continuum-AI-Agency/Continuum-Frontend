import {
  AtSign,
  FolderOpen,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';

import type { InteractionMode } from '../stores/useStudioStore';
import { STUDIO_FIT_VIEW_OPTIONS } from '../utils/fitViewOptions';
import {
  type AddNodeHandler,
  AddNodeCommandPalette,
  type ApplyTechniqueHandler,
  type PaletteTechniques,
} from './AddNodeCommandPalette';

// The canvas menu's CONTENT only. The ContextMenu root stays in the canvas shell:
// Base UI's trigger has no disabled prop of its own — it reads the root's
// `disabled` off the store — so the modal stand-down cannot move here.
export function CanvasContextMenuContent({
  addNode,
  onAddNodeOpenChange,
  techniques,
  onApplyTechnique,
  openLoadWorkflow,
  openInstagram,
  openSaveStarter,
  enforceBrandBookOnSelection,
  clearCanvas,
  hasSelection,
  interactionMode,
  setInteractionMode,
  zoomIn,
  zoomOut,
  fitView,
}: {
  addNode: AddNodeHandler;
  /** The Add Node submenu opened or closed — the canvas pins the drop point on open. */
  onAddNodeOpenChange: (open: boolean) => void;
  /** What the palette's Techniques submenu lists; the canvas owns the fetch. */
  techniques?: PaletteTechniques;
  onApplyTechnique?: ApplyTechniqueHandler;
  openLoadWorkflow: () => void;
  openInstagram: () => void;
  openSaveStarter: () => void;
  enforceBrandBookOnSelection: () => void;
  clearCanvas: () => void;
  hasSelection: boolean;
  interactionMode: InteractionMode;
  setInteractionMode: (mode: InteractionMode) => void;
  zoomIn: (options?: { duration?: number }) => void;
  zoomOut: (options?: { duration?: number }) => void;
  fitView: (options?: Record<string, unknown>) => void;
}) {
  return (
    <ContextMenuContent className="w-[clamp(14rem,18vw,18rem)]">
      <ContextMenuLabel>Canvas Actions</ContextMenuLabel>
      {/* The hover tree AND a search: category submenus open on hover, and the box on top
          swaps them for cmdk's ranked list the moment there is a query. */}
      <AddNodeCommandPalette
        onAdd={addNode}
        onOpenChange={onAddNodeOpenChange}
        techniques={techniques}
        onApplyTechnique={onApplyTechnique}
      />

      <ContextMenuItem inset onSelect={openLoadWorkflow}>
        <FolderOpen className="mr-2 h-4 w-4" />
        Load Workflow
      </ContextMenuItem>

      <ContextMenuItem inset onSelect={openInstagram}>
        <AtSign className="mr-2 h-4 w-4" />
        Import from Instagram
      </ContextMenuItem>

      <ContextMenuItem inset disabled={!hasSelection} onSelect={openSaveStarter}>
        <Sparkles className="mr-2 h-4 w-4" />
        Save selection as starter
      </ContextMenuItem>

      <ContextMenuItem inset disabled={!hasSelection} onSelect={enforceBrandBookOnSelection}>
        <ShieldCheck className="mr-2 h-4 w-4" />
        Enforce brand book on selection
      </ContextMenuItem>

      <ContextMenuSub>
        <ContextMenuSubTrigger inset>
          <ScanLine className="mr-2 h-4 w-4" />
          View and Interaction
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-64">
          <ContextMenuCheckboxItem
            checked={interactionMode === 'pan'}
            onClick={() => setInteractionMode('pan')}
          >
            Pan Mode
            <ContextMenuShortcut>H</ContextMenuShortcut>
          </ContextMenuCheckboxItem>
          <ContextMenuCheckboxItem
            checked={interactionMode === 'select'}
            onClick={() => setInteractionMode('select')}
          >
            Select Mode
            <ContextMenuShortcut>V</ContextMenuShortcut>
          </ContextMenuCheckboxItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => zoomIn({ duration: 250 })}>
            <ZoomIn className="mr-2 h-4 w-4" />
            Zoom In
          </ContextMenuItem>
          <ContextMenuItem onClick={() => zoomOut({ duration: 250 })}>
            <ZoomOut className="mr-2 h-4 w-4" />
            Zoom Out
          </ContextMenuItem>
          <ContextMenuItem onClick={() => fitView({ ...STUDIO_FIT_VIEW_OPTIONS, duration: 350 })}>
            Fit View
            <ContextMenuShortcut>Shift+F</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuSeparator />

      <ContextMenuItem
        className="text-destructive focus:bg-destructive/10 focus:text-destructive"
        onClick={clearCanvas}
      >
        <Trash2 className="mr-2 h-4 w-4" />
        Clear Canvas
      </ContextMenuItem>
    </ContextMenuContent>
  );
}

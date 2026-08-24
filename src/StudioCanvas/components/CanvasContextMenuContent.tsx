import {
  AtSign,
  FolderOpen,
  Plus,
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

// The canvas menu's CONTENT only. The ContextMenu root stays in the canvas shell:
// Base UI's trigger has no disabled prop of its own — it reads the root's
// `disabled` off the store — so the modal stand-down cannot move here.
export function CanvasContextMenuContent({
  openAddNodePalette,
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
  openAddNodePalette: () => void;
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
      {/* One row, not a three-level hover tree. The catalog is 20+ rows once the video
          models are expanded, and reaching a generator through group → provider → row cost
          four hover-throughs (#260) with no way to search. */}
      <ContextMenuItem inset onSelect={openAddNodePalette}>
        <Plus className="mr-2 h-4 w-4" />
        Add Node
        <ContextMenuShortcut>Search</ContextMenuShortcut>
      </ContextMenuItem>

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

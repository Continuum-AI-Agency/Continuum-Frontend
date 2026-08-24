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
import type { VideoGeneratorModel } from '../utils/videoModel';
import { ADD_NODE_GROUPS, type StudioCanvasNodeType } from './addNodeCatalog';

// The canvas menu's CONTENT only. The ContextMenu root stays in the canvas shell:
// Base UI's trigger has no disabled prop of its own — it reads the root's
// `disabled` off the store — so the modal stand-down cannot move here.
export function CanvasContextMenuContent({
  addNodeAtPointer,
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
  addNodeAtPointer: (type: StudioCanvasNodeType, options?: { model?: VideoGeneratorModel }) => void;
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
      <ContextMenuSub>
        <ContextMenuSubTrigger inset>
          <Plus className="mr-2 h-4 w-4" />
          Add Node
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-72">
          {ADD_NODE_GROUPS.map((section) => (
            <ContextMenuSub key={section.group}>
              <ContextMenuSubTrigger inset>{section.label}</ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-72">
                {section.rows.map((row) => (
                  <ContextMenuItem
                    key={row.model ? `${row.type}-${row.model}` : row.type}
                    onClick={() =>
                      row.model
                        ? addNodeAtPointer(row.type, { model: row.model })
                        : addNodeAtPointer(row.type)
                    }
                  >
                    <div className="flex min-w-0 flex-col">
                      <span>{row.label}</span>
                      {row.desc ? (
                        <span className="text-xs text-muted-foreground">{row.desc}</span>
                      ) : null}
                    </div>
                    <ContextMenuShortcut>{row.tag}</ContextMenuShortcut>
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>

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

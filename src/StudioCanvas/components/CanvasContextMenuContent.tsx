import {
  AtSign,
  FolderOpen,
  ScanLine,
  ShieldCheck,
  Trash2,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
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
  AddNodeCommandPalette,
  type AddNodeHandler,
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
  openSave,
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
  /** Opens the one save panel. Selection-scoped when something is selected. */
  openSave: () => void;
  enforceBrandBookOnSelection: () => void;
  clearCanvas: () => void;
  hasSelection: boolean;
  interactionMode: InteractionMode;
  setInteractionMode: (mode: InteractionMode) => void;
  zoomIn: (options?: { duration?: number }) => void;
  zoomOut: (options?: { duration?: number }) => void;
  fitView: (options?: Record<string, unknown>) => void;
}) {
  const translateUi = useUiTranslations('studio');

  return (
    <ContextMenuContent className="w-[clamp(14rem,18vw,18rem)]">
      <ContextMenuLabel>{translateUi('canvas_actions_82b3ca00')}</ContextMenuLabel>
      {/* The hover tree AND a search: category submenus open on hover, and the box on top
          swaps them for cmdk's ranked list the moment there is a query. */}
      <AddNodeCommandPalette
        onAdd={addNode}
        onOpenChange={onAddNodeOpenChange}
        techniques={techniques}
        onApplyTechnique={onApplyTechnique}
      />

      <ContextMenuItem inset onSelect={openLoadWorkflow}>
        <FolderOpen className="mr-2 h-4 w-4" /> {translateUi('load_workflow_15bb7725')}{' '}
      </ContextMenuItem>

      <ContextMenuItem inset onSelect={openInstagram}>
        <AtSign className="mr-2 h-4 w-4" /> {translateUi('import_from_instagram_ee939f89')}{' '}
      </ContextMenuItem>

      {/* Never disabled: with nothing selected this saves the whole canvas, which is the
          same act the header's Save button performs. */}
      <ContextMenuItem inset onSelect={openSave}>
        <Upload className="mr-2 h-4 w-4" />
        {hasSelection ? translateUi('save_selection_dd183ea6') : translateUi('save_1509f561')}
      </ContextMenuItem>

      <ContextMenuItem inset disabled={!hasSelection} onSelect={enforceBrandBookOnSelection}>
        <ShieldCheck className="mr-2 h-4 w-4" />{' '}
        {translateUi('enforce_brand_book_on_selection_21b4b2fb')}{' '}
      </ContextMenuItem>

      <ContextMenuSub>
        <ContextMenuSubTrigger inset>
          <ScanLine className="mr-2 h-4 w-4" /> {translateUi('view_and_interaction_09718797')}{' '}
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-64">
          <ContextMenuCheckboxItem
            checked={interactionMode === 'pan'}
            onClick={() => setInteractionMode('pan')}
          >
            {' '}
            {translateUi('pan_mode_34a65903')} <ContextMenuShortcut>H</ContextMenuShortcut>
          </ContextMenuCheckboxItem>
          <ContextMenuCheckboxItem
            checked={interactionMode === 'select'}
            onClick={() => setInteractionMode('select')}
          >
            {' '}
            {translateUi('select_mode_0c9b843c')} <ContextMenuShortcut>V</ContextMenuShortcut>
          </ContextMenuCheckboxItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => zoomIn({ duration: 250 })}>
            <ZoomIn className="mr-2 h-4 w-4" /> {translateUi('zoom_in_5a982cf9')}{' '}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => zoomOut({ duration: 250 })}>
            <ZoomOut className="mr-2 h-4 w-4" /> {translateUi('zoom_out_24649ee0')}{' '}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => fitView({ ...STUDIO_FIT_VIEW_OPTIONS, duration: 350 })}>
            {' '}
            {translateUi('fit_view_91a2a9f3')} <ContextMenuShortcut>Shift+F</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuSeparator />

      <ContextMenuItem
        className="text-destructive focus:bg-destructive/10 focus:text-destructive"
        onClick={clearCanvas}
      >
        <Trash2 className="mr-2 h-4 w-4" /> {translateUi('clear_canvas_8c3f944e')}{' '}
      </ContextMenuItem>
    </ContextMenuContent>
  );
}

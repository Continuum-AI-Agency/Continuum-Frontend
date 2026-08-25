'use client';

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  ChevronUp,
  Eye,
  EyeOff,
  GripVertical,
  Lock,
  LockOpen,
  TriangleAlert,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useMemo, useState } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { LayerEditorLayer } from '../../types';
import { duplicateNames, type LayerMove } from '../../utils/layers/layerOps';

/**
 * The layers list.
 *
 * Rendered REVERSED: the array is paint order bottom-first (aep-interop §4.2.6), and
 * every layers panel ever built puts the topmost layer at the top. The reversal lives
 * here and nowhere else — a second place that flips the order is how a drag ends up
 * moving a layer the wrong way.
 *
 * A duplicated name is a WARNING, never a rename. AE does not enforce unique layer names
 * and `name` is the join key an AE-side template binds by (§4.2.5), so silently
 * de-duplicating would break that binding to make a list look tidier.
 */

export interface LayersPanelProps {
  layers: readonly LayerEditorLayer[];
  selectedIds: readonly string[];
  onSelectionChange: (ids: string[]) => void;
  onToggleVisible: (id: string) => void;
  onToggleLocked: (id: string) => void;
  onRename: (id: string, name: string) => void;
  /** Indices into the BOTTOM-FIRST array, already translated out of display order. */
  onReorder: (from: number, to: number) => void;
  /** Right-click ordering. Selects the row first, so the move and the panel agree. */
  onOrder: (id: string, move: LayerMove) => void;
}

/** Display position -> array index. The panel shows the array upside down. */
export const toArrayIndex = (displayIndex: number, count: number): number =>
  count - 1 - displayIndex;

export function LayersPanel({
  layers,
  selectedIds,
  onSelectionChange,
  onToggleVisible,
  onToggleLocked,
  onRename,
  onReorder,
  onOrder,
}: LayersPanelProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const displayed = useMemo(() => [...layers].reverse(), [layers]);
  const collisions = useMemo(() => duplicateNames(layers), [layers]);

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const fromDisplay = displayed.findIndex((layer) => layer.id === String(active.id));
      const toDisplay = displayed.findIndex((layer) => layer.id === String(over.id));
      if (fromDisplay < 0 || toDisplay < 0) return;
      onReorder(toArrayIndex(fromDisplay, layers.length), toArrayIndex(toDisplay, layers.length));
    },
    [displayed, layers.length, onReorder],
  );

  const onRowClick = useCallback(
    (id: string, event: React.MouseEvent) => {
      const additive = event.ctrlKey || event.metaKey;
      if (!additive) {
        onSelectionChange([id]);
        return;
      }
      onSelectionChange(
        selectedIds.includes(id)
          ? selectedIds.filter((selected) => selected !== id)
          : [...selectedIds, id],
      );
    },
    [onSelectionChange, selectedIds],
  );

  if (layers.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-2xs text-muted-foreground">
        Connect images to this node, then add them as layers.
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext
        items={displayed.map((layer) => layer.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="flex flex-col gap-0.5 p-1" data-testid="layers-panel">
          {displayed.map((layer) => (
            <LayerRow
              key={layer.id}
              layer={layer}
              selected={selectedIds.includes(layer.id)}
              nameCollides={collisions.has(layer.name)}
              onClick={(event) => onRowClick(layer.id, event)}
              onToggleVisible={() => onToggleVisible(layer.id)}
              onToggleLocked={() => onToggleLocked(layer.id)}
              onRename={(name) => onRename(layer.id, name)}
              onOrder={(move) => onOrder(layer.id, move)}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function LayerRow({
  layer,
  selected,
  nameCollides,
  onClick,
  onToggleVisible,
  onToggleLocked,
  onRename,
  onOrder,
}: {
  layer: LayerEditorLayer;
  selected: boolean;
  nameCollides: boolean;
  onClick: (event: React.MouseEvent) => void;
  onToggleVisible: () => void;
  onToggleLocked: () => void;
  onRename: (name: string) => void;
  onOrder: (move: LayerMove) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: layer.id,
  });
  const [editing, setEditing] = useState(false);

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className={cn(
        'rounded-md border px-1 py-1 text-2xs',
        selected ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted/40',
      )}
      data-testid={`layer-row-${layer.id}`}
      data-selected={selected}
    >
      <ContextMenu>
        <ContextMenuTrigger
          render={
            <div className="flex min-w-0 items-center gap-1">
              <button
                type="button"
                aria-label={`Reorder ${layer.name}`}
                className="cursor-grab text-muted-foreground hover:text-foreground"
                {...attributes}
                {...listeners}
              >
                <GripVertical className="h-3 w-3" />
              </button>

              <button
                type="button"
                aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
                aria-pressed={layer.visible}
                onClick={onToggleVisible}
                className="text-muted-foreground hover:text-foreground"
              >
                {layer.visible ? (
                  <Eye className="h-3 w-3" />
                ) : (
                  <EyeOff className="h-3 w-3 opacity-50" />
                )}
              </button>

              <button
                type="button"
                aria-label={layer.locked ? `Unlock ${layer.name}` : `Lock ${layer.name}`}
                aria-pressed={layer.locked}
                onClick={onToggleLocked}
                className="text-muted-foreground hover:text-foreground"
              >
                {layer.locked ? (
                  <Lock className="h-3 w-3" />
                ) : (
                  <LockOpen className="h-3 w-3 opacity-50" />
                )}
              </button>

              {editing ? (
                <input
                  // biome-ignore lint/a11y/noAutofocus: the row was just double-clicked to rename
                  autoFocus
                  aria-label={`Rename ${layer.name}`}
                  defaultValue={layer.name}
                  className="min-w-0 flex-1 rounded border border-input bg-background px-1 py-0.5 text-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  onBlur={(event) => {
                    const next = event.currentTarget.value.trim();
                    if (next && next !== layer.name) onRename(next);
                    setEditing(false);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                    if (event.key === 'Escape') setEditing(false);
                    event.stopPropagation();
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={onClick}
                  onDoubleClick={() => setEditing(true)}
                  className={cn(
                    'min-w-0 flex-1 truncate text-left',
                    layer.visible ? undefined : 'text-muted-foreground line-through',
                  )}
                >
                  {layer.name}
                </button>
              )}

              {nameCollides ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <TriangleAlert
                        className="h-3 w-3 shrink-0 text-amber-500"
                        data-testid={`layer-name-collision-${layer.id}`}
                      />
                    }
                  />
                  <TooltipContent>
                    Another layer shares this name. Kept as typed — the name is how an external
                    template binds to this layer.
                  </TooltipContent>
                </Tooltip>
              ) : null}

              <span className="shrink-0 tabular-nums text-muted-foreground">
                {Math.round(layer.opacity * 100)}%
              </span>
            </div>
          }
        />
        {/* Ordering by right-click, the way every layers panel offers it. The row selects
            itself first so the move, the stage and the inspector cannot disagree. */}
        <ContextMenuContent className="w-48">
          {ROW_ORDER_ITEMS.map(({ move, label, Icon, chord }) => (
            <ContextMenuItem
              key={move}
              onClick={(event) => {
                onClick(event as unknown as React.MouseEvent);
                onOrder(move);
              }}
            >
              <Icon className="mr-2 h-4 w-4" />
              {label}
              <ContextMenuShortcut>{chord}</ContextMenuShortcut>
            </ContextMenuItem>
          ))}
        </ContextMenuContent>
      </ContextMenu>
    </li>
  );
}

/** Same four moves as the inspector, same chords as `useLayerEditorKeymap`. */
export const ROW_ORDER_ITEMS: {
  move: LayerMove;
  label: string;
  Icon: typeof ChevronsUp;
  chord: string;
}[] = [
  { move: 'top', label: 'Bring to front', Icon: ChevronsUp, chord: '⇧⌘]' },
  { move: 'up', label: 'Bring forward', Icon: ChevronUp, chord: '⌘]' },
  { move: 'down', label: 'Send backward', Icon: ChevronDown, chord: '⌘[' },
  { move: 'bottom', label: 'Send to back', Icon: ChevronsDown, chord: '⇧⌘[' },
];

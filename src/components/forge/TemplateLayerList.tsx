'use client';

// One layer stack, front first the way every layers panel reads, shared by the layer editor and the
// arrangements panel. Drag a row by its grip, use its forward/backward buttons, or lift it with the
// keyboard (space, arrows, space). The list owns no order: it reports the new front-first order and
// the caller keeps it.

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
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  GripVertical,
  Image as ImageIcon,
  Layers,
  Type,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type StackRow = {
  id: number;
  label: string;
  detail?: string;
  kind: 'text' | 'composition' | 'artwork';
  hidden?: boolean;
  /** Visibility is fixed (a guide or control layer): the eye shows the state but cannot change it. */
  visibilityLocked?: boolean;
  edited?: boolean;
};

export function TemplateLayerList({
  label,
  rows,
  selectedId,
  onSelect,
  onReorder,
  onToggleVisible,
}: {
  label: string;
  /** Front first. */
  rows: readonly StackRow[];
  selectedId?: number | null;
  onSelect?: (id: number) => void;
  /** Omit to show the stack read-only. Receives the whole new order, front first. */
  onReorder?: (order: number[]) => void;
  onToggleVisible?: (id: number) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = rows.map((row) => row.id);
  const move = (from: number, to: number) => {
    if (onReorder && from !== to && to >= 0 && to < ids.length) onReorder(arrayMove(ids, from, to));
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over) move(ids.indexOf(Number(active.id)), ids.indexOf(Number(over.id)));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy} disabled={!onReorder}>
        <ol aria-label={label} className="flex flex-col gap-px">
          {rows.map((row, index) => (
            <LayerRow
              key={row.id}
              row={row}
              first={index === 0}
              last={index === rows.length - 1}
              selected={row.id === selectedId}
              movable={!!onReorder}
              onSelect={onSelect}
              onStep={(step) => move(index, index + step)}
              onToggleVisible={onToggleVisible}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function LayerRow({
  row,
  first,
  last,
  selected,
  movable,
  onSelect,
  onStep,
  onToggleVisible,
}: {
  row: StackRow;
  first: boolean;
  last: boolean;
  selected: boolean;
  movable: boolean;
  onSelect?: (id: number) => void;
  onStep: (step: 1 | -1) => void;
  onToggleVisible?: (id: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
    disabled: !movable,
  });
  const Icon = row.kind === 'text' ? Type : row.kind === 'composition' ? Layers : ImageIcon;
  const name = (
    <>
      <span className={cn('block truncate', row.hidden && 'text-muted-foreground')}>
        {row.label}
      </span>
      {row.detail ? (
        <span className="block truncate text-2xs text-muted-foreground">{row.detail}</span>
      ) : null}
    </>
  );
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-selected={selected}
      className={cn(
        'group flex min-h-8 items-center gap-1.5 rounded-md px-1 text-xs',
        selected ? 'bg-primary/10 ring-1 ring-primary/30 ring-inset' : 'hover:bg-muted/60',
        isDragging && 'relative z-10 bg-background shadow-md ring-1 ring-border',
      )}
    >
      {movable ? (
        <button
          type="button"
          aria-label={`Drag ${row.label}`}
          className="flex h-6 w-4 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" aria-hidden />
        </button>
      ) : null}
      <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      {onSelect ? (
        <button
          type="button"
          aria-pressed={selected}
          className="min-w-0 flex-1 py-1 text-left outline-none focus-visible:underline"
          onClick={() => onSelect(row.id)}
        >
          {name}
        </button>
      ) : (
        <span className="min-w-0 flex-1 py-1">{name}</span>
      )}
      {row.edited ? (
        <span
          className="size-1.5 shrink-0 rounded-full bg-primary"
          role="img"
          aria-label="Edited"
        />
      ) : null}
      {movable ? (
        <span className="flex shrink-0 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 group-data-[selected=true]:opacity-100">
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label={`Bring ${row.label} forward`}
            disabled={first}
            onClick={() => onStep(-1)}
          >
            <ArrowUp aria-hidden />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label={`Send ${row.label} backward`}
            disabled={last}
            onClick={() => onStep(1)}
          >
            <ArrowDown aria-hidden />
          </Button>
        </span>
      ) : null}
      {onToggleVisible && !row.visibilityLocked ? (
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label={row.hidden ? `Show ${row.label}` : `Hide ${row.label}`}
          onClick={() => onToggleVisible(row.id)}
        >
          {row.hidden ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
        </Button>
      ) : row.hidden ? (
        <EyeOff
          className="size-3.5 shrink-0 text-muted-foreground"
          role="img"
          aria-label="Hidden"
        />
      ) : null}
    </li>
  );
}

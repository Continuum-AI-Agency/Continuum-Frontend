'use client';

// The draw-tool strip shared by the image stage and the paused video frame:
// tool, colour, undo/redo. Keyboard: ⌘/Ctrl+Z undoes, ⇧⌘/Ctrl+Shift+Z (or
// Ctrl+Y) redoes while the stage has focus — wired by the host, which owns focus.

import type { DrawingTool } from '@continuum/contracts';
import { ArrowUpRight, MousePointer2, Pencil, Redo2, Slash, Square, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DRAWING_COLORS } from './drawing';

export type StageTool = 'point' | DrawingTool;

const TOOLS: ReadonlyArray<{ value: StageTool; label: string; icon: typeof Pencil }> = [
  { value: 'point', label: 'Pin', icon: MousePointer2 },
  { value: 'arrow', label: 'Arrow', icon: ArrowUpRight },
  { value: 'line', label: 'Line', icon: Slash },
  { value: 'box', label: 'Rectangle', icon: Square },
  { value: 'freehand', label: 'Freehand', icon: Pencil },
];

type Props = {
  tool: StageTool;
  onToolChange: (tool: StageTool) => void;
  /** The pin tool only means something on an image; a video comment is pinned to time. */
  allowPin?: boolean;
  color: string;
  onColorChange: (color: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  className?: string;
};

export function DrawingToolbar({
  tool,
  onToolChange,
  allowPin = true,
  color,
  onColorChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  className,
}: Props) {
  return (
    <div
      role="toolbar"
      aria-label="Annotation tools"
      className={cn(
        'flex items-center gap-1 rounded-lg border border-border bg-background/95 p-1 shadow-sm backdrop-blur',
        className,
      )}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {TOOLS.filter((entry) => allowPin || entry.value !== 'point').map(
        ({ value, label, icon: Icon }) => (
          <Button
            key={value}
            type="button"
            size="icon"
            variant={tool === value ? 'secondary' : 'ghost'}
            className="size-7"
            aria-label={`${label} annotation`}
            aria-pressed={tool === value}
            title={label}
            onClick={() => onToolChange(value)}
          >
            <Icon className="size-3.5" />
          </Button>
        ),
      )}
      <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
      {DRAWING_COLORS.map((swatch) => (
        <button
          key={swatch}
          type="button"
          aria-label={`Colour ${swatch}`}
          aria-pressed={color === swatch}
          title={swatch}
          onClick={() => onColorChange(swatch)}
          className={cn(
            'size-5 rounded-full ring-1 ring-border transition-transform',
            color === swatch && 'scale-110 ring-2 ring-primary',
          )}
          style={{ backgroundColor: swatch }}
        />
      ))}
      <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-7"
        aria-label="Undo"
        title="Undo (⌘Z)"
        disabled={!canUndo}
        onClick={onUndo}
      >
        <Undo2 className="size-3.5" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-7"
        aria-label="Redo"
        title="Redo (⇧⌘Z)"
        disabled={!canRedo}
        onClick={onRedo}
      >
        <Redo2 className="size-3.5" />
      </Button>
    </div>
  );
}

// ⌘/Ctrl+Z → undo, ⇧⌘/Ctrl+Shift+Z or Ctrl+Y → redo. Returns true when handled.
export function handleUndoRedoKey(
  event: KeyboardEvent | React.KeyboardEvent,
  actions: { undo: () => void; redo: () => void },
): boolean {
  if (!(event.metaKey || event.ctrlKey)) return false;
  const key = event.key.toLowerCase();
  if (key === 'z') {
    event.preventDefault();
    if (event.shiftKey) actions.redo();
    else actions.undo();
    return true;
  }
  if (key === 'y') {
    event.preventDefault();
    actions.redo();
    return true;
  }
  return false;
}

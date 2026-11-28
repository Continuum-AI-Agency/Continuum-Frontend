'use client';

// The draw-tool strip shared by the image stage and the paused video frame:
// tool, colour, undo/redo. Keyboard: ⌘/Ctrl+Z undoes, ⇧⌘/Ctrl+Shift+Z (or
// Ctrl+Y) redoes while the stage has focus — wired by the host, which owns focus.

import type { DrawingTool } from '@continuum/contracts';
import { ArrowUpRight, MousePointer2, Pencil, Redo2, Slash, Square, Undo2 } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import { useMemo as useUiConfigMemo } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DRAWING_COLORS } from './drawing';

export type StageTool = 'point' | DrawingTool;

function useLocalToolsMessages() {
  const translateConfig = useUiTranslations('library');
  return useUiConfigMemo(() => {
    const value: ReadonlyArray<{ value: StageTool; label: string; icon: typeof Pencil }> = [
      { value: 'point', label: translateConfig('pin_ff1cee74'), icon: MousePointer2 },
      { value: 'arrow', label: translateConfig('arrow_05800e70'), icon: ArrowUpRight },
      { value: 'line', label: translateConfig('line_d7852cd0'), icon: Slash },
      { value: 'box', label: translateConfig('rectangle_03069962'), icon: Square },
      { value: 'freehand', label: translateConfig('freehand_dbf41ae1'), icon: Pencil },
    ];
    return value;
  }, [translateConfig]);
}

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
  const TOOLS = useLocalToolsMessages();

  const translateUi = useUiTranslations('library');

  return (
    <div
      role="toolbar"
      aria-label={translateUi('annotation_tools_fa7d8c17')}
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
            aria-label={translateUi('value0_annotation_b574cf0f', { value0: String(label) })}
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
          aria-label={translateUi('colour_value0_447e6404', { value0: String(swatch) })}
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
        aria-label={translateUi('undo_a8283ade')}
        title={translateUi('undo_z_9c72706a')}
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
        aria-label={translateUi('redo_74273989')}
        title={translateUi('redo_z_a212a69e')}
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

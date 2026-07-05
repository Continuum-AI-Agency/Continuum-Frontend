import { useEffect, useRef } from 'react';

// In-editor keyboard map for the Video Editor dialog. The canvas-level handlers
// stand down while the editor is open (keyboardScope === 'modal'), so this owns
// the keys instead: Delete removes the selected clip (NOT the canvas node),
// Space toggles playback, S splits at the playhead, arrows scrub. Latest props
// are read through a ref so the window listener is registered once per open and
// never re-binds on every playhead tick.

const FRAME_STEP_SEC = 1 / 30;
const COARSE_STEP_SEC = 1;

export interface TimelineKeymapParams {
  enabled: boolean;
  playheadSec: number;
  totalSec: number;
  onSeek: (sec: number) => void;
  onTogglePlay: () => void;
  onDeleteSelected: () => void;
  onSplitAtPlayhead: () => void;
  onDuplicateSelected: () => void;
  onToggleMarker: () => void;
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

export function useTimelineKeymap(params: TimelineKeymapParams): void {
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const { enabled } = params;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const current = paramsRef.current;
      if (!current.enabled) return;
      // Never hijack typing in the inspector's numeric fields.
      if (isTextEntryTarget(event.target)) return;
      // Leave OS/browser combos (undo, save, etc.) alone.
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const clamp = (sec: number) => Math.max(0, Math.min(current.totalSec, sec));

      switch (event.key) {
        case 'Delete':
        case 'Backspace':
          event.preventDefault();
          current.onDeleteSelected();
          return;
        case ' ': {
          // Let a focused button (Play, or a dnd-kit sortable clip which carries
          // role="button") handle its own Space so we don't double-fire.
          const target = event.target as HTMLElement | null;
          if (target?.closest('button,[role="button"]')) return;
          event.preventDefault();
          current.onTogglePlay();
          return;
        }
        case 'ArrowLeft':
          event.preventDefault();
          current.onSeek(
            clamp(current.playheadSec - (event.shiftKey ? COARSE_STEP_SEC : FRAME_STEP_SEC)),
          );
          return;
        case 'ArrowRight':
          event.preventDefault();
          current.onSeek(
            clamp(current.playheadSec + (event.shiftKey ? COARSE_STEP_SEC : FRAME_STEP_SEC)),
          );
          return;
        case 'Home':
          event.preventDefault();
          current.onSeek(0);
          return;
        case 'End':
          event.preventDefault();
          current.onSeek(current.totalSec);
          return;
        case 's':
        case 'S':
          event.preventDefault();
          current.onSplitAtPlayhead();
          return;
        case 'd':
        case 'D':
          event.preventDefault();
          current.onDuplicateSelected();
          return;
        case 'm':
        case 'M':
          event.preventDefault();
          current.onToggleMarker();
          return;
        default:
          return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);
}

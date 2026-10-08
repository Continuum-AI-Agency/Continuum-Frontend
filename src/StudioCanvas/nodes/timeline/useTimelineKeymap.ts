import { useEffect, useRef } from 'react';

// The Video Studio's keyboard map. One window listener, registered once per mount;
// the latest handlers are read through a ref so it never re-binds on a playhead tick.
// Keys never fire while a text field has focus, so the inspector's inputs keep theirs.

const FRAME_STEP_SEC = 1 / 30;
const COARSE_STEP_SEC = 1;

export type TimelineShortcut =
  | 'togglePlay'
  | 'shuttleBack'
  | 'pause'
  | 'shuttleForward'
  | 'frameBack'
  | 'frameForward'
  | 'secondBack'
  | 'secondForward'
  | 'toStart'
  | 'toEnd'
  | 'split'
  | 'trimStartToPlayhead'
  | 'trimEndToPlayhead'
  | 'rippleDelete'
  | 'undo'
  | 'redo'
  | 'copy'
  | 'paste'
  | 'duplicate'
  | 'palette'
  | 'marker'
  | 'deselect';

/** How each shortcut is written in tooltips and the ⌘K palette. */
export const TIMELINE_SHORTCUT_KEYS: Record<TimelineShortcut, string> = {
  togglePlay: 'Space',
  shuttleBack: 'J',
  pause: 'K',
  shuttleForward: 'L',
  frameBack: '←',
  frameForward: '→',
  secondBack: '⇧←',
  secondForward: '⇧→',
  toStart: 'Home',
  toEnd: 'End',
  split: 'S',
  trimStartToPlayhead: 'Q',
  trimEndToPlayhead: 'W',
  rippleDelete: '⌫',
  undo: '⌘Z',
  redo: '⇧⌘Z',
  copy: '⌘C',
  paste: '⌘V',
  duplicate: '⌘D',
  palette: '⌘K',
  marker: 'M',
  deselect: 'Esc',
};

type ShortcutKey = Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>;

export function resolveTimelineHistoryShortcut(event: ShortcutKey): 'undo' | 'redo' | null {
  if (event.altKey || (!event.metaKey && !event.ctrlKey)) return null;
  const key = event.key.toLowerCase();
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && !event.shiftKey) return 'redo';
  return null;
}

const COMMAND_KEYS: Record<string, TimelineShortcut> = {
  c: 'copy',
  v: 'paste',
  d: 'duplicate',
  k: 'palette',
};

const PLAIN_KEYS: Record<string, TimelineShortcut> = {
  ' ': 'togglePlay',
  j: 'shuttleBack',
  k: 'pause',
  l: 'shuttleForward',
  s: 'split',
  q: 'trimStartToPlayhead',
  w: 'trimEndToPlayhead',
  m: 'marker',
  delete: 'rippleDelete',
  backspace: 'rippleDelete',
  home: 'toStart',
  end: 'toEnd',
  escape: 'deselect',
};

export function resolveTimelineShortcut(event: ShortcutKey): TimelineShortcut | null {
  const history = resolveTimelineHistoryShortcut(event);
  if (history) return history;
  const key = event.key.toLowerCase();
  if (event.metaKey || event.ctrlKey) return event.altKey ? null : (COMMAND_KEYS[key] ?? null);
  if (event.altKey) return null;
  if (key === 'arrowleft') return event.shiftKey ? 'secondBack' : 'frameBack';
  if (key === 'arrowright') return event.shiftKey ? 'secondForward' : 'frameForward';
  return PLAIN_KEYS[key] ?? null;
}

const SEEK_STEPS: Partial<Record<TimelineShortcut, number>> = {
  frameBack: -FRAME_STEP_SEC,
  frameForward: FRAME_STEP_SEC,
  secondBack: -COARSE_STEP_SEC,
  secondForward: COARSE_STEP_SEC,
};

export interface TimelineKeymapParams {
  enabled: boolean;
  /** Read at key time: the playhead moves every frame and must not re-render the host. */
  getPlayheadSec: () => number;
  totalSec: number;
  onSeek: (sec: number) => void;
  /**
   * Every shortcut except seeking. An absent handler, or one that returns `false`, leaves
   * the key to the browser — ⌘C over selected text still copies the text.
   */
  handlers: Partial<Record<TimelineShortcut, () => boolean | undefined | void>>;
}

const TEXT_INPUT_TYPES = new Set([
  '',
  'text',
  'search',
  'email',
  'url',
  'tel',
  'password',
  'number',
  'date',
  'time',
]);

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
    return true;
  }
  return target instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(target.type);
}

/** A slider keeps its own arrow keys. */
const isRangeTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  ((target instanceof HTMLInputElement && target.type === 'range') ||
    target.getAttribute('role') === 'slider');

/**
 * An open modal (palette, export, Library picker, a sheet) owns the keyboard. Matched by
 * the modal popups themselves: toasts are `role="dialog"` too, and a toast must not
 * switch the shortcuts off.
 */
const MODAL_SELECTOR =
  '[data-slot="dialog-content"],[data-slot="alert-dialog-content"],[data-slot="sheet-content"],[role="dialog"][aria-modal="true"]';
const dialogIsOpen = (): boolean => Boolean(document.querySelector(MODAL_SELECTOR));

export function useTimelineKeymap(params: TimelineKeymapParams): void {
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const { enabled } = params;

  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const current = paramsRef.current;
      if (!current.enabled || isTextEntryTarget(event.target) || dialogIsOpen()) return;
      const shortcut = resolveTimelineShortcut(event);
      if (!shortcut) return;
      const clamp = (sec: number) => Math.max(0, Math.min(current.totalSec, sec));
      const step = SEEK_STEPS[shortcut];
      if (step !== undefined) {
        if (isRangeTarget(event.target)) return;
        event.preventDefault();
        current.onSeek(clamp(current.getPlayheadSec() + step));
        return;
      }
      if (shortcut === 'toStart' || shortcut === 'toEnd') {
        event.preventDefault();
        current.onSeek(shortcut === 'toStart' ? 0 : current.totalSec);
        return;
      }
      const handler = current.handlers[shortcut];
      if (!handler) return;
      // Space plays; it never re-presses whichever toolbar button was clicked last.
      if (shortcut === 'togglePlay' && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      if (handler() === false) return;
      event.preventDefault();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);
}

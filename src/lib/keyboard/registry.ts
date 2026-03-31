type ShortcutHandler = (event: KeyboardEvent) => void;

interface ShortcutBinding {
  key: string;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: ShortcutHandler;
  description: string;
  /** When true, the shortcut fires even when focus is inside an input/textarea. */
  allowInInput?: boolean;
}

const shortcuts = new Map<string, ShortcutBinding>();
let listenerAttached = false;

function matchesBinding(event: KeyboardEvent, binding: ShortcutBinding): boolean {
  const wantsMeta = binding.meta ?? false;
  const wantsShift = binding.shift ?? false;
  const wantsAlt = binding.alt ?? false;

  const hasMeta = event.metaKey || event.ctrlKey;

  return (
    event.key.toLowerCase() === binding.key.toLowerCase() &&
    hasMeta === wantsMeta &&
    event.shiftKey === wantsShift &&
    event.altKey === wantsAlt
  );
}

function handleKeyDown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  const tagName = target?.tagName;
  const inInput = tagName === "INPUT" || tagName === "TEXTAREA" || target?.isContentEditable;

  for (const binding of shortcuts.values()) {
    if (inInput && !binding.allowInInput) continue;
    if (matchesBinding(event, binding)) {
      event.preventDefault();
      binding.handler(event);
      return;
    }
  }
}

function ensureListener() {
  if (listenerAttached || typeof document === "undefined") return;
  document.addEventListener("keydown", handleKeyDown);
  listenerAttached = true;
}

function detachIfEmpty() {
  if (shortcuts.size > 0 || !listenerAttached) return;
  document.removeEventListener("keydown", handleKeyDown);
  listenerAttached = false;
}

export function registerShortcut(id: string, binding: ShortcutBinding) {
  ensureListener();
  shortcuts.set(id, binding);
}

export function unregisterShortcut(id: string) {
  shortcuts.delete(id);
  detachIfEmpty();
}

export function getRegisteredShortcuts(): Array<{ id: string } & ShortcutBinding> {
  return Array.from(shortcuts.entries()).map(([id, binding]) => ({
    id,
    ...binding,
  }));
}

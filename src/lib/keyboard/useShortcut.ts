import { useEffect, useRef } from "react";
import { registerShortcut, unregisterShortcut } from "./registry";

interface ShortcutOptions {
  key: string;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  description: string;
  allowInInput?: boolean;
}

export function useShortcut(
  id: string,
  options: ShortcutOptions,
  handler: (event: KeyboardEvent) => void,
) {
  // Stable ref so handler identity changes don't cause re-registration
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    registerShortcut(id, {
      ...options,
      handler: (event) => handlerRef.current(event),
    });
    return () => unregisterShortcut(id);
    // handler is intentionally excluded — changes are captured via ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, options.key, options.meta, options.shift, options.alt, options.description, options.allowInInput]);
}

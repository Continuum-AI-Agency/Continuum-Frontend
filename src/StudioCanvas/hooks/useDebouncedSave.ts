import { useCallback, useRef, useEffect } from 'react';
import { useStudioStore } from '../stores/useStudioStore';

export function useDebouncedSave(delay = 1000) {
  const triggerSave = useStudioStore((state) => state.triggerSave);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      triggerSave();
    }, delay);
  }, [triggerSave, delay]);
}

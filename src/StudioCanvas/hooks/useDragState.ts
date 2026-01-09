import { useState, useCallback } from 'react';

export function useDragState() {
  const [isDragging, setIsDragging] = useState(false);

  const onDragStart = useCallback(() => {
    setIsDragging(true);
  }, []);

  const onDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  return {
    isDragging,
    onDragStart,
    onDragEnd,
  };
}

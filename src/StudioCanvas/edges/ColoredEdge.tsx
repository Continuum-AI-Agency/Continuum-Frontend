import React from 'react';
import { BaseEdge, EdgeProps, getBezierPath } from '@xyflow/react';

export function ColoredEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  targetHandleId,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  let edgeColor = 'var(--edge-text)'; 
  
  if (targetHandleId === 'prompt' || targetHandleId === 'prompt-in' || targetHandleId === 'trigger') {
    edgeColor = 'var(--edge-text)';
  } else if (targetHandleId === 'ref-image' || targetHandleId === 'image' || targetHandleId === 'first-frame' || targetHandleId === 'last-frame') {
    edgeColor = 'var(--edge-image)'; 
  } else if (targetHandleId === 'ref-video' || targetHandleId === 'video') {
    edgeColor = 'var(--edge-video)'; 
  }

  return (
    <>
      <BaseEdge 
        path={edgePath} 
        markerEnd={markerEnd} 
        style={{ 
          ...style, 
          ['--edge-color' as keyof React.CSSProperties]: edgeColor, 
        }} 
        className="studio-edge-path"
      />
    </>
  );
}

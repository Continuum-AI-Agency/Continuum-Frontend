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

  let edgeColor = '#94a3b8'; 

  if (targetHandleId === 'prompt' || targetHandleId === 'prompt-in') {
    edgeColor = '#6366f1'; 
  } else if (targetHandleId === 'negative') {
    edgeColor = '#ef4444'; 
  } else if (targetHandleId === 'ref-image' || targetHandleId === 'image' || targetHandleId === 'first-frame' || targetHandleId === 'last-frame') {
    if (targetHandleId === 'first-frame') edgeColor = '#10b981'; 
    else if (targetHandleId === 'last-frame') edgeColor = '#f97316'; 
    else edgeColor = '#a855f7'; 
  } else if (targetHandleId === 'ref-video' || targetHandleId === 'video') {
    edgeColor = '#ec4899'; 
  }

  return (
    <>
      <BaseEdge 
        path={edgePath} 
        markerEnd={markerEnd} 
        style={{ ...style, strokeWidth: 3, stroke: edgeColor }} 
        className="react-flow__edge-path"
      />
    </>
  );
}

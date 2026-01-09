"use client";

import React, { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';

/**
 * AnimatedEdge - An edge with animated stroke dash array to show data flow
 * 
 * The animation creates a flowing effect that indicates active data transfer.
 * Stroke color and width reflect the data type (text/image/video).
 */
export const AnimatedEdge = memo(({ 
  style, 
  sourceX, 
  sourceY, 
  targetX, 
  targetY, 
  sourcePosition, 
  targetPosition,
  data,
  markerEnd,
}: EdgeProps) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  // Data type determines animation speed and color intensity
  const dataType = data?.dataType || 'text';
  const animationDuration = dataType === 'video' ? '1s' : dataType === 'image' ? '1.5s' : '2s';

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeDasharray: '8 4',
          animation: `flowAnimation ${animationDuration} linear infinite`,
        }}
      />
      <style>{`
        @keyframes flowAnimation {
          from {
            stroke-dashoffset: 24;
          }
          to {
            stroke-dashoffset: 0;
          }
        }
      `}</style>
    </>
  );
});

AnimatedEdge.displayName = 'AnimatedEdge';

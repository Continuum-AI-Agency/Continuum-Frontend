"use client";

import React, { memo } from 'react';
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';
import { getDataTypeEdgeStyle, type DataTypeEdgeData } from './DataTypeEdge';

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
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const edgeData = data as DataTypeEdgeData | undefined;
  const isActive = edgeData?.isActive ?? false;

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...getDataTypeEdgeStyle(edgeData?.dataType),
          ...style,
        }}
        className={isActive ? 'studio-edge-path studio-edge-path--active' : 'studio-edge-path'}
      />
    </>
  );
});

AnimatedEdge.displayName = 'AnimatedEdge';

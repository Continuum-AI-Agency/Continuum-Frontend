"use client";

import React, { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';

/**
 * DataTypeEdge - An edge colored and styled based on the data type it carries
 * 
 * Provides visual differentiation between:
 * - text: Gray/slate colored edges
 * - image: Indigo/purple colored edges
 * - video: Green/emerald colored edges
 */
export interface DataTypeEdgeData {
  dataType?: 'text' | 'image' | 'video';
  label?: string;
}

/**
 * Get edge styling based on data type
 */
export function getDataTypeEdgeStyle(dataType?: string): React.CSSProperties {
  switch (dataType) {
    case 'image':
      return {
        stroke: '#6366f1', // indigo-500
        strokeWidth: 2,
      };
    case 'video':
      return {
        stroke: '#10b981', // emerald-500
        strokeWidth: 2,
      };
    case 'text':
    default:
      return {
        stroke: '#94a3b8', // slate-400
        strokeWidth: 2,
      };
  }
}

/**
 * Get marker color based on data type
 */
export function getDataTypeMarkerColor(dataType?: string): string {
  switch (dataType) {
    case 'image':
      return '#6366f1'; // indigo-500
    case 'video':
      return '#10b981'; // emerald-500
    case 'text':
    default:
      return '#94a3b8'; // slate-400
  }
}

export const DataTypeEdge = memo(({ 
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

  const edgeData = data as DataTypeEdgeData | undefined;
  
  // Data type determines animation speed
  const dataType = edgeData?.dataType || 'text';
  const animationDuration = dataType === 'video' ? '1s' : dataType === 'image' ? '1.5s' : '2s';

  // Merge custom style with data type style
  const dataTypeStyle = getDataTypeEdgeStyle(edgeData?.dataType);
  const mergedStyle = {
    ...dataTypeStyle,
    ...style,
    strokeDasharray: '8 4',
    animation: `flowAnimation ${animationDuration} linear infinite`,
  };

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={mergedStyle}
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
      {edgeData?.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
            }}
          >
            <div className="rounded-md bg-background/90 px-2 py-1 text-xs font-medium text-foreground shadow-sm border">
              {edgeData.label}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

DataTypeEdge.displayName = 'DataTypeEdge';

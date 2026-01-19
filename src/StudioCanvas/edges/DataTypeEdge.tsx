"use client";

import React, { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  type EdgeProps,
} from '@xyflow/react';

/**
 * DataTypeEdge - An edge colored and styled based on the data type it carries
 * 
 * Provides visual differentiation between:
 * - text: Gray/slate colored edges
 * - image: Indigo/purple colored edges
 * - video: Green/emerald colored edges
 */
export interface DataTypeEdgeData {
  dataType?: 'text' | 'image' | 'video' | 'audio' | 'document';
  label?: string;
  isActive?: boolean;
  isDotted?: boolean;
  pathType?: 'bezier' | 'straight' | 'step' | 'smoothstep';
}

/**
 * Get edge styling based on data type
 */
export function getDataTypeEdgeStyle(dataType?: string): React.CSSProperties {
  const token =
    dataType === 'image'
      ? 'var(--edge-image)'
      : dataType === 'video'
        ? 'var(--edge-video)'
        : dataType === 'audio'
          ? 'var(--edge-audio, #10b981)'
          : dataType === 'document'
            ? 'var(--edge-document, #f59e0b)'
            : 'var(--edge-text)';

  return {
    ['--edge-color' as keyof React.CSSProperties]: token,
  };
}

/**
 * Get marker color based on data type
 */
export function getDataTypeMarkerColor(dataType?: string): string {
  if (dataType === 'image') return 'var(--edge-image)';
  if (dataType === 'video') return 'var(--edge-video)';
  if (dataType === 'audio') return 'var(--edge-audio, #10b981)';
  if (dataType === 'document') return 'var(--edge-document, #f59e0b)';
  return 'var(--edge-text)';
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
  const edgeData = data as DataTypeEdgeData | undefined;
  
  const dataType = edgeData?.dataType || 'text';
  const isActive = edgeData?.isActive ?? false;
  const isDotted = edgeData?.isDotted ?? false;
  const pathType = edgeData?.pathType || 'bezier';

  const getPath = () => {
    const params = {
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    };

    if (pathType === 'straight') return getStraightPath(params);
    if (pathType === 'step' || pathType === 'smoothstep') return getSmoothStepPath(params);
    return getBezierPath(params);
  };

  const [edgePath, labelX, labelY] = getPath();

  // Merge custom style with data type style
  const dataTypeStyle = getDataTypeEdgeStyle(edgeData?.dataType);
  const mergedStyle = {
    ...dataTypeStyle,
    ...style,
  };

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={mergedStyle}
        className={
          [
            'studio-edge-path',
            isDotted ? 'studio-edge-path--inactive' : '',
            isActive ? 'studio-edge-path--active-base' : '',
          ]
            .filter(Boolean)
            .join(' ')
        }
      />
      {isActive && (
        <path
          className="studio-edge-path studio-edge-path--flow"
          d={edgePath}
          fill="none"
          style={mergedStyle}
        />
      )}
      {edgeData?.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
              ...getDataTypeEdgeStyle(edgeData?.dataType),
            }}
          >
            <div className="studio-handle-pill rounded-md px-2 py-1 text-[10px] font-medium uppercase tracking-tight shadow-sm">
              {edgeData.label}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

DataTypeEdge.displayName = 'DataTypeEdge';

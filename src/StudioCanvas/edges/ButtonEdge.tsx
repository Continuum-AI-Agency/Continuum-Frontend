"use client";

import React, { memo, useCallback } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps, useReactFlow } from '@xyflow/react';

import { Cross2Icon } from '@radix-ui/react-icons';

/**
 * ButtonEdge - An edge with a delete button in the center
 * 
 * Provides quick access to delete individual edges without using keyboard shortcuts.
 * The button appears on hover and is positioned at the edge's midpoint.
 */
export const ButtonEdge = memo(({ 
  id,
  style, 
  sourceX, 
  sourceY, 
  targetX, 
  targetY, 
  sourcePosition, 
  targetPosition,
  markerEnd,
}: EdgeProps) => {
  const { deleteElements } = useReactFlow();

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const onDelete = useCallback(() => {
    deleteElements({ edges: [{ id }] });
  }, [id, deleteElements]);

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={style}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
          }}
        >
          <button
            className="nodrag group flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background shadow-sm transition-all hover:scale-110 hover:border-red-500 hover:bg-red-50"
            onClick={onDelete}
            onPointerDown={(e) => e.stopPropagation()}
            title="Delete edge"
          >
            <Cross2Icon className="h-3 w-3 text-muted-foreground transition-colors group-hover:text-red-500" />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
});

ButtonEdge.displayName = 'ButtonEdge';

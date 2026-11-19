'use client';

import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  useReactFlow,
} from '@xyflow/react';
import { useTranslations as useUiTranslations } from 'next-intl';
import type React from 'react';
import { memo, useState } from 'react';
import { Button } from '@/components/ui/button';

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

export const DataTypeEdge = memo(
  ({
    style,
    id,
    source,
    target,
    selected,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    markerEnd,
  }: EdgeProps) => {
    const translateUi = useUiTranslations('studio');

    const { deleteElements } = useReactFlow();
    const [showDetails, setShowDetails] = useState(false);
    const [showReconnectHint, setShowReconnectHint] = useState(false);
    const edgeData = data as DataTypeEdgeData | undefined;

    const dataType = edgeData?.dataType || 'text';
    const dataTypeLabel = translateUi(
      (
        {
          text: 'text_71988c4d',
          image: 'image_1aa4cb0b',
          video: 'video_d534be82',
          audio: 'audio_bc1b8890',
          document: 'document_d6bd8c0a',
        } as const
      )[dataType],
    );
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
          id={id}
          path={edgePath}
          markerEnd={markerEnd}
          style={mergedStyle}
          className={[
            'studio-edge-path',
            isDotted ? 'studio-edge-path--inactive' : '',
            isActive ? 'studio-edge-path--active-base' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          interactionWidth={20}
        />
        {isActive && (
          <path
            className="studio-edge-path studio-edge-path--flow"
            d={edgePath}
            fill="none"
            style={mergedStyle}
            aria-hidden
          />
        )}
        {(edgeData?.label || selected) && (
          <EdgeLabelRenderer>
            <div
              style={{
                position: 'absolute',
                transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                pointerEvents: 'all',
                ...getDataTypeEdgeStyle(edgeData?.dataType),
              }}
            >
              <div className="studio-handle-pill rounded-md px-2 py-1 text-2xs font-medium uppercase tracking-tight shadow-sm">
                {edgeData?.label ?? dataTypeLabel}
              </div>
              {selected ? (
                <div
                  className="nodrag nowheel mt-1 flex min-w-max items-center gap-1 rounded-md border border-border bg-background p-1 text-xs shadow-sm"
                  role="toolbar"
                  aria-label={translateUi('connection_from_value0_to_value1_7337eeb1', {
                    value0: String(source),
                    value1: String(target),
                  })}
                >
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    aria-expanded={showDetails}
                    onClick={() => setShowDetails((value) => !value)}
                  >
                    {' '}
                    {translateUi('inspect_e0723a86')}{' '}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => setShowReconnectHint(true)}
                  >
                    {' '}
                    {translateUi('reconnect_bf8a9eab')}{' '}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-destructive"
                    onClick={() => void deleteElements({ edges: [{ id }] })}
                  >
                    {' '}
                    {translateUi('delete_e2d0a549')}{' '}
                  </Button>
                  {showDetails ? (
                    <span className="px-1 text-muted-foreground">
                      {source} → {target} · {dataTypeLabel}
                    </span>
                  ) : null}
                  {showReconnectHint ? (
                    <span className="px-1 text-muted-foreground" role="status">
                      {' '}
                      {translateUi('drag_either_endpoint_to_a_compatibl_c0ad6ea9')}{' '}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </EdgeLabelRenderer>
        )}
      </>
    );
  },
);

DataTypeEdge.displayName = 'DataTypeEdge';

// House-modified: diverged from the upstream ai-elements component of the same name.
// Re-running the ai-elements CLI would overwrite this file by filename and lose the changes.

import type { EdgeProps } from '@xyflow/react';
import { BaseEdge, getBezierPath, getSmoothStepPath, getStraightPath } from '@xyflow/react';
import type { CSSProperties } from 'react';
import { useCampaignStore } from '@/CampaignCanvas/stores/useCampaignStore';

const Temporary = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps) => {
  const edgeStyle = useCampaignStore((state) => state.edgeStyle);

  const [edgePath] =
    edgeStyle === 'straight'
      ? getStraightPath({
          sourceX,
          sourceY,
          targetX,
          targetY,
        })
      : getBezierPath({
          sourcePosition,
          sourceX,
          sourceY,
          targetPosition,
          targetX,
          targetY,
        });

  return (
    <BaseEdge
      className="stroke-1 stroke-ring"
      id={id}
      path={edgePath}
      style={{
        strokeDasharray: '5, 5',
      }}
    />
  );
};

const Animated = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
}: EdgeProps) => {
  const edgeStyle = useCampaignStore((state) => state.edgeStyle);

  // Use the coordinates React Flow already computed from the actual handles.
  // A previous version hardcoded Right→Left, which is the Studio convention;
  // CampaignCanvas handles sit Top/Bottom, so that path collapsed to M0,0 and
  // the edge was in the graph but invisible.
  const [edgePath] =
    edgeStyle === 'straight'
      ? getStraightPath({
          sourceX,
          sourceY,
          targetX,
          targetY,
        })
      : getBezierPath({
          sourcePosition,
          sourceX,
          sourceY,
          targetPosition,
          targetX,
          targetY,
        });

  return (
    <>
      <BaseEdge
        id={id}
        markerEnd={markerEnd}
        path={edgePath}
        style={style}
        className="transition-all duration-300 hover:stroke-[3px] cursor-pointer"
      />
      <circle fill="var(--primary)" r="4">
        <animateMotion dur="2s" path={edgePath} repeatCount="indefinite" />
      </circle>
    </>
  );
};

type DataType = 'text' | 'image' | 'video' | 'audio' | 'document';

type DataTypeEdgeData = {
  dataType?: DataType;
  isActive?: boolean;
  isDotted?: boolean;
  pathType?: 'bezier' | 'straight' | 'step' | 'smoothstep';
  label?: string;
};

const getDataTypeColorToken = (dataType?: DataType) => {
  if (dataType === 'image') return 'var(--edge-image)';
  if (dataType === 'video') return 'var(--edge-video)';
  if (dataType === 'audio') return 'var(--edge-audio, #10b981)';
  if (dataType === 'document') return 'var(--edge-document, #f59e0b)';
  return 'var(--edge-text)';
};

const DataType = ({
  style,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps) => {
  const edgeData = data as DataTypeEdgeData | undefined;
  const pathType = edgeData?.pathType ?? 'bezier';
  const isActive = edgeData?.isActive ?? false;
  const isDotted = edgeData?.isDotted ?? false;

  const pathArgs = {
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  };

  const [edgePath] =
    pathType === 'straight'
      ? getStraightPath(pathArgs)
      : pathType === 'step' || pathType === 'smoothstep'
        ? getSmoothStepPath(pathArgs)
        : getBezierPath(pathArgs);

  const mergedStyle: CSSProperties = {
    ['--edge-color' as keyof CSSProperties]: getDataTypeColorToken(edgeData?.dataType),
    ...style,
  };

  return (
    <>
      <BaseEdge
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
      />
      {isActive && (
        <path
          className="studio-edge-path studio-edge-path--flow"
          d={edgePath}
          fill="none"
          style={mergedStyle}
        />
      )}
    </>
  );
};

export const Edge = {
  Animated,
  Temporary,
  DataType,
};

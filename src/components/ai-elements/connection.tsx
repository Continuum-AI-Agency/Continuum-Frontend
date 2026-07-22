import type { ConnectionLineComponent } from '@xyflow/react';
import type { CSSProperties } from 'react';

const HALF = 0.5;

const IMAGE_CONNECTION_HANDLES = new Set([
  'image',
  'ref-image',
  'ref-images',
  'first-frame',
  'last-frame',
]);

const TEXT_CONNECTION_HANDLES = new Set(['text', 'prompt', 'prompt-in', 'negative', 'trigger']);

const resolveConnectionColor = (handleId?: string | null) => {
  if (!handleId || TEXT_CONNECTION_HANDLES.has(handleId)) {
    return 'var(--edge-text)';
  }
  if (IMAGE_CONNECTION_HANDLES.has(handleId)) {
    return 'var(--edge-image)';
  }
  if (handleId === 'video' || handleId === 'ref-video') {
    return 'var(--edge-video)';
  }
  if (handleId === 'audio') {
    return 'var(--edge-audio, #10b981)';
  }
  if (handleId === 'document') {
    return 'var(--edge-document, #f59e0b)';
  }
  return 'var(--edge-text)';
};

export const Connection: ConnectionLineComponent = ({
  fromX,
  fromY,
  toX,
  toY,
  fromHandle,
  connectionLineStyle,
}) => {
  const edgeColor = resolveConnectionColor(fromHandle?.id ?? null);
  const connectionStyle: CSSProperties = {
    ...connectionLineStyle,
    ['--edge-color' as keyof CSSProperties]: edgeColor,
  };

  return (
    <g>
      <path
        className="studio-connection-line"
        d={`M${fromX},${fromY} C ${fromX + (toX - fromX) * HALF},${fromY} ${fromX + (toX - fromX) * HALF},${toY} ${toX},${toY}`}
        fill="none"
        style={connectionStyle}
      />
      <circle
        cx={toX}
        cy={toY}
        fill="var(--surface-default)"
        r={3}
        stroke={edgeColor}
        strokeWidth={1.5}
      />
    </g>
  );
};

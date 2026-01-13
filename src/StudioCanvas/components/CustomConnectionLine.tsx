import React from 'react';
import { ConnectionLineComponentProps, getBezierPath } from '@xyflow/react';

const CustomConnectionLine = ({
  fromX,
  fromY,
  toX,
  toY,
  connectionLineStyle,
  fromHandle
}: ConnectionLineComponentProps) => {
  const [edgePath] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    targetX: toX,
    targetY: toY,
  });

  let strokeColor = 'var(--edge-text)';

  const handleId = fromHandle?.id;
  
  if (handleId === 'text' || handleId === 'prompt' || handleId === 'prompt-in' || handleId === 'trigger') {
      strokeColor = 'var(--edge-text)';
  } else if (handleId === 'image' || handleId === 'ref-image' || handleId === 'ref-images' || handleId === 'first-frame' || handleId === 'last-frame') {
      strokeColor = 'var(--edge-image)';
  } else if (handleId === 'video') {
      strokeColor = 'var(--edge-video)'; 
  }

  return (
    <g>
      <path
        fill="none"
        className="studio-connection-line"
        d={edgePath}
        style={{ 
          ...connectionLineStyle, 
          ['--edge-color' as keyof React.CSSProperties]: strokeColor,
        }}
      />
      <circle
        cx={toX}
        cy={toY}
        r={3}
        fill="var(--surface-default)"
        stroke={strokeColor}
        strokeWidth={1.5}
      />
    </g>
  );
};

export default CustomConnectionLine;

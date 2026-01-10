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

  let strokeColor = '#94a3b8';

  const handleId = fromHandle?.id;
  
  if (handleId === 'text' || handleId === 'prompt' || handleId === 'prompt-in') {
      strokeColor = '#6366f1'; 
  } else if (handleId === 'negative') {
      strokeColor = '#ef4444'; 
  } else if (handleId === 'image' || handleId === 'ref-image' || handleId === 'first-frame' || handleId === 'last-frame') {
      if (handleId === 'first-frame') strokeColor = '#10b981';
      else if (handleId === 'last-frame') strokeColor = '#f97316';
      else strokeColor = '#a855f7'; 
  } else if (handleId === 'video' || handleId === 'ref-video') {
      strokeColor = '#ec4899'; 
  }

  return (
    <g>
      <path
        fill="none"
        strokeWidth={3}
        className="animated"
        d={edgePath}
        style={{ ...connectionLineStyle, stroke: strokeColor }}
      />
      <circle cx={toX} cy={toY} fill="#fff" r={3} stroke={strokeColor} strokeWidth={1.5} />
    </g>
  );
};

export default CustomConnectionLine;

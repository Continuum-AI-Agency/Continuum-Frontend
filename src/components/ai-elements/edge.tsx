import type { CSSProperties } from "react";
import type { EdgeProps, InternalNode, Node } from "@xyflow/react";

import {
  BaseEdge,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  Position,
  useInternalNode,
} from "@xyflow/react";
import { useCampaignStore } from "@/CampaignCanvas/stores/useCampaignStore";

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
  
  const [edgePath] = edgeStyle === 'straight' 
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
        strokeDasharray: "5, 5",
      }}
    />
  );
};

const getHandleCoordsByPosition = (
  node: InternalNode<Node>,
  handlePosition: Position
) => {
  const handleType = handlePosition === Position.Left ? "target" : "source";

  const handle = node.internals.handleBounds?.[handleType]?.find(
    (h) => h.position === handlePosition
  );

  if (!handle) {
    return [0, 0] as const;
  }

  let offsetX = handle.width / 2;
  let offsetY = handle.height / 2;

  switch (handlePosition) {
    case Position.Left: {
      offsetX = 0;
      break;
    }
    case Position.Right: {
      offsetX = handle.width;
      break;
    }
    case Position.Top: {
      offsetY = 0;
      break;
    }
    case Position.Bottom: {
      offsetY = handle.height;
      break;
    }
    default: {
      throw new Error(`Invalid handle position: ${handlePosition}`);
    }
  }

  const x = node.internals.positionAbsolute.x + handle.x + offsetX;
  const y = node.internals.positionAbsolute.y + handle.y + offsetY;

  return [x, y] as const;
};

const getEdgeParams = (
  source: InternalNode<Node>,
  target: InternalNode<Node>
) => {
  const sourcePos = Position.Right;
  const [sx, sy] = getHandleCoordsByPosition(source, sourcePos);
  const targetPos = Position.Left;
  const [tx, ty] = getHandleCoordsByPosition(target, targetPos);

  return {
    sourcePos,
    sx,
    sy,
    targetPos,
    tx,
    ty,
  };
};

const Animated = ({ id, source, target, markerEnd, style }: EdgeProps) => {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const edgeStyle = useCampaignStore((state) => state.edgeStyle);

  if (!(sourceNode && targetNode)) {
    return null;
  }

  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(
    sourceNode,
    targetNode
  );

  const [edgePath] = edgeStyle === 'straight'
    ? getStraightPath({
        sourceX: sx,
        sourceY: sy,
        targetX: tx,
        targetY: ty,
      })
    : getBezierPath({
        sourcePosition: sourcePos,
        sourceX: sx,
        sourceY: sy,
        targetPosition: targetPos,
        targetX: tx,
        targetY: ty,
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

type DataType = "text" | "image" | "video" | "audio" | "document";

type DataTypeEdgeData = {
  dataType?: DataType;
  isActive?: boolean;
  isDotted?: boolean;
  pathType?: "bezier" | "straight" | "step" | "smoothstep";
  label?: string;
};

const getDataTypeColorToken = (dataType?: DataType) => {
  if (dataType === "image") return "var(--edge-image)";
  if (dataType === "video") return "var(--edge-video)";
  if (dataType === "audio") return "var(--edge-audio, #10b981)";
  if (dataType === "document") return "var(--edge-document, #f59e0b)";
  return "var(--edge-text)";
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
  const pathType = edgeData?.pathType ?? "bezier";
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
    pathType === "straight"
      ? getStraightPath(pathArgs)
      : pathType === "step" || pathType === "smoothstep"
        ? getSmoothStepPath(pathArgs)
        : getBezierPath(pathArgs);

  const mergedStyle: CSSProperties = {
    ["--edge-color" as keyof CSSProperties]: getDataTypeColorToken(edgeData?.dataType),
    ...style,
  };

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={mergedStyle}
        className={[
          "studio-edge-path",
          isDotted ? "studio-edge-path--inactive" : "",
          isActive ? "studio-edge-path--active-base" : "",
        ]
          .filter(Boolean)
          .join(" ")}
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

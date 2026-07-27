'use client';

import {
  type Connection,
  Handle,
  type HandleProps,
  useNodeConnections,
  useNodeId,
} from '@xyflow/react';
import { useMemo } from 'react';

export interface ConnectionLimitHandleProps extends Omit<HandleProps, 'isConnectable'> {
  /** Human-readable port name. Defaults to the handle id. */
  name?: string;
  /** Data carried by this port. Defaults from the canonical handle vocabulary. */
  dataType?: 'text' | 'image' | 'video' | 'audio' | 'document' | 'media';
  /**
   * Maximum number of connections allowed (undefined = unlimited)
   */
  maxConnections?: number;
  /**
   * Connection type to count (only applicable for source handles with multiple types)
   */
  connectionType?: 'source' | 'target';
  /**
   * Custom error message when limit is reached
   */
  errorMessage?: string;
  /**
   * Callback when connection limit is reached
   */
  onLimitReached?: () => void;
}

/**
 * CustomHandle - A handle component that enforces connection limits
 *
 * Usage:
 * ```tsx
 * <CustomHandle
 *   type="target"
 *   position={Position.Left}
 *   id="prompt"
 *   maxConnections={1}
 *   errorMessage="Only one prompt connection allowed"
 * />
 * ```
 */
export function CustomHandle({
  maxConnections,
  connectionType,
  className,
  name,
  dataType,
  ...props
}: ConnectionLimitHandleProps) {
  const nodeId = useNodeId();
  const resolvedNodeId = nodeId ?? '__detached_custom_handle__';
  const resolvedConnectionType = connectionType ?? props.type;
  const connections = useNodeConnections({
    id: resolvedNodeId,
    handleType: resolvedConnectionType,
    handleId: props.id ?? undefined,
  });

  const isAtLimit = useMemo(() => {
    if (maxConnections === undefined) return false;
    return connections.length >= maxConnections;
  }, [maxConnections, connections.length]);

  const handleStyle = useMemo(() => {
    const baseStyle = props.style || {};

    if (isAtLimit) {
      return {
        ...baseStyle,
        opacity: 0.4,
        cursor: 'not-allowed',
      };
    }

    return baseStyle;
  }, [isAtLimit, props.style]);

  // Determine if handle is connectable
  const isConnectable = useMemo(() => {
    if (isAtLimit) return false;
    return true; // Default to true if not at limit
  }, [isAtLimit]);

  // Add visual indicator for limited handles
  const indicatorClassName = useMemo(() => {
    if (maxConnections === undefined) return '';
    if (isAtLimit) return 'ring-2 ring-border ring-offset-1';
    if (connections.length > 0) return 'ring-2 ring-primary/40 ring-offset-1';
    return '';
  }, [maxConnections, isAtLimit, connections.length]);

  const handleName = name ?? (props.id || 'port').replaceAll('-', ' ');
  const inferredDataType =
    dataType ??
    (props.id?.includes('image') || props.id?.includes('frame')
      ? 'image'
      : props.id?.includes('video')
        ? 'video'
        : props.id?.includes('audio')
          ? 'audio'
          : props.id?.includes('document')
            ? 'document'
            : 'text');
  const direction = props.type === 'source' ? 'output' : 'input';
  const capacity =
    maxConnections === undefined
      ? `${connections.length} connected`
      : `${connections.length} of ${maxConnections} connected`;
  const accessibleLabel = `${handleName}, ${direction}, ${inferredDataType}, ${capacity}`;

  return (
    <div className="relative">
      <Handle
        {...props}
        aria-label={accessibleLabel}
        title={accessibleLabel}
        isConnectable={isConnectable}
        style={handleStyle}
        className={`${className || ''} ${indicatorClassName} after:absolute after:-inset-1 after:content-['']`}
      />
      {maxConnections !== undefined && connections.length > 0 && (
        <span
          className="absolute -right-3 -top-3 rounded bg-background px-0.5 font-mono text-3xs text-muted-foreground"
          aria-hidden
        >
          {connections.length}/{maxConnections}
        </span>
      )}
    </div>
  );
}

/**
 * Hook to check if a handle has reached its connection limit
 */
export function useConnectionLimit(
  handleId: string,
  maxConnections?: number,
  type: 'source' | 'target' = 'target',
) {
  const nodeId = useNodeId();
  const resolvedNodeId = nodeId ?? '__detached_connection_limit__';
  const connections = useNodeConnections({
    id: resolvedNodeId,
    handleType: type,
    handleId,
  });

  return useMemo(() => {
    if (maxConnections === undefined)
      return { isAtLimit: false, remaining: Infinity, used: connections.length };
    return {
      isAtLimit: connections.length >= maxConnections,
      remaining: Math.max(0, maxConnections - connections.length),
      used: connections.length,
      max: maxConnections,
    };
  }, [maxConnections, connections.length]);
}

/**
 * Validate if a connection would exceed the limit
 */
export function validateConnectionLimit(
  existingConnections: Connection[],
  newConnection: Connection,
  maxConnections?: number,
): { valid: boolean; error?: string } {
  if (maxConnections === undefined) {
    return { valid: true };
  }

  // Count connections for this specific handle
  const handleId = newConnection.targetHandle || newConnection.sourceHandle;
  const isTarget = !!newConnection.targetHandle;

  const existingCount = existingConnections.filter((conn) => {
    const connHandleId = isTarget ? conn.targetHandle : conn.sourceHandle;
    return connHandleId === handleId;
  }).length;

  if (existingCount >= maxConnections) {
    return {
      valid: false,
      error: `Maximum ${maxConnections} connection${maxConnections === 1 ? '' : 's'} allowed`,
    };
  }

  return { valid: true };
}

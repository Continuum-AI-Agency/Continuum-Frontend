"use client";

import React, { useCallback, useMemo } from 'react';
import { Handle, Position, useHandleConnections, useNodeId, type HandleProps, type Connection } from '@xyflow/react';

export interface ConnectionLimitHandleProps extends Omit<HandleProps, 'isConnectable'> {
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
  connectionType = 'target',
  errorMessage = 'Connection limit reached',
  onLimitReached,
  className,
  ...props
}: ConnectionLimitHandleProps) {
  const nodeId = useNodeId();
  const connections = useHandleConnections({
    id: props.id,
    type: connectionType,
    nodeId,
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
    if (isAtLimit) return 'ring-2 ring-red-500 ring-offset-1';
    if (connections.length > 0) return 'ring-2 ring-amber-500 ring-offset-1';
    return '';
  }, [maxConnections, isAtLimit, connections.length]);

  return (
    <div className="relative">
      <Handle
        {...props}
        isConnectable={isConnectable}
        style={handleStyle}
        className={`${className || ''} ${indicatorClassName}`}
      />
      {maxConnections !== undefined && (
        <span className="absolute -top-3 -right-3 text-[8px] font-mono text-muted-foreground bg-background px-0.5 rounded">
          {connections.length}/{maxConnections}
        </span>
      )}
    </div>
  );
}

/**
 * Hook to check if a handle has reached its connection limit
 */
export function useConnectionLimit(handleId: string, maxConnections?: number, type: 'source' | 'target' = 'target') {
  const nodeId = useNodeId();
  const connections = useHandleConnections({
    id: handleId,
    type,
    nodeId,
  });

  return useMemo(() => {
    if (maxConnections === undefined) return { isAtLimit: false, remaining: Infinity, used: connections.length };
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
  maxConnections?: number
): { valid: boolean; error?: string } {
  if (maxConnections === undefined) {
    return { valid: true };
  }

  // Count connections for this specific handle
  const handleId = newConnection.targetHandle || newConnection.sourceHandle;
  const isTarget = !!newConnection.targetHandle;
  
  const existingCount = existingConnections.filter(conn => {
    const connHandleId = isTarget ? conn.targetHandle : conn.sourceHandle;
    return connHandleId === handleId;
  }).length;

  if (existingCount >= maxConnections) {
    return { valid: false, error: `Maximum ${maxConnections} connection${maxConnections === 1 ? '' : 's'} allowed` };
  }

  return { valid: true };
}

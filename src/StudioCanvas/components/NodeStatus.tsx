import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';

export type NodeExecutionStatus = 'idle' | 'running' | 'success' | 'error';

interface NodeStatusProps {
  status?: NodeExecutionStatus;
  errorMessage?: string;
  className?: string;
}

export function NodeStatus({ status = 'idle', errorMessage, className }: NodeStatusProps) {
  if (status === 'idle') return null;

  return (
    <div className={`absolute -top-3 right-2 z-10 ${className}`}>
      {status === 'running' && (
        <Badge variant="secondary" className="flex gap-1 items-center bg-blue-100 text-blue-700 border-blue-200 h-6">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span className="text-[10px]">Running</span>
        </Badge>
      )}
      {status === 'success' && (
        <Badge variant="secondary" className="flex gap-1 items-center bg-green-100 text-green-700 border-green-200 h-6">
          <CheckCircle2 className="w-3 h-3" />
          <span className="text-[10px]">Done</span>
        </Badge>
      )}
      {status === 'error' && (
        <Badge variant="destructive" className="flex gap-1 items-center h-6" title={errorMessage}>
          <XCircle className="w-3 h-3" />
          <span className="text-[10px]">Error</span>
        </Badge>
      )}
    </div>
  );
}

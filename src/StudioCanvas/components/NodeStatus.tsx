import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import React from 'react';
import { Badge } from '@/components/ui/badge';

export type NodeExecutionStatus = 'idle' | 'running' | 'success' | 'error';

interface NodeStatusProps {
  status?: NodeExecutionStatus;
  errorMessage?: string;
  className?: string;
}

export function NodeStatus({ status = 'idle', errorMessage, className }: NodeStatusProps) {
  const translateUi = useUiTranslations('studio');

  if (status === 'idle') return null;

  return (
    <div className={`absolute -top-3 right-2 z-10 ${className}`}>
      {status === 'running' && (
        <Badge
          variant="secondary"
          className="flex gap-1 items-center bg-blue-100 text-blue-700 border-blue-200 h-6"
        >
          <Loader2 className="w-3 h-3 animate-spin" />
          <span className="text-2xs">{translateUi('running_f4ccae29')}</span>
        </Badge>
      )}
      {status === 'success' && (
        <Badge
          variant="secondary"
          className="flex gap-1 items-center bg-green-100 text-green-700 border-green-200 h-6"
        >
          <CheckCircle2 className="w-3 h-3" />
          <span className="text-2xs">{translateUi('done_11a6767d')}</span>
        </Badge>
      )}
      {status === 'error' && (
        <Badge variant="destructive" className="flex gap-1 items-center h-6" title={errorMessage}>
          <XCircle className="w-3 h-3" />
          <span className="text-2xs">{translateUi('error_54a0e8c1')}</span>
        </Badge>
      )}
    </div>
  );
}

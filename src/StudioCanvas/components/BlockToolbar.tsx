import React from 'react';
import { Button } from '@/components/ui/button';
import { PlayIcon, CopyIcon, TrashIcon, DownloadIcon } from '@radix-ui/react-icons';
import { cn } from '@/lib/utils';

interface BlockToolbarProps {
  isVisible: boolean;
  onRun?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onDownload?: () => void;
  className?: string;
}

export function BlockToolbar({ 
  isVisible, 
  onRun, 
  onDuplicate, 
  onDelete, 
  onDownload,
  className 
}: BlockToolbarProps) {
  if (!isVisible) return null;

  return (
    <div className={cn(
      "absolute -top-10 left-1/2 -translate-x-1/2 flex items-center gap-1 p-1 bg-background/95 backdrop-blur border border-border rounded-md shadow-lg z-50 animate-in fade-in zoom-in-95 duration-200",
      className
    )}>
      {onRun && (
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRun} title="Run Node">
          <PlayIcon className="h-4 w-4" />
        </Button>
      )}
      {onDuplicate && (
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDuplicate} title="Duplicate">
          <CopyIcon className="h-4 w-4" />
        </Button>
      )}
      {onDownload && (
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDownload} title="Download Output">
          <DownloadIcon className="h-4 w-4" />
        </Button>
      )}
      {onDelete && (
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDelete} title="Delete">
          <TrashIcon className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

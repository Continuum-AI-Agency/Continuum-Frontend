'use client';

import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Panel } from '@/components/ai-elements/panel';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function CanvasFloatingPanel({
  title,
  icon,
  onClose,
  children,
  className,
  bodyClassName,
  position = 'top-left',
}: {
  title: string;
  icon?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  position?:
    | 'top-left'
    | 'top-center'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-center'
    | 'bottom-right';
}) {
  return (
    <Panel
      position={position}
      className={cn(
        'nodrag nowheel ml-1 mt-14 flex w-[380px] flex-col overflow-hidden border-border/70 bg-background/95 p-0 shadow-md backdrop-blur',
        className,
      )}
    >
      <div className="flex min-h-10 items-center justify-between border-b border-border/70 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          {icon}
          <span>{title}</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground"
          onClick={onClose}
          aria-label={`Close ${title.toLowerCase()}`}
        >
          <X className="size-4" aria-hidden />
        </Button>
      </div>
      <div className={cn('min-h-0 flex-1', bodyClassName)}>{children}</div>
    </Panel>
  );
}

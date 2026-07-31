'use client';

import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Group, Panel, Separator } from 'react-resizable-panels';

import { cn } from '@/lib/utils';

function ResizablePanelGroup({ className, ...props }: React.ComponentProps<typeof Group>) {
  return (
    <Group
      data-slot="resizable-panel-group"
      className={cn('flex h-full w-full aria-[orientation=vertical]:flex-col', className)}
      {...props}
    />
  );
}

function ResizablePanel({ ...props }: React.ComponentProps<typeof Panel>) {
  return <Panel data-slot="resizable-panel" {...props} />;
}

type ResizableHandleProps = React.ComponentProps<typeof Separator> & {
  withHandle?: boolean;
};

function ResizableHandle({ withHandle, className, ...props }: ResizableHandleProps) {
  return (
    <Separator
      data-slot="resizable-handle"
      className={cn(
        'bg-border/70 focus-visible:ring-ring group relative flex w-1.5 items-center justify-center after:absolute after:inset-y-0 after:left-1/2 after:w-3 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:outline-hidden aria-[orientation=horizontal]:h-1.5 aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:h-3 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:translate-x-0 aria-[orientation=horizontal]:after:-translate-y-1/2 hover:bg-primary/60 data-[separator-active]:bg-primary transition-colors cursor-col-resize aria-[orientation=horizontal]:cursor-row-resize',
        className,
      )}
      {...props}
    >
      {withHandle ? (
        <div
          aria-hidden="true"
          className="pointer-events-none bg-border z-10 flex h-8 w-2 flex-col items-center justify-center gap-0.5 rounded-full border shadow-sm transition-colors group-hover:bg-primary/20 group-hover:border-primary/60 aria-[orientation=horizontal]:h-2 aria-[orientation=horizontal]:w-8 aria-[orientation=horizontal]:flex-row"
        >
          <span className="h-1 w-px bg-muted-foreground/60 rounded-full" />
          <span className="h-1 w-px bg-muted-foreground/60 rounded-full" />
          <span className="h-1 w-px bg-muted-foreground/60 rounded-full" />
        </div>
      ) : null}
    </Separator>
  );
}

const COLLAPSE_CHEVRON = {
  left: ChevronLeftIcon,
  right: ChevronRightIcon,
  down: ChevronDownIcon,
} as const;

type ResizablePanelCollapseButtonProps = Omit<React.ComponentProps<'button'>, 'aria-label'> & {
  direction?: keyof typeof COLLAPSE_CHEVRON;
  label: string;
};

/**
 * A collapsible panel's own collapse control. It must be rendered INSIDE the collapsible
 * panel (in a `relative` wrapper), never inside `ResizableHandle`.
 *
 * react-resizable-panels captures pointer events for a drag on the document, so a button
 * nested in the separator starts a resize instead of collapsing — React's synthetic
 * `stopPropagation` cannot cancel a native capture, which is why the planner's e2e had to
 * click it with `force: true`. Wrapping the separator is not an option either: separators
 * must be direct DOM children of their group.
 */
function ResizablePanelCollapseButton({
  direction = 'right',
  label,
  className,
  ...props
}: ResizablePanelCollapseButtonProps) {
  const Chevron = COLLAPSE_CHEVRON[direction];
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        'bg-background hover:bg-accent absolute left-1 top-3 z-20 flex size-6 cursor-pointer items-center justify-center rounded-full border opacity-90 shadow-sm transition-colors hover:opacity-100',
        className,
      )}
      {...props}
    >
      <Chevron className="h-3.5 w-3.5 text-muted-foreground" />
    </button>
  );
}

export { ResizableHandle, ResizablePanel, ResizablePanelCollapseButton, ResizablePanelGroup };

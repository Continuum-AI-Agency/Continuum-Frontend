'use client';

import { Progress as ProgressPrimitive } from '@base-ui/react/progress';

import { cn } from '@/lib/utils';

// Base UI requires a Track between Root and Indicator. Root keeps the caller's className so the
// 19 consumers that style bar geometry/background through it are unaffected, and the indicator
// keeps `data-slot=progress-indicator` because call sites target it with descendant selectors.
function Progress({ className, value, ...props }: ProgressPrimitive.Root.Props) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      className={cn('bg-primary/20 relative h-2 w-full overflow-hidden rounded-full', className)}
      {...props}
    >
      <ProgressPrimitive.Track className="h-full w-full">
        <ProgressPrimitive.Indicator
          data-slot="progress-indicator"
          className="bg-primary h-full w-full flex-1"
          style={{
            transform: `translateX(-${100 - (value || 0)}%)`,
            transition: 'transform 1s ease-out',
          }}
        />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  );
}

export { Progress };

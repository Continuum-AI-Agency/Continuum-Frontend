'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type BlockSkeletonProps = { className?: string };

export function BlockSkeleton({ className }: BlockSkeletonProps) {
  return (
    <div
      // Marks "this block has not resolved yet" in the DOM. `renderExportDocument`
      // gates on the absence of these: `BlockRenderer` is lazy, and a document
      // printed a frame early is a page of skeletons that still looks like a file.
      data-block-skeleton=""
      className={cn('rounded-xl bg-muted/40 p-4', className)}
    >
      <Skeleton className="mb-3 h-4 w-1/3 rounded" />
      <div className="space-y-2">
        <Skeleton className="h-3 w-full rounded" />
        <Skeleton className="h-3 w-2/3 rounded" />
      </div>
    </div>
  );
}

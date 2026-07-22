'use client';

import type { DetectedObject } from '@continuum/contracts';
import { cn } from '@/lib/utils';

type Props = {
  objects: DetectedObject[];
  className?: string;
};

// Overlay detected-object bounding boxes on top of a thumbnail. Boxes use
// normalized 0..1 coordinates (origin top-left). Rendered as absolutely
// positioned divs so they scale with any parent container size.
export function MediaBoundingBoxes({ objects, className }: Props) {
  const withBoxes = objects.filter((o) => o.box != null);
  if (withBoxes.length === 0) return null;

  return (
    <div className={cn('pointer-events-none absolute inset-0', className)}>
      {withBoxes.map((obj, idx) => {
        const box = obj.box!;
        return (
          <div
            key={idx}
            className="absolute border border-emerald-400/80 bg-emerald-400/10"
            style={{
              left: `${box.x * 100}%`,
              top: `${box.y * 100}%`,
              width: `${box.width * 100}%`,
              height: `${box.height * 100}%`,
            }}
          >
            <span className="absolute left-0.5 top-0.5 truncate rounded bg-emerald-900/80 px-1 py-0.5 text-2xs leading-none text-emerald-200">
              {obj.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

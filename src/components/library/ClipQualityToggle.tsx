'use client';

import { CLIP_QUALITY_OPTIONS, type ClipQuality } from '@/lib/clips/clipQuality';
import { cn } from '@/lib/utils';

// Compact segmented control for the per-card clip-quality choice (1080p / 720p).
// Lives next to the Generate-clips button; selecting caps the on-device encode
// resolution. stopPropagation keeps clicks off the card's hover/select surface.
export function ClipQualityToggle({
  value,
  onChange,
  disabled,
}: {
  value: ClipQuality;
  onChange: (quality: ClipQuality) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Clip quality"
      className="inline-flex items-center rounded-md border border-border/60 p-0.5"
    >
      {CLIP_QUALITY_OPTIONS.map((quality) => {
        const active = value === quality;
        return (
          <button
            key={quality}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              onChange(quality);
            }}
            className={cn(
              'rounded px-1.5 py-0.5 text-2xs font-medium tabular-nums transition-colors disabled:opacity-50',
              active
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground/70 hover:text-foreground',
            )}
          >
            {quality}
          </button>
        );
      })}
    </div>
  );
}

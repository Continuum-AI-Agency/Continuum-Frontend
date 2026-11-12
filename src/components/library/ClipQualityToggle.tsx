'use client';

import { useTranslations as useUiTranslations } from 'next-intl';
import { useId } from 'react';
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
  const translateUi = useUiTranslations('library');
  const groupName = useId();

  return (
    <div
      role="radiogroup"
      aria-label={translateUi('clip_quality_d60553fe')}
      className="inline-flex items-center rounded-md border border-border/60 p-0.5"
    >
      {CLIP_QUALITY_OPTIONS.map((quality) => {
        const active = value === quality;
        return (
          <label
            key={quality}
            className="relative"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <input
              type="radio"
              name={groupName}
              value={quality}
              checked={active}
              disabled={disabled}
              onChange={() => onChange(quality)}
              className="peer sr-only"
            />
            <span
              className={cn(
                'block rounded px-1.5 py-0.5 text-2xs font-medium tabular-nums transition-colors peer-disabled:opacity-50 peer-focus-visible:outline-2 peer-focus-visible:outline-ring',
                active
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground/70 hover:text-foreground',
              )}
            >
              {quality}
            </span>
          </label>
        );
      })}
    </div>
  );
}

'use client';

import { LIBRARY_PREVIEW_FRAME_SPECS, type LibraryPreviewFrame } from '@continuum/contracts';
import { cn } from '@/lib/utils';

type Props = {
  value: LibraryPreviewFrame;
  onChange: (frame: LibraryPreviewFrame) => void;
};

const OPTIONS: { id: LibraryPreviewFrame; label: string; hint: string }[] = [
  { id: 'native', label: 'Native', hint: 'As shot' },
  ...LIBRARY_PREVIEW_FRAME_SPECS.map((spec) => ({
    id: spec.id,
    label: spec.label,
    hint: spec.surface,
  })),
];

export function PlacementBar({ value, onChange }: Props) {
  return (
    <div
      className="flex flex-wrap items-center gap-1 rounded-lg border border-border p-0.5"
      role="tablist"
      aria-label="Preview as"
    >
      {OPTIONS.map((option) => {
        const selected = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.id)}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-medium',
              selected
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
            <span className="ml-1 font-normal text-muted-foreground">{option.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

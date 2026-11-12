'use client';

import { LIBRARY_PREVIEW_FRAME_SPECS, type LibraryPreviewFrame } from '@continuum/contracts';
import { useTranslations as useUiTranslations } from 'next-intl';
import { useMemo as useUiConfigMemo } from 'react';
import { cn } from '@/lib/utils';

type Props = {
  value: LibraryPreviewFrame;
  onChange: (frame: LibraryPreviewFrame) => void;
};

function useLocalOptionsMessages() {
  const translateConfig = useUiTranslations('library');
  return useUiConfigMemo(() => {
    const value: { id: LibraryPreviewFrame; label: string; hint: string }[] = [
      {
        id: 'native',
        label: translateConfig('native_d509e493'),
        hint: 'As shot',
      },
      ...LIBRARY_PREVIEW_FRAME_SPECS.map((spec) => ({
        id: spec.id,
        label: spec.label,
        hint: spec.surface,
      })),
    ];
    return value;
  }, [translateConfig]);
}

export function PlacementBar({ value, onChange }: Props) {
  const OPTIONS = useLocalOptionsMessages();

  const translateUi = useUiTranslations('library');

  return (
    <div
      className="flex flex-wrap items-center gap-1 rounded-lg border border-border p-0.5"
      role="tablist"
      aria-label={translateUi('preview_as_e3342c3e')}
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

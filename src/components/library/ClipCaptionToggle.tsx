'use client';

import { Captions, CaptionsOff } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

// Compact on/off toggle for creating an editable caption draft alongside a clean clip.
// Sits next to the clip-quality control; stopPropagation keeps the click off the
// card's hover/select surface.
export function ClipCaptionToggle({
  value,
  onChange,
  disabled,
}: {
  value: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}) {
  const translateUi = useUiTranslations('library');

  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={translateUi('create_editable_captions_for_clips_af5f5581')}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!value);
      }}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-border/60 px-1.5 py-0.5 text-2xs font-medium transition-colors disabled:opacity-50',
        value ? 'bg-muted text-foreground' : 'text-muted-foreground/70 hover:text-foreground',
      )}
      title={
        value
          ? translateUi('create_editable_caption_draft_27303289')
          : translateUi('no_caption_draft_54433574')
      }
    >
      {value ? <Captions className="size-3" /> : <CaptionsOff className="size-3" />}
      CC
    </button>
  );
}

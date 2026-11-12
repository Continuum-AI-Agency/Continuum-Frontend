'use client';

import { Diamond } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function KeyframeDiamond({
  labeled,
  keyed,
  disabled,
  onToggle,
}: {
  labeled: string;
  keyed: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  const translateUi = useUiTranslations('studio');

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      disabled={disabled}
      aria-label={
        keyed
          ? translateUi('update_value0_keyframe_8e97b234', {
              value0: String(labeled),
            })
          : translateUi('add_value0_keyframe_51cf9810', {
              value0: String(labeled),
            })
      }
      aria-pressed={keyed}
      className="size-7 shrink-0 active:scale-[0.96]"
      onClick={onToggle}
    >
      <Diamond
        className={cn(
          'size-3.5 text-primary transition-[opacity,transform,filter] duration-200',
          keyed ? 'fill-primary' : 'fill-transparent',
        )}
        strokeWidth={1.75}
      />
    </Button>
  );
}

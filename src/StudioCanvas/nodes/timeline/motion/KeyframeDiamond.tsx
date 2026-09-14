'use client';

import { Diamond } from 'lucide-react';
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
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      disabled={disabled}
      aria-label={keyed ? `Update ${labeled} keyframe` : `Add ${labeled} keyframe`}
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

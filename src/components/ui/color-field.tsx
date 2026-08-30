// One colour control, used by every surface that edits a colour: the generic action-config
// renderer, the caption editor, the timeline's text overlay and the burn-in ink row. The
// swatch IS the trigger, so the current colour is readable without opening anything.

'use client';

import {
  ColorPicker,
  ColorPickerFormat,
  ColorPickerHue,
  ColorPickerSelection,
} from '@/components/kibo-ui/color-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

// A colour that is not set reads as "no fill", which is not black — so the swatch shows the
// checkerboard a designer already reads as transparent rather than a colour nobody chose.
const CHECKER =
  'repeating-conic-gradient(var(--muted-foreground) 0% 25%, transparent 0% 50%) 50% / 8px 8px';

export interface ColorFieldProps {
  /** `#rrggbb`, or null for a nullable field nobody has set yet. */
  value: string | null;
  onChange: (hex: string) => void;
  /** Names the control for screen readers: "Background colour". */
  label: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}

export function ColorField({ value, onChange, label, id, disabled, className }: ColorFieldProps) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`${label} colour`}
        className={cn(
          'flex h-7 flex-1 items-center gap-2 rounded-md border border-input bg-transparent px-2 text-left text-xs',
          'hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-hidden',
          'disabled:pointer-events-none disabled:opacity-50',
          className,
        )}
        data-slot="color-field"
        disabled={disabled}
        id={id}
        type="button"
      >
        <span
          className="size-4 shrink-0 rounded-sm border border-border/60"
          data-slot="color-field-swatch"
          style={value ? { background: value } : { background: CHECKER }}
        />
        <span className="font-mono text-muted-foreground">{value ?? 'Auto'}</span>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3">
        <ColorPicker onChange={onChange} value={value ?? undefined}>
          <ColorPickerSelection />
          <ColorPickerHue />
          <ColorPickerFormat />
        </ColorPicker>
      </PopoverContent>
    </Popover>
  );
}

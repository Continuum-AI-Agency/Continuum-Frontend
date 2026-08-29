'use client';

// Wraps Base UI's NumberField the way `slider.tsx` wraps its Slider: parts re-exported
// with this app's tokens, plus one opinionated composition.
//
// This exists for the numbers a slider CANNOT honestly express — an unbounded one
// (`startSec` on a clip of unknown length) or a nominally-bounded one whose range no
// drag can resolve (`size: 1..10_000`). A slider there is a number box in costume.
// Scrubbing the label is the interaction those want, and Base UI already ships it, so
// there is no pointer-capture code here to get wrong.

import { NumberField as NumberFieldPrimitive } from '@base-ui/react/number-field';
import { ChevronDown, ChevronUp } from 'lucide-react';

import { cn } from '@/lib/utils';
import { fractionDigitsForStep } from './number-flow-value';

const NumberFieldRoot = NumberFieldPrimitive.Root;
const NumberFieldGroup = NumberFieldPrimitive.Group;
const NumberFieldInput = NumberFieldPrimitive.Input;
const NumberFieldIncrement = NumberFieldPrimitive.Increment;
const NumberFieldDecrement = NumberFieldPrimitive.Decrement;
const NumberFieldScrubArea = NumberFieldPrimitive.ScrubArea;
const NumberFieldScrubAreaCursor = NumberFieldPrimitive.ScrubAreaCursor;

interface ScrubFieldBase {
  /** Visible text, and the scrub handle. Keep it short — it sits in a control row. */
  label: string;
  /**
   * Accessible name, when the visible label is too terse to stand alone ("Start" in a
   * burn-in window). Should still contain the visible text, so speech input matches.
   */
  ariaLabel?: string;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /**
   * `stack` puts the label above a full-width box — the inspector default.
   * `inline` is the dense-lane form: label beside a narrow box, steppers dropped
   * because at that width they would crowd out the digits. Scrub and typing remain.
   */
  orientation?: 'stack' | 'inline';
  /** Uncontrolled starting value. Omit `value` to use it. */
  defaultValue?: number;
}

/**
 * `nullable` decides whether null is in the callback's type, because null is a real
 * value in this registry and only for some fields: `startSec` defaults to null meaning
 * "no window", which is NOT 0. Fields that cannot be unset never hand a caller null,
 * so they should not have to narrow one away.
 */
type NumberScrubFieldProps = ScrubFieldBase &
  (
    | {
        nullable: true;
        value?: number | null;
        onChange?: (value: number | null) => void;
        onCommit?: (value: number | null) => void;
      }
    | {
        nullable?: false;
        value?: number;
        onChange?: (value: number) => void;
        onCommit?: (value: number) => void;
      }
  );

/** Label doubles as a horizontal scrub handle; the input stays typable for exact entry. */
function NumberScrubField({
  label,
  ariaLabel,
  value,
  defaultValue,
  min,
  max,
  step = 1,
  nullable = false,
  suffix,
  placeholder,
  disabled,
  className,
  orientation = 'stack',
  onChange,
  onCommit,
}: NumberScrubFieldProps) {
  const inline = orientation === 'inline';
  // At least two decimals so a step-1 geometry field still reads 10.5 rather than 11,
  // and `minimumFractionDigits: 0` so a whole number stays whole.
  const digits = Math.max(fractionDigitsForStep(step), 2);

  const report = (next: number | null, handler?: (value: never) => void) => {
    if (!handler) return;
    if (next === null) {
      // An emptied field is "unset" when the field allows it, and nothing at all when it
      // does not — writing 0 there would be a value the user never chose. The cast is
      // sound because null only reaches a handler whose prop type admits it.
      if (nullable) (handler as (value: number | null) => void)(null);
      return;
    }
    if (Number.isFinite(next)) (handler as (value: number) => void)(next);
  };

  return (
    <NumberFieldRoot
      data-slot="number-scrub-field"
      className={cn(inline ? 'flex items-center gap-1' : 'flex flex-col gap-1', className)}
      step={step}
      disabled={disabled}
      format={{ maximumFractionDigits: digits, minimumFractionDigits: 0 }}
      {...(value === undefined ? { defaultValue } : { value })}
      {...(min === undefined ? {} : { min })}
      {...(max === undefined ? {} : { max })}
      onValueChange={(next) => report(next, onChange as ((value: never) => void) | undefined)}
      {...(onCommit
        ? {
            onValueCommitted: (next: number | null) =>
              report(next, onCommit as (value: never) => void),
          }
        : {})}
    >
      <NumberFieldScrubArea
        // The pointer is locked during a scrub, so a step-relative sensitivity keeps a
        // 0.05-step field from flying while a 1-step field still moves at a sane rate.
        pixelSensitivity={step >= 1 ? 2 : 6}
        className={cn(
          'w-fit shrink-0 cursor-ew-resize select-none text-3xs text-muted-foreground',
          !inline && 'uppercase tracking-wide',
        )}
      >
        {label}
        <NumberFieldScrubAreaCursor />
      </NumberFieldScrubArea>

      <NumberFieldGroup
        className={cn(
          'flex items-center rounded-md border border-input bg-background shadow-xs',
          inline ? 'h-6 w-16 shrink-0' : 'h-7 w-full',
          'transition-[color,box-shadow,border-color]',
          'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/45',
          'dark:bg-input/30',
          disabled && 'pointer-events-none opacity-50',
        )}
      >
        <NumberFieldInput
          aria-label={ariaLabel ?? label}
          placeholder={placeholder ?? (nullable ? 'Auto' : undefined)}
          className="h-full w-full min-w-0 bg-transparent px-2 text-2xs tabular-nums text-foreground outline-none placeholder:text-muted-foreground"
        />
        {suffix ? (
          <span className="pointer-events-none pr-1 text-3xs text-muted-foreground">{suffix}</span>
        ) : null}
        {inline ? null : (
          <div className="flex h-full flex-col border-l border-input">
            <NumberFieldIncrement
              aria-label={`Increase ${label}`}
              className="flex flex-1 items-center justify-center px-1 text-muted-foreground outline-none hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/45"
            >
              <ChevronUp className="size-2.5" />
            </NumberFieldIncrement>
            <NumberFieldDecrement
              aria-label={`Decrease ${label}`}
              className="flex flex-1 items-center justify-center px-1 text-muted-foreground outline-none hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/45"
            >
              <ChevronDown className="size-2.5" />
            </NumberFieldDecrement>
          </div>
        )}
      </NumberFieldGroup>
    </NumberFieldRoot>
  );
}

export {
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
  NumberFieldRoot,
  NumberFieldScrubArea,
  NumberFieldScrubAreaCursor,
  NumberScrubField,
  type NumberScrubFieldProps,
};

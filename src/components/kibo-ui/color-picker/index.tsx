// Vendored from the shadcn registry: `@kibo-ui/color-picker`. Four deliberate deviations,
// each of which the upstream file gets wrong for this repo:
//
//  1. Base UI, not Radix. Upstream pulls its two sliders from `radix-ui`, which this repo
//     removed on purpose (see ../../../AGENTS.md). The hue track is built on the same
//     `@base-ui/react/slider` primitive `components/ui/slider.tsx` is built on — directly,
//     rather than through that wrapper, because a gradient track has to replace the wrapper's
//     `bg-muted` track and `bg-primary` indicator, and four descendant overrides to undo two
//     classes is worse than the primitive.
//  2. The colour syncs. Upstream's controlled-value effect reads `Color.rgb(value)` and then
//     assigns the R, G and B channels into the HUE, SATURATION and LIGHTNESS state — so a
//     controlled picker shows a colour unrelated to its own value. And its selection area
//     holds a crosshair position that starts at 0,0 and never reads the incoming colour, so
//     opening on red points at white.
//  3. Nothing is written on mount, and an inline `onChange` cannot loop. Upstream emits from
//     an effect keyed on the handler's identity: an inline arrow re-runs it every render,
//     which both dirties the node on open and spins. Emission happens in the setters here,
//     through a ref, so the handler's identity is not a dependency of anything.
//  4. Hex in, hex out. Every schema that reaches this picker is `#rrggbb`. Upstream emits
//     `[r, g, b, a]`.
//
// The alpha slider and the rgb/css/hsl output switcher are dropped rather than hidden: a
// six-digit hex cannot carry alpha, and a control whose value gets discarded is a lie.

'use client';

import { Slider as SliderPrimitive } from '@base-ui/react/slider';
import Color from 'color';
import { PipetteIcon } from 'lucide-react';
import {
  createContext,
  type HTMLAttributes,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

interface Hsl {
  readonly h: number;
  readonly s: number;
  readonly l: number;
}

const BLACK: Hsl = { h: 0, s: 0, l: 0 };

/** `Color` throws on anything it cannot read. A popover is the wrong place to find out. */
function toHsl(value: string | undefined, fallback: Hsl): Hsl {
  if (!value) return fallback;
  try {
    const [h, s, l] = Color(value).hsl().array();
    return { h, s, l };
  } catch {
    return fallback;
  }
}

export const hslToHex = ({ h, s, l }: Hsl): string => Color.hsl(h, s, l).hex().toLowerCase();

interface ColorPickerContextValue {
  readonly hsl: Hsl;
  readonly hex: string;
  readonly commit: (next: Hsl) => void;
  readonly commitHex: (next: string) => void;
}

const ColorPickerContext = createContext<ColorPickerContextValue | undefined>(undefined);

export const useColorPicker = (): ColorPickerContextValue => {
  const context = useContext(ColorPickerContext);
  if (!context) throw new Error('useColorPicker must be used within a ColorPicker');
  return context;
};

export type ColorPickerProps = Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> & {
  /** `#rrggbb`. Anything else is ignored rather than thrown on. */
  value?: string;
  defaultValue?: string;
  onChange?: (hex: string) => void;
};

export function ColorPicker({
  value,
  defaultValue = '#000000',
  onChange,
  className,
  ...props
}: ColorPickerProps) {
  const [hsl, setHsl] = useState<Hsl>(() => toHsl(value ?? defaultValue, BLACK));
  const hex = useMemo(() => hslToHex(hsl), [hsl]);

  // Held in a ref so the handler's identity is not a dependency of the sync effect below —
  // an inline arrow at the call site would otherwise re-run it on every render.
  const emit = useRef(onChange);
  emit.current = onChange;

  // The last hex this component either emitted or accepted. The sync effect compares against
  // it rather than against `hex` so our own emit cannot round-trip back and fight a drag.
  const settled = useRef(hex);

  useEffect(() => {
    if (!value || !HEX_COLOUR.test(value)) return;
    const next = value.toLowerCase();
    if (next === settled.current) return;
    settled.current = next;
    setHsl(toHsl(next, BLACK));
  }, [value]);

  const commit = useCallback((next: Hsl) => {
    setHsl(next);
    const nextHex = hslToHex(next);
    settled.current = nextHex;
    emit.current?.(nextHex);
  }, []);

  const commitHex = useCallback((next: string) => {
    if (!HEX_COLOUR.test(next)) return;
    const lower = next.toLowerCase();
    settled.current = lower;
    setHsl(toHsl(lower, BLACK));
    emit.current?.(lower);
  }, []);

  const context = useMemo<ColorPickerContextValue>(
    () => ({ hsl, hex, commit, commitHex }),
    [hsl, hex, commit, commitHex],
  );

  return (
    <ColorPickerContext.Provider value={context}>
      <div className={cn('flex w-full flex-col gap-3', className)} {...props} />
    </ColorPickerContext.Provider>
  );
}

/**
 * Where the crosshair sits for a given colour — the exact inverse of what a drag writes
 * below, which is why opening the picker on a colour points at that colour instead of at
 * white.
 */
function positionOf({ s, l }: Hsl): { x: number; y: number } {
  const x = s / 100;
  const topLightness = x < 0.01 ? 100 : 50 + 50 * (1 - x);
  const y = topLightness === 0 ? 0 : 1 - l / topLightness;
  return { x, y: Math.min(1, Math.max(0, y)) };
}

export type ColorPickerSelectionProps = HTMLAttributes<HTMLDivElement>;

export const ColorPickerSelection = memo(function ColorPickerSelection({
  className,
  ...props
}: ColorPickerSelectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  // Only while a drag is in flight: the pointer owns the crosshair then, because a colour
  // that clamps (pure black has no saturation) would otherwise pull it out from under the finger.
  const [dragged, setDragged] = useState<{ x: number; y: number } | null>(null);
  const { hsl, commit } = useColorPicker();

  const position = dragged ?? positionOf(hsl);

  const background = useMemo(
    () =>
      // One line on purpose: a value broken across lines survives a browser but not every
      // CSSOM, and a dropped layer here is a saturation square with no black in it.
      `linear-gradient(0deg, rgba(0,0,0,1), rgba(0,0,0,0)), linear-gradient(90deg, rgba(255,255,255,1), rgba(255,255,255,0)), hsl(${hsl.h}, 100%, 50%)`,
    [hsl.h],
  );

  const hueRef = useRef(hsl.h);
  hueRef.current = hsl.h;

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
      setDragged({ x, y });
      const topLightness = x < 0.01 ? 100 : 50 + 50 * (1 - x);
      commit({ h: hueRef.current, s: x * 100, l: topLightness * (1 - y) });
    },
    [commit],
  );

  useEffect(() => {
    if (!dragging) return;
    const stop = () => {
      setDragging(false);
      setDragged(null);
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stop);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stop);
    };
  }, [dragging, handlePointerMove]);

  return (
    <div
      className={cn('relative h-32 w-full cursor-crosshair rounded', className)}
      data-slot="color-picker-selection"
      onPointerDown={(event) => {
        event.preventDefault();
        setDragging(true);
        handlePointerMove(event.nativeEvent);
      }}
      ref={containerRef}
      style={{ background }}
      {...props}
    >
      <div
        className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
        style={{
          left: `${position.x * 100}%`,
          top: `${position.y * 100}%`,
          boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
        }}
      />
    </div>
  );
});

// Deliberately narrow: everything else about this slider (range, value, step) is the hue,
// and is not the caller's to set.
export type ColorPickerHueProps = { className?: string };

export function ColorPickerHue({ className }: ColorPickerHueProps) {
  const { hsl, commit } = useColorPicker();

  return (
    <SliderPrimitive.Root
      aria-label="Hue"
      className={cn('w-full', className)}
      data-slot="color-picker-hue"
      max={360}
      min={0}
      onValueChange={(next) => commit({ ...hsl, h: Array.isArray(next) ? next[0] : next })}
      step={1}
      thumbAlignment="edge"
      value={hsl.h}
    >
      <SliderPrimitive.Control className="relative flex w-full touch-none items-center select-none">
        <SliderPrimitive.Track className="relative h-3 w-full grow rounded-full bg-[linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)]" />
        <SliderPrimitive.Thumb className="relative block size-4 shrink-0 rounded-full border border-ring bg-white ring-ring/50 select-none hover:ring-3 focus-visible:ring-3 focus-visible:outline-hidden" />
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export type ColorPickerFormatProps = HTMLAttributes<HTMLDivElement>;

/**
 * The hex, still typeable. This adds the wheel; it does not take the box away — a designer
 * handed `#0f1f43` in a brand doc should paste it rather than hunt for it.
 *
 * The draft is local so half-typed input survives: `#0f1` is not a colour, and committing on
 * every keystroke would rewrite the field under the cursor.
 */
export function ColorPickerFormat({ className, ...props }: ColorPickerFormatProps) {
  const { hex, commitHex } = useColorPicker();
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <div className={cn('flex items-center gap-1', className)} {...props}>
      <Input
        aria-label="Hex colour"
        className="h-8 flex-1 font-mono text-xs"
        onBlur={() => setDraft(null)}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          commitHex(next.startsWith('#') ? next : `#${next}`);
        }}
        spellCheck={false}
        value={draft ?? hex}
      />
      <ColorPickerEyeDropper />
    </div>
  );
}

/** Chromium-only. Hidden rather than shipped inert where the browser has no such API. */
function ColorPickerEyeDropper() {
  const { commitHex } = useColorPicker();
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && 'EyeDropper' in window);
  }, []);

  if (!supported) return null;

  const pick = async () => {
    try {
      const EyeDropperCtor = (window as unknown as Record<string, unknown>)
        .EyeDropper as new () => {
        open: () => Promise<{ sRGBHex: string }>;
      };
      const { sRGBHex } = await new EyeDropperCtor().open();
      commitHex(Color(sRGBHex).hex().toLowerCase());
    } catch {
      // A dismissed eyedropper rejects. Nothing to report — the colour simply did not change.
    }
  };

  return (
    <Button
      aria-label="Pick a colour from the screen"
      className="size-8 shrink-0 text-muted-foreground"
      onClick={pick}
      size="icon"
      type="button"
      variant="outline"
    >
      <PipetteIcon className="size-3.5" />
    </Button>
  );
}

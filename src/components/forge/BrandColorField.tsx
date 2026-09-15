'use client';

import { type BrandTypeInputs, isLiteralHex, sectionForToken } from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ColorField } from '@/components/ui/color-field';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { brandTypeInputsQueryKey, loadBrandTypeInputs } from '@/lib/brands/brandTypeInputs.client';
import { cn } from '@/lib/utils';

// Every Forge colour input shares the burn-in's brand query, but not its font-registration hook.

/**
 * `#abc` / `aabbccdd` → `#aabbcc`: the render contract types a colour as six hex digits. The `#`
 * is optional because imported rows arrive without one. Null for anything that is not hex.
 */
function toSixDigitHex(value: string): string | null {
  const hex = value.trim().replace(/^#/, '').toLowerCase();
  if (!isLiteralHex(`#${hex}`)) return null;
  const wide = hex.length > 4 ? hex.slice(0, 6) : [...hex.slice(0, 3)].map((c) => c + c).join('');
  return `#${wide}`;
}

type SwatchCandidate = { name: string; value: string };
type Swatch = { name: string; hex: string };

function swatchesOf(candidates: readonly SwatchCandidate[]): Swatch[] {
  const seen = new Set<string>();
  return candidates.flatMap(({ name, value }) => {
    const hex = toSixDigitHex(value);
    if (!hex || seen.has(hex)) return [];
    seen.add(hex);
    return [{ name, hex }];
  });
}

function paletteSwatches(inputs: BrandTypeInputs | undefined): Swatch[] {
  if (!inputs) return [];
  const sources: SwatchCandidate[][] = [
    (inputs.designSystem?.tokens ?? []).flatMap((token) =>
      token.kind === 'color' && sectionForToken(token) === 'palette'
        ? [{ name: token.name, value: token.resolvedValue ?? token.value }]
        : [],
    ),
    (inputs.brandMd?.colors ?? []).map((token, index) => ({
      name: token.name?.trim() || token.role || `Brand color ${index + 1}`,
      value: token.value,
    })),
    (inputs.brandKit?.colors ?? []).map((color, index) => ({
      name: `Brand color ${index + 1}`,
      value: color,
    })),
  ];
  for (const source of sources) {
    const swatches = swatchesOf(source);
    if (swatches.length) return swatches;
  }
  return [];
}

export function BrandColorField({
  brandId,
  value,
  onChange,
  label,
  disabled,
}: {
  brandId: string;
  value: string | null;
  onChange: (hex: string) => void;
  label: string;
  disabled?: boolean;
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { data } = useQuery({
    queryKey: brandTypeInputsQueryKey(brandId),
    queryFn: () => loadBrandTypeInputs(brandId),
    enabled: Boolean(brandId),
    staleTime: 5 * 60_000,
  });
  const swatches = useMemo(() => paletteSwatches(data), [data]);
  const selected = value ? toSixDigitHex(value) : null;

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {swatches.length ? (
        <Popover open={paletteOpen} onOpenChange={setPaletteOpen}>
          <PopoverTrigger
            type="button"
            aria-label={`${label} brand palette`}
            title="Brand colors"
            disabled={disabled}
            className="flex h-7 w-10 shrink-0 items-center justify-center rounded-md border border-input hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"
          >
            <span className="flex -space-x-1" aria-hidden>
              {swatches.slice(0, 3).map((swatch) => (
                <span
                  key={swatch.hex}
                  className="size-3 rounded-full border border-background"
                  style={{ background: swatch.hex }}
                />
              ))}
            </span>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 p-3">
            <p className="mb-2 text-xs font-medium">Brand colors</p>
            <fieldset
              aria-label={`${label} brand colors`}
              className="grid max-h-64 grid-cols-6 gap-2 overflow-y-auto"
            >
              {swatches.map((swatch) => (
                <button
                  key={swatch.hex}
                  type="button"
                  aria-label={`${label}: ${swatch.name}`}
                  aria-pressed={selected === swatch.hex}
                  title={`${swatch.name} ${swatch.hex}`}
                  onClick={() => {
                    onChange(swatch.hex);
                    setPaletteOpen(false);
                  }}
                  className={cn(
                    'size-7 rounded-sm border border-border/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-hidden',
                    selected === swatch.hex &&
                      'ring-2 ring-brand-primary ring-offset-1 ring-offset-background',
                  )}
                  style={{ background: swatch.hex }}
                />
              ))}
            </fieldset>
          </PopoverContent>
        </Popover>
      ) : null}
      <ColorField label={label} value={selected ?? value} onChange={onChange} disabled={disabled} />
    </div>
  );
}

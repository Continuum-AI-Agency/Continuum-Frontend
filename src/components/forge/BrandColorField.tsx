'use client';

import { type DesignToken, isLiteralHex, sectionForToken } from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { ColorField } from '@/components/ui/color-field';
import { brandTypeInputsQueryKey, loadBrandTypeInputs } from '@/lib/brands/brandTypeInputs.client';
import { cn } from '@/lib/utils';

// Every colour input in Forge: the brand's palette as one-click swatches, beside the free
// ColorField (hex + eyedropper) for anything off-palette.
//
// The palette is read through the SAME query the burn-in ink row uses (`useBrandType`), so the
// two surfaces share one cache entry and cannot offer different palettes. Not `useBrandType`
// itself: that also registers the brand's display face on `document.fonts`, which a grid of
// colour cells has no use for.

/** `#abc` / `#aabbccdd` → `#aabbcc`: the render contract types a colour as six hex digits. */
function toSixDigitHex(value: string): string {
  const hex = value.trim().slice(1).toLowerCase();
  const wide = hex.length > 4 ? hex.slice(0, 6) : [...hex.slice(0, 3)].map((c) => c + c).join('');
  return `#${wide}`;
}

function paletteSwatches(tokens: readonly DesignToken[]): { name: string; hex: string }[] {
  const seen = new Set<string>();
  return tokens.flatMap((token) => {
    const value = (token.resolvedValue ?? token.value).trim();
    if (token.kind !== 'color' || sectionForToken(token) !== 'palette' || !isLiteralHex(value)) {
      return [];
    }
    const hex = toSixDigitHex(value);
    if (seen.has(hex)) return [];
    seen.add(hex);
    return [{ name: token.name, hex }];
  });
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
  const { data } = useQuery({
    queryKey: brandTypeInputsQueryKey(brandId),
    queryFn: () => loadBrandTypeInputs(brandId),
    enabled: Boolean(brandId),
    staleTime: 5 * 60_000,
  });
  const swatches = useMemo(() => paletteSwatches(data?.designSystem?.tokens ?? []), [data]);
  const selected = value ? toSixDigitHex(value) : null;

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {swatches.length ? (
        <div className="flex flex-wrap gap-1">
          {swatches.map((swatch) => (
            <button
              key={swatch.hex}
              type="button"
              aria-label={`${label}: ${swatch.name}`}
              aria-pressed={selected === swatch.hex}
              title={`${swatch.name} ${swatch.hex}`}
              disabled={disabled}
              onClick={() => onChange(swatch.hex)}
              className={cn(
                'size-5 shrink-0 rounded-sm border border-border/60 disabled:opacity-50',
                selected === swatch.hex &&
                  'ring-2 ring-brand-primary ring-offset-1 ring-offset-background',
              )}
              style={{ background: swatch.hex }}
            />
          ))}
        </div>
      ) : null}
      <ColorField label={label} value={value} onChange={onChange} disabled={disabled} />
    </div>
  );
}

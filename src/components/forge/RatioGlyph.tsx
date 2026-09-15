import { cn } from '@/lib/utils';

// A format's shape at a glance, drawn beside its `16:9` label: a wide box, a tall one, a square.

/** `16:9` → [16, 9]. Anything that is not two positive numbers reads as a square. */
export function ratioParts(ratio: string | null | undefined): [number, number] {
  const [width, height] = (ratio ?? '').split(':').map(Number);
  return width && height && width > 0 && height > 0 ? [width, height] : [1, 1];
}

export function RatioGlyph({
  ratio,
  className,
}: {
  ratio: string | null | undefined;
  className?: string;
}) {
  const [width, height] = ratioParts(ratio);
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block shrink-0 rounded-[1px] border border-current',
        width >= height ? 'w-3' : 'h-3',
        className,
      )}
      style={{ aspectRatio: `${width} / ${height}` }}
    />
  );
}

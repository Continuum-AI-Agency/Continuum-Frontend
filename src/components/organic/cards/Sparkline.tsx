'use client';

// Inline trend line for dense cards: bklit's LineSparkline, coloured by tone.
// Renders a flat baseline when there are fewer than two points.
import { useTranslations } from 'next-intl';
import { LineSparkline } from '@/components/charts/sparkline';
import { cn } from '@/lib/utils';

export type SparklineTone = 'positive' | 'negative' | 'flat';

const TONE_STROKE: Record<SparklineTone, string> = {
  positive: 'oklch(72% 0.16 154)',
  negative: 'oklch(64% 0.20 28)',
  flat: 'oklch(60% 0.02 250)',
};

const asValue = (value: number) => value;

type SparklineProps = {
  values: ReadonlyArray<number | undefined>;
  tone?: SparklineTone;
  width?: number;
  height?: number;
  className?: string;
  ariaLabel?: string;
};

export function Sparkline({
  values,
  tone = 'flat',
  width = 120,
  height = 28,
  className,
  ariaLabel,
}: SparklineProps) {
  const uiText = useTranslations('organic');
  const points = values.filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  );

  if (points.length < 2) {
    return (
      <div
        className={cn('inline-flex items-center text-muted-foreground/50', className)}
        style={{ width, height }}
        aria-hidden
      >
        <span className="block h-px w-full bg-current/40" />
      </div>
    );
  }

  return (
    <LineSparkline
      aria-label={ariaLabel ?? uiText('trend_9e21771')}
      className={cn('inline-block align-middle', className)}
      color={TONE_STROKE[tone]}
      data={points}
      dataKey={asValue}
      endDot
      height={height}
      strokeWidth={1.5}
      width={width}
    />
  );
}

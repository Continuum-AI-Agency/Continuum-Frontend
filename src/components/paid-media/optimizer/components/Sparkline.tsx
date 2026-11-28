// Inline sparkline for KPI tiles: bklit's AreaSparkline with a dot on the last point.
import { AreaSparkline } from '@/components/charts/sparkline';
import { cn } from '@/lib/utils';

type SparklineProps = {
  values: number[];
  width?: number;
  height?: number;
  /** CSS colour; defaults to the primary data-viz colour. */
  stroke?: string;
  className?: string;
  /** Accessible summary, e.g. "Daily spend, last 7 days". */
  label?: string;
};

const asValue = (value: number) => value;

export function Sparkline({
  values,
  width = 96,
  height = 28,
  stroke = 'var(--chart-1)',
  className,
  label,
}: SparklineProps) {
  if (values.length === 0) return null;
  return (
    <AreaSparkline
      aria-label={label}
      className={cn('block overflow-visible', className)}
      color={stroke}
      data={values}
      dataKey={asValue}
      endDot
      fill="solid"
      fillOpacity={0.12}
      height={height}
      strokeWidth={1.5}
      width={width}
      // The fill reads as magnitude, so the axis keeps zero instead of hugging the data.
      yDomain={[Math.min(0, ...values)]}
    />
  );
}

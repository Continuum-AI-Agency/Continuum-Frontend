'use client';

import type { MotionValue } from 'motion/react';
import { motion, useTransform } from 'motion/react';
import { memo, useMemo } from 'react';
import { radarCssVars, useRadarHover, useRadarStable } from './radar-context';
import { useEnterComplete } from './use-enter-complete';
import { useMountProgress } from './use-mount-progress';

export interface RadarAreaProps {
  /** Index of this area in the data array */
  index: number;
  /** Optional color override */
  color?: string;
  /** Show data point circles. Default: true */
  showPoints?: boolean;
  /** Only these metrics get a point; the rest are drawn without one. Default: all */
  pointKeys?: ReadonlySet<string>;
  /** Metrics left out of the polygon entirely: a value that was never measured. */
  skipKeys?: ReadonlySet<string>;
  /** Dash pattern for the outline, e.g. a projected rather than measured shape. */
  strokeDasharray?: string;
  /** Resting fill opacity. Default: 0.15 */
  fillOpacity?: number;
  /** Show stroke outline on the polygon. Default: true */
  showStroke?: boolean;
  /** Show glow effect on hover. Default: true */
  showGlow?: boolean;
  /** Additional class name */
  className?: string;
}

function getStrokeWidth(isHovered: boolean): number {
  return isHovered ? 3 : 2;
}

function positionsToPath(positions: { x: number; y: number }[]): string {
  if (positions.length === 0) {
    return '';
  }
  return `M ${positions.map((p) => `${p.x},${p.y}`).join(' L ')} Z`;
}

const RadarPoint = memo(function RadarPoint({
  mountProgress,
  target,
  color,
  isHovered,
  metricKey,
  enterComplete,
}: {
  mountProgress: MotionValue<number>;
  target: { x: number; y: number };
  color: string;
  isHovered: boolean;
  metricKey: string;
  enterComplete: boolean;
}) {
  const cx = useTransform(mountProgress, (t) => target.x * t);
  const cy = useTransform(mountProgress, (t) => target.y * t);

  if (enterComplete) {
    return (
      <circle
        cx={target.x}
        cy={target.y}
        fill={color}
        data-radar-point={metricKey}
        key={metricKey}
        r={isHovered ? 6 : 4}
        stroke={radarCssVars.background}
        strokeWidth={2}
      />
    );
  }

  return (
    <motion.circle
      cx={cx}
      cy={cy}
      data-radar-point={metricKey}
      fill={color}
      key={metricKey}
      r={isHovered ? 6 : 4}
      stroke={radarCssVars.background}
      strokeWidth={2}
      transition={{
        r: { type: 'spring', stiffness: 300, damping: 20 },
      }}
    />
  );
});

export const RadarArea = memo(function RadarArea({
  index,
  color: colorProp,
  showPoints = true,
  pointKeys,
  skipKeys,
  strokeDasharray,
  fillOpacity = 0.15,
  showStroke = true,
  showGlow = true,
  className = '',
}: RadarAreaProps) {
  const {
    data,
    metrics,
    levels,
    animate,
    enterDurationMs,
    staggerScale,
    enterTransition,
    motionReplayKey,
    getColor,
    getPointPosition,
  } = useRadarStable();
  const { hoveredIndex, setHoveredIndex } = useRadarHover();

  const durationFactor = enterDurationMs / 1100;
  const areaData = data[index];

  const targetPositions = useMemo(() => {
    if (!areaData) {
      return metrics.map(() => ({ x: 0, y: 0 }));
    }
    return metrics.map((metric, i) => {
      const value = areaData.values[metric.key] ?? 0;
      return getPointPosition(i, value);
    });
  }, [metrics, areaData, getPointPosition]);

  const polygonPositions = useMemo(
    () => targetPositions.filter((_, i) => !skipKeys?.has(metrics[i]?.key ?? '')),
    [targetPositions, skipKeys, metrics],
  );
  const staticPath = useMemo(() => positionsToPath(polygonPositions), [polygonPositions]);

  const gridStagger = 0.08 * staggerScale * durationFactor;
  const campaignBaseDelay = (levels * gridStagger + 0.2) * durationFactor;
  const campaignStagger = 0.15 * staggerScale * durationFactor;
  // With animation off the shape lands at once: no staggered wait on a blank chart.
  const animationDelay = animate ? campaignBaseDelay + index * campaignStagger : 0;

  const mountProgress = useMountProgress(
    enterTransition,
    animationDelay,
    `${motionReplayKey}-${index}`,
  );
  const enterComplete = useEnterComplete(mountProgress);

  const animatedPositions = useTransform(mountProgress, (t) =>
    polygonPositions.map((p) => ({ x: p.x * t, y: p.y * t })),
  );

  const pathD = useTransform(animatedPositions, positionsToPath);

  if (!areaData) {
    return null;
  }

  const color = colorProp || getColor(index);
  const isHovered = hoveredIndex === index;
  const isOtherHovered = hoveredIndex !== null && hoveredIndex !== index;

  return (
    <motion.g
      animate={{
        opacity: isOtherHovered ? 0.3 : 1,
        scale: isHovered ? 1.05 : 1,
      }}
      className={className}
      initial={{ opacity: animate ? 0 : 1 }}
      onMouseEnter={() => setHoveredIndex(index)}
      onMouseLeave={() => setHoveredIndex(null)}
      style={{ transformOrigin: '0px 0px', cursor: 'pointer' }}
      transition={{
        opacity: { duration: 0.15 },
        scale: { type: 'spring', stiffness: 400, damping: 25 },
      }}
    >
      {enterComplete ? (
        <path
          d={staticPath}
          fill={color}
          fillOpacity={isHovered ? 0.35 : fillOpacity}
          stroke={showStroke ? color : 'none'}
          strokeDasharray={strokeDasharray}
          strokeLinejoin="round"
          strokeWidth={showStroke ? getStrokeWidth(isHovered) : 0}
          style={{
            filter: showGlow && isHovered ? `drop-shadow(0 0 12px ${color})` : 'none',
          }}
        />
      ) : (
        <motion.path
          animate={{
            fillOpacity: isHovered ? 0.35 : fillOpacity,
            strokeWidth: showStroke ? getStrokeWidth(isHovered) : 0,
          }}
          d={pathD}
          initial={{ fillOpacity, strokeWidth: showStroke ? getStrokeWidth(false) : 0 }}
          fill={color}
          stroke={showStroke ? color : 'none'}
          strokeDasharray={strokeDasharray}
          strokeLinejoin="round"
          style={{
            filter: showGlow && isHovered ? `drop-shadow(0 0 12px ${color})` : 'none',
          }}
          transition={{
            fillOpacity: { duration: 0.2 },
            strokeWidth: { duration: 0.2 },
          }}
        />
      )}

      {showPoints &&
        metrics.map((metric, i) => {
          const target = targetPositions[i];
          if (!target || (pointKeys && !pointKeys.has(metric.key))) {
            return null;
          }
          return (
            <RadarPoint
              color={color}
              enterComplete={enterComplete}
              isHovered={isHovered}
              key={metric.key}
              metricKey={metric.key}
              mountProgress={mountProgress}
              target={target}
            />
          );
        })}
    </motion.g>
  );
});

RadarArea.displayName = 'RadarArea';

export default RadarArea;

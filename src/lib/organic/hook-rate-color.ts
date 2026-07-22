// Color scale for a hook-rate figure so a glance flags risk vs strength:
// 30% and below fades yellow -> red as it approaches (and passes) 10%; 50% and
// above fades lime -> pine green as it approaches (and passes) 80%. The 31-49%
// band is intentionally neutral — it renders in the surrounding text color.

const RED: readonly [number, number, number] = [239, 68, 68]; // tailwind red-500
const YELLOW: readonly [number, number, number] = [250, 204, 21]; // tailwind yellow-400
const LIME: readonly [number, number, number] = [132, 204, 22]; // tailwind lime-500
const PINE: readonly [number, number, number] = [21, 128, 61]; // tailwind green-700

const LOW_RANGE_FLOOR = 10;
const LOW_RANGE_CEILING = 30;
const HIGH_RANGE_FLOOR = 50;
const HIGH_RANGE_CEILING = 80;

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function mixColor(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  t: number,
): string {
  const r = Math.round(from[0] + (to[0] - from[0]) * t);
  const g = Math.round(from[1] + (to[1] - from[1]) * t);
  const b = Math.round(from[2] + (to[2] - from[2]) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

export function hookRateTextColor(hookRate: number): string | undefined {
  if (hookRate <= LOW_RANGE_CEILING) {
    const t = clampUnit((hookRate - LOW_RANGE_FLOOR) / (LOW_RANGE_CEILING - LOW_RANGE_FLOOR));
    return mixColor(RED, YELLOW, t);
  }
  if (hookRate >= HIGH_RANGE_FLOOR) {
    const t = clampUnit((hookRate - HIGH_RANGE_FLOOR) / (HIGH_RANGE_CEILING - HIGH_RANGE_FLOOR));
    return mixColor(LIME, PINE, t);
  }
  return undefined;
}

// The schedule as the review panel states it: "Tue Oct 13, 10:00 AM PDT". The instant is
// composed in the brand's zone, the same zone the field-edit route composes it in, so the
// label names the moment the scheduler will actually fire.

import { plannerInstantFromDayTime, resolvePlannerTimeZone } from '@continuum/contracts';

export function formatScheduleWithZone(
  dayId: string | null,
  timeLabel: string,
  timeZone?: string | null,
): string | null {
  if (!dayId) return null;
  const instant = plannerInstantFromDayTime({ dayId, timeOfDay: timeLabel, timeZone });
  if (!instant) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: resolvePlannerTimeZone(timeZone),
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('weekday')} ${part('month')} ${part('day')}, ${part('hour')}:${part('minute')} ${part('dayPeriod')} ${part('timeZoneName')}`;
}

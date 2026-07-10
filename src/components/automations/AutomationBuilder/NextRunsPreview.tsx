'use client';

import type { AutomationSchedule } from '@continuum/contracts';
import { useMemo } from 'react';
import { formatInTimezone, nextRunTimes } from '@/lib/automations/schedule';

// Doubles as live validation feedback: an unparseable cron renders the error
// hint instead of fire times.
export function NextRunsPreview({ schedule }: { schedule: AutomationSchedule }) {
  const runs = useMemo(() => nextRunTimes(schedule, 3), [schedule]);

  if (runs.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No upcoming runs — check the schedule expression.
      </p>
    );
  }

  return (
    <div className="text-xs text-muted-foreground">
      <span className="font-medium text-foreground">Next runs:</span>{' '}
      {runs.map((run) => formatInTimezone(run, schedule.timezone)).join(' · ')}
    </div>
  );
}

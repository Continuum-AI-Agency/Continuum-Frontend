'use client';

import type { AutomationSchedule } from '@continuum/contracts';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { formatInTimezone, nextRunTimes } from '@/lib/automations/schedule';

// Doubles as live validation feedback: an unparseable cron renders the error
// hint instead of fire times.
export function NextRunsPreview({ schedule }: { schedule: AutomationSchedule }) {
  const uiText = useTranslations('automations');
  const uiLocale = useLocale();
  const runs = useMemo(() => nextRunTimes(schedule, 3), [schedule]);

  if (runs.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {uiText('no_upcoming_runs_check_the_schedule_expressio_8d84dee')}
      </p>
    );
  }

  return (
    <div className="text-xs text-muted-foreground">
      <span className="font-medium text-foreground">{uiText('next_runs_8c4865b')}</span>{' '}
      {runs.map((run) => formatInTimezone(run, schedule.timezone, uiLocale)).join(' · ')}
    </div>
  );
}

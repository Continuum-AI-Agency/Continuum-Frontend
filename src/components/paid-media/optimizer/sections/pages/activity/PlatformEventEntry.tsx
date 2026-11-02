'use client';

// A platform event in the Activity list, beside the action rows: a change the platform's own
// history saw, a roster that drifted (the server log's own row), or a day the account stopped or
// started showing ads (read off its daily spend). A day has no clock time, so a day event says
// "day" where a write prints its time.

import { cn } from '@/lib/utils';
import { TimelineEntry } from '../../feedTimeline';
import { type ActivityPlatformItem, deliveryWords, SOURCE_COLOR } from './activityModel';
import { LifecycleLogRow } from './LifecycleEntry';

export function PlatformEventEntry({
  item,
  highlighted,
}: {
  item: ActivityPlatformItem;
  highlighted: boolean;
}) {
  if (item.kind === 'log') {
    return <LifecycleLogRow eventId={item.id} highlighted={highlighted} row={item.row} />;
  }
  if (item.kind === 'change') {
    const { change } = item;
    return (
      <TimelineEntry
        className={cn('-mx-2 rounded-md px-2 transition-colors', highlighted && 'bg-muted/70')}
        data-event-id={item.id}
        data-highlighted={highlighted ? 'true' : undefined}
        data-testid="activity-change-entry"
        tone="neutral"
        ts={change.at}
      >
        <p className="text-sm leading-snug">
          <span className="font-semibold text-foreground">{change.what}</span>
          {change.where ? (
            <span className="text-muted-foreground text-xs"> · {change.where}</span>
          ) : null}
        </p>
        <p className="mt-0.5 text-muted-foreground text-xs leading-relaxed">
          {change.detail ? `${change.detail} · ` : ''}
          {change.who}
        </p>
      </TimelineEntry>
    );
  }
  const words = deliveryWords(item.event);
  return (
    <li
      className={cn(
        '-mx-2 grid grid-cols-[2.75rem_0.5rem_minmax(0,1fr)_auto] items-start gap-x-3 rounded-md px-2 py-2 transition-colors',
        highlighted && 'bg-muted/70',
      )}
      data-event-id={item.id}
      data-highlighted={highlighted ? 'true' : undefined}
      data-testid="activity-delivery-entry"
    >
      <span className="pt-0.5 font-mono text-muted-foreground text-xs">day</span>
      <span
        aria-hidden="true"
        className="mt-1.5 size-2 rounded-full"
        data-tone={item.event.kind === 'stopped' ? 'stopped' : 'landed'}
        style={{ background: SOURCE_COLOR.platform }}
      />
      <div className="min-w-0">
        <p className="font-semibold text-foreground text-sm leading-snug">{words.title}</p>
        <p className="mt-0.5 text-muted-foreground text-xs leading-relaxed">{words.detail}</p>
      </div>
      <div />
    </li>
  );
}

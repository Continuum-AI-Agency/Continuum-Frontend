'use client';
import { useTranslations as useBetaTranslations } from 'next-intl';

// The Activity sub-view (G13): two feeds that used to be one.
//
//   Actions    — what changed on the AD ACCOUNT, against what it spent. The account's spend per
//                day over the window, the days it showed no ad shaded, a dot per event coloured
//                by the hand that made it (the Optimizer, the team, the platform), then the same
//                events as a list by day. Every write keeps its before, its after, its actor, its
//                reason and (where the server says so) its one-click undo.
//   Server log — what the MACHINE did. Cycle lifecycle, skips, drift, failures.
//
// They are separate because they answer different questions, and merging them made both
// worse: a lifecycle row has no before/after to show, and an action row buried in cycle
// chatter has no revert. The split is the server's (optimizer_list_actions vs the narrowed
// optimizer_list_logs); this only chooses which of the two to render. The one crossing is the
// platform's own: a roster that drifted is listed beside the actions, because the platform did it.

import { OPTIMIZER_FEED_WINDOW_DAYS, type OptimizerFeedWindowDays } from '@continuum/contracts';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { OptimizerNotificationsSection } from '@/components/settings/account/OptimizerNotificationsSection';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { cn } from '@/lib/utils';
import { boardPaletteClass } from './board/palette';
import { OptimizerLogs } from './OptimizerLogs';
import { ActivityActionsView } from './pages/activity/ActivityActionsView';

type ActivityFeed = 'actions' | 'server';

const FEEDS: { value: ActivityFeed; label: string }[] = [
  { value: 'actions', label: 'Actions' },
  { value: 'server', label: 'Server log' },
];

const WINDOWS = OPTIMIZER_FEED_WINDOW_DAYS.map((days) => ({
  value: days,
  label: `${days}d`,
}));

/** A segmented switch: one track, the chosen option lifted onto the page colour. */
function Segmented<TValue extends string | number>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: readonly { value: TValue; label: string }[];
  value: TValue;
  onChange: (value: TValue) => void;
}) {
  return (
    // A segmented row like ToggleGroup's: `hit-area-row` caps each segment's pad at half the
    // gap it shares, so neighbouring segments never take each other's presses (globals.css).
    <fieldset className="hit-area-row inline-flex shrink-0 gap-0.5 rounded-lg border-0 bg-muted/60 p-0.5 [--hit-area-gap:calc(var(--spacing)*0.5)]">
      <legend className="sr-only">{legend}</legend>
      {options.map((option) => (
        <button
          aria-pressed={value === option.value}
          className={cn(
            'hit-area rounded-md px-2.5 py-1 font-medium text-xs tabular-nums transition-colors',
            value === option.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}

/** Where the optimizer's moves can be sent instead of read here. The feed draws it once it has
 *  answered: under the loading skeleton, the timeline that replaced the skeleton pushed it down
 *  (PP-DT-C-creative-insights-layout-shift-0.955, Activity CLS 0.151 on a phone). */
function ActivityNotifications({ brandId }: { brandId: string }) {
  const betaUiText = useBetaTranslations('scale');

  return (
    <div className="mt-4 border-t border-border/60 pt-4">
      <SectionHeader title={betaUiText('beta_788011833a5a')} />
      <p className="mt-2 text-xs text-muted-foreground">{betaUiText('beta_6b28c7822e44')}</p>
      <div className="mt-3">
        <OptimizerNotificationsSection brandId={brandId} />
      </div>
    </div>
  );
}

export function OptimizerActivity({ brandId }: { brandId: string }) {
  const uiText = useTranslations('scale');
  const [feed, setFeed] = useState<ActivityFeed>('actions');
  const [windowDays, setWindowDays] = useState<OptimizerFeedWindowDays>(7);

  // The feed switch and the window lead both views. The Server log draws them on the line its
  // portfolio filter shares; the Actions view puts its chart between them and its list.
  const controls = (
    <>
      <Segmented
        legend={uiText('activityChooseFeed')}
        onChange={setFeed}
        options={FEEDS.map((feed) => ({
          ...feed,
          label: uiText('activityFeedLabel', { kind: feed.value }),
        }))}
        value={feed}
      />
      <Segmented
        legend={uiText('activityLastWindow')}
        onChange={setWindowDays}
        options={WINDOWS.map((window) => ({
          ...window,
          label: uiText('activityWindowShort', { days: window.value }),
        }))}
        value={windowDays}
      />
    </>
  );

  const footer = <ActivityNotifications brandId={brandId} />;

  return (
    <div className={cn(boardPaletteClass, 'space-y-3')} data-testid="optimizer-activity">
      {feed === 'actions' ? (
        <>
          <div className="flex flex-wrap items-center gap-2">{controls}</div>
          <ActivityActionsView brandId={brandId} footer={footer} windowDays={windowDays} />
        </>
      ) : (
        <OptimizerLogs
          brandId={brandId}
          controls={controls}
          footer={footer}
          windowDays={windowDays}
        />
      )}
    </div>
  );
}

'use client';

import * as React from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDayId } from './calendar-utils';
import { PlannerHeader } from './PlannerHeader';
import { PlannerMatrix } from './PlannerMatrix';
import type {
  CreatePostFormat,
  CreatePostMode,
  PlannerPlatform,
  PlannerPlatformKey,
} from './planner-platforms';
import type {
  OrganicCalendarDay,
  OrganicCalendarPostedContent,
  OrganicPlatformTag,
  OrganicSeedDragPayload,
} from './types';

type TimeGridCanvasProps = {
  days: OrganicCalendarDay[];
  platforms: PlannerPlatform[];
  postedContent: OrganicCalendarPostedContent[];
  selectedDraftId: string | null;
  selectedDraftIds: string[];
  rangeTitle: string;
  rangeSubtitle?: string;
  onPreviousWeek: () => void;
  onToday: () => void;
  onNextWeek: () => void;
  isLoadingPostedContent?: boolean;
  postedContentError?: string | null;
  onRetryPostedContent?: () => void;
  onCreatePost: (options?: {
    dayId?: string;
    platform?: PlannerPlatformKey;
    status?: 'draft' | 'scheduled' | 'placeholder';
    mode?: CreatePostMode;
    format?: CreatePostFormat;
  }) => void;
  onSelectDraft: (id: string) => void;
  onToggleSelection: (id: string) => void;
  onRegenerate: (draftId: string) => void;
  onClearFailure?: (draftId: string) => void;
  onEnrich?: (draftId: string) => void;
  onRealize?: (draftId: string) => void;
  onStitch?: (draftId: string) => void;
  onNativeDrop?: (
    dayId: string,
    time: string,
    data: OrganicSeedDragPayload,
    platformKey?: OrganicPlatformTag,
  ) => void;
};

export function TimeGridCanvas({
  days,
  platforms,
  postedContent,
  selectedDraftId,
  selectedDraftIds,
  rangeTitle,
  rangeSubtitle,
  onPreviousWeek,
  onToday,
  onNextWeek,
  isLoadingPostedContent = false,
  postedContentError,
  onRetryPostedContent,
  onCreatePost,
  onSelectDraft,
  onToggleSelection,
  onRegenerate,
  onClearFailure,
  onEnrich,
  onRealize,
  onStitch,
  onNativeDrop,
}: TimeGridCanvasProps) {
  const todayId = React.useMemo(() => formatDayId(new Date()), []);

  return (
    <section className="flex h-full min-h-0 flex-col gap-2 rounded-lg bg-card/50 p-2">
      <PlannerHeader
        title={rangeTitle}
        subtitle={rangeSubtitle}
        onPreviousWeek={onPreviousWeek}
        onToday={onToday}
        onNextWeek={onNextWeek}
      />

      {isLoadingPostedContent ? (
        <div className="flex items-center gap-2 px-1" role="status">
          <span className="sr-only">Loading published posts</span>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-40" />
        </div>
      ) : null}

      {postedContentError ? (
        <Alert variant="destructive" className="px-3 py-2">
          <AlertTitle>Posted content could not be loaded</AlertTitle>
          <AlertDescription>
            <span>{postedContentError}</span>
            {onRetryPostedContent ? (
              <Button type="button" size="xs" variant="outline" onClick={onRetryPostedContent}>
                Try again
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <PlannerMatrix
        days={days}
        platforms={platforms}
        postedContent={postedContent}
        selectedDraftId={selectedDraftId}
        selectedDraftIds={selectedDraftIds}
        todayId={todayId}
        onSelectDraft={onSelectDraft}
        onToggleSelection={onToggleSelection}
        onRegenerate={onRegenerate}
        onClearFailure={onClearFailure}
        onEnrich={onEnrich}
        onRealize={onRealize}
        onStitch={onStitch}
        onNativeDrop={onNativeDrop}
        onCreatePost={({ dayId, platformKey, status, mode, format }) =>
          onCreatePost({
            dayId,
            platform: platformKey,
            status,
            mode,
            format,
          })
        }
      />
    </section>
  );
}

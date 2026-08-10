'use client';
import { Check, FileText, RotateCw, X } from 'lucide-react';

import type * as React from 'react';
import type { CalendarGenerationEvent } from '@/lib/organic/calendar-generation';
import { friendlyStreamError } from '@/lib/organic/streamErrorMessage';
import { cn } from '@/lib/utils';
import { PlacementNotificationCard } from './PlacementNotificationCard';
import type { StreamEvent } from './types';

interface StreamEventItemProps {
  event: StreamEvent;
  onPlacementSelect?: (placementId: string) => void;
}

const stageIcons: Record<string, React.ReactNode> = {
  analyzing: <RotateCw className="w-3.5 h-3.5" />,
  optimizing: <RotateCw className="w-3.5 h-3.5" />,
  drafting: <FileText className="w-3.5 h-3.5" />,
  matching: <RotateCw className="w-3.5 h-3.5" />,
  finalizing: <Check className="w-3.5 h-3.5" />,
};

const stageColors: Record<string, string> = {
  analyzing: 'text-secondary',
  optimizing: 'text-warning',
  drafting: 'text-primary',
  matching: 'text-secondary',
  finalizing: 'text-success',
};

function formatTimeLabel(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function StreamEventItem({ event, onPlacementSelect }: StreamEventItemProps) {
  const timeLabel = formatTimeLabel(event.timestamp);

  if (event.type === 'placement') {
    const placementEvent = event.data as Extract<CalendarGenerationEvent, { type: 'placement' }>;
    const placement = placementEvent.placement;
    return (
      <PlacementNotificationCard
        placement={placement}
        timestamp={event.timestamp}
        onSelect={onPlacementSelect}
      />
    );
  }

  if (event.type === 'slot_completed') {
    const placementData = event.data as Extract<
      CalendarGenerationEvent,
      { type: 'slot_completed' }
    >;
    const placement = placementData.placement;
    return (
      <PlacementNotificationCard
        placement={placement}
        timestamp={event.timestamp}
        onSelect={onPlacementSelect}
      />
    );
  }

  if (event.type === 'progress') {
    const progressData = event.data as Extract<CalendarGenerationEvent, { type: 'progress' }>;
    const stage = progressData.stage || 'processing';
    const icon = stageIcons[stage] || stageIcons.analyzing;
    const colorClass = stageColors[stage] || stageColors.analyzing;

    return (
      <div className="flex items-center gap-3 py-2 px-3 rounded-md hover:bg-muted/50 transition-colors">
        <div className={cn('flex items-center justify-center', colorClass)}>{icon}</div>
        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-sm truncate">{progressData.message || 'Processing...'}</span>
          <span className="text-xs text-muted-foreground">
            {progressData.completed}/{progressData.total} completed
          </span>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">{timeLabel}</span>
      </div>
    );
  }

  if (event.type === 'slot_started') {
    const startedData = event.data as Extract<CalendarGenerationEvent, { type: 'slot_started' }>;
    return (
      <div className="flex items-center gap-3 py-2 px-3 rounded-md hover:bg-muted/50 transition-colors">
        <div className="flex items-center justify-center text-warning">
          <RotateCw className="w-3.5 h-3.5" />
        </div>
        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-sm truncate">
            {startedData.message ?? `Generating ${startedData.placementId}`}
          </span>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">{timeLabel}</span>
      </div>
    );
  }

  if (event.type === 'error') {
    const errorData = event.data as Extract<CalendarGenerationEvent, { type: 'error' }>;
    return (
      <div
        className="flex items-center gap-3 py-2 px-3 rounded-md bg-destructive/10 border border-destructive/20"
        role="alert"
      >
        <div className="flex items-center justify-center text-destructive">
          <X className="w-3.5 h-3.5" />
        </div>
        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-sm text-destructive truncate">
            {friendlyStreamError(errorData.message)}
          </span>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">{timeLabel}</span>
      </div>
    );
  }

  if (event.type === 'slot_failed') {
    const errorData = event.data as Extract<CalendarGenerationEvent, { type: 'slot_failed' }>;
    return (
      <div
        className="flex items-center gap-3 py-2 px-3 rounded-md bg-destructive/10 border border-destructive/20"
        role="alert"
      >
        <div className="flex items-center justify-center text-destructive">
          <X className="w-3.5 h-3.5" />
        </div>
        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-sm text-destructive truncate">
            {friendlyStreamError(errorData.message)}
          </span>
          <span className="text-xs text-muted-foreground">{errorData.placementId}</span>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">{timeLabel}</span>
      </div>
    );
  }

  if (event.type === 'complete') {
    return (
      <div className="flex items-center gap-3 py-2 px-3 rounded-md bg-success/10 border border-success/20">
        <div className="flex items-center justify-center text-success">
          <Check className="w-3.5 h-3.5" />
        </div>
        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-sm truncate">Generation complete</span>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">{timeLabel}</span>
      </div>
    );
  }

  return null;
}

'use client';

import { ActivityLogIcon, Cross2Icon } from '@radix-ui/react-icons';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { StreamEventItem } from './StreamEventItem';
import type { StreamEvent } from './types';

interface EventStreamPanelProps {
  events: StreamEvent[];
  onClear?: () => void;
  onPlacementSelect?: (placementId: string) => void;
  className?: string;
}

export function EventStreamPanel({
  events,
  onClear,
  onPlacementSelect,
  className,
}: EventStreamPanelProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = React.useState(true);

  const scrollToBottom = React.useCallback(() => {
    if (scrollRef.current && shouldAutoScroll) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [shouldAutoScroll]);

  React.useEffect(() => {
    scrollToBottom();
  }, [events, scrollToBottom]);

  const handleScroll = React.useCallback(() => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;
      setShouldAutoScroll(isNearBottom);
    }
  }, []);

  const hasEvents = events.length > 0;

  return (
    <div
      data-testid="event-stream-panel"
      className={cn('overflow-hidden rounded-lg border bg-card', className)}
    >
      <div className="flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <ActivityLogIcon className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-base font-semibold">Generation Stream</h3>
            {hasEvents && (
              <span className="text-xs text-muted-foreground tabular-nums">({events.length})</span>
            )}
          </div>

          {hasEvents && onClear && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              className="text-muted-foreground hover:text-foreground"
            >
              <Cross2Icon className="w-3 h-3 mr-1" />
              Clear
            </Button>
          )}
        </div>

        <div>
          {hasEvents ? (
            <div ref={scrollRef} onScroll={handleScroll} className="max-h-[400px] overflow-y-auto">
              <div className="flex flex-col p-2 gap-1">
                {events.map((event) => (
                  <StreamEventItem
                    key={event.id}
                    event={event}
                    onPlacementSelect={onPlacementSelect}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <ActivityLogIcon className="w-8 h-8 text-muted-foreground/50 mb-3" />
              <span className="text-sm text-muted-foreground">Start generation to see events</span>
              <span className="mt-1 text-xs text-muted-foreground">
                Progress updates and placements will appear here
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

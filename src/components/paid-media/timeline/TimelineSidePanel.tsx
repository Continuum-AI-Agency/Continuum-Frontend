import { X } from 'lucide-react';
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { TimelineEvent } from '@/types/timeline';
import { getEventIcon } from './TimelineEventMarker';

interface TimelineSidePanelProps {
  events: TimelineEvent[];
  selectedEventId?: string;
  onSelectEvent: (event: TimelineEvent) => void;
  onClose: () => void;
}

export function TimelineSidePanel({
  events,
  selectedEventId,
  onSelectEvent,
  onClose,
}: TimelineSidePanelProps) {
  return (
    <div className="w-80 border-l border-border bg-card flex flex-col h-full shrink-0">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="font-semibold">Timeline Events</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X size={16} />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 flex flex-col gap-3">
          {events.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center mt-4">No events found.</div>
          ) : (
            events.map((event) => (
              <button
                key={event.id || `${event.date}-${event.type}`}
                onClick={() => onSelectEvent(event)}
                className={`text-left p-3 rounded-md border text-sm transition-colors ${
                  selectedEventId === event.id
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:bg-muted'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-1">{getEventIcon(event.type, 16)}</div>
                  <div className="flex flex-col gap-1">
                    <span className="font-medium">
                      {event.summary || event.type.replace('_', ' ')}
                    </span>
                    <div className="text-xs text-muted-foreground">
                      {new Date(event.date).toLocaleDateString()} {event.time}
                    </div>
                    {event.adName && (
                      <div className="text-xs text-muted-foreground line-clamp-1 mt-1">
                        Ad: {event.adName}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

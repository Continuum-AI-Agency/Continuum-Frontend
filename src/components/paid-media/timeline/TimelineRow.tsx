import React from 'react';
import type { TimelineEvent, TimelineSegment } from '@/types/timeline';
import { TimelineEventMarker } from './TimelineEventMarker';

interface TimelineRowProps {
  title: string;
  subtitle?: string;
  segments: TimelineSegment[];
  events?: TimelineEvent[];
  startDateMs: number;
  endDateMs: number;
  indent?: number;
  onEventClick?: (event: TimelineEvent) => void;
  selectedEventId?: string;
  isAd?: boolean;
}

export function TimelineRow({
  title,
  subtitle,
  segments,
  events = [],
  startDateMs,
  endDateMs,
  indent = 0,
  onEventClick,
  selectedEventId,
  isAd = false,
}: TimelineRowProps) {
  const totalDurationMs = endDateMs - startDateMs;

  const getSegmentStyle = (segment: TimelineSegment) => {
    const segStartMs = new Date(segment.start).getTime();
    const segEndMs = new Date(segment.end).getTime();

    const clampStart = Math.max(startDateMs, segStartMs);
    const clampEnd = Math.min(endDateMs, segEndMs);

    const leftPct = ((clampStart - startDateMs) / totalDurationMs) * 100;
    const widthPct = ((clampEnd - clampStart) / totalDurationMs) * 100;

    return {
      left: `${leftPct}%`,
      width: `${Math.max(0, widthPct)}%`,
    };
  };

  const getEventLeft = (event: TimelineEvent) => {
    const eventMs = new Date(event.date).getTime();
    return ((eventMs - startDateMs) / totalDurationMs) * 100;
  };

  return (
    <div className="flex w-full min-h-[48px] border-b border-border group hover:bg-muted/50 transition-colors relative">
      {/* Left labels column */}
      <div
        className="w-64 shrink-0 flex flex-col justify-center px-3 py-2 border-r border-border bg-background z-20 sticky left-0"
        style={{ paddingLeft: `${12 + indent * 16}px` }}
      >
        <div className="text-sm font-medium truncate" title={title}>
          {title}
        </div>
        {subtitle && (
          <div className="text-xs text-muted-foreground truncate" title={subtitle}>
            {subtitle}
          </div>
        )}
      </div>

      {/* Timeline track area */}
      <div className="flex-grow relative min-w-[500px] overflow-hidden">
        {/* Segments */}
        {segments.map((seg, idx) => {
          const style = getSegmentStyle(seg);
          if (parseFloat(style.width) <= 0) return null;

          return (
            <div
              key={idx}
              className={`absolute top-1/2 -translate-y-1/2 h-6 rounded-sm opacity-80 ${
                seg.status === 'ACTIVE'
                  ? 'bg-green-500/20 border border-green-500/50'
                  : 'bg-muted border border-border'
              } ${isAd ? 'h-4' : 'h-6'}`}
              style={style}
              title={`Status: ${seg.status} | Spend: $${seg.spend_start || 0} - $${seg.spend_end || 0}`}
            >
              <div
                className={`w-full h-full rounded-sm ${seg.status === 'ACTIVE' ? 'bg-green-500' : 'bg-muted-foreground/30'}`}
                style={{ opacity: 0.3 }}
              />
            </div>
          );
        })}

        {/* Events */}
        {events.map((evt, idx) => {
          const left = getEventLeft(evt);
          if (left < 0 || left > 100) return null;

          return (
            <TimelineEventMarker
              key={evt.id || idx}
              event={evt}
              left={left}
              onClick={onEventClick}
              isSelected={evt.id === selectedEventId}
            />
          );
        })}
      </div>
    </div>
  );
}

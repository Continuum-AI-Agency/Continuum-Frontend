import {
  AlertCircle,
  Banknote,
  Image as ImageIcon,
  Maximize,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import React from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { TimelineEvent, TimelineEventType } from '@/types/timeline';

export const getEventIcon = (type: TimelineEventType, size = 16) => {
  switch (type) {
    case 'pause':
      return <PauseCircle size={size} className="text-destructive" />;
    case 'resume':
      return <PlayCircle size={size} className="text-green-500" />;
    case 'creative_change':
      return <ImageIcon size={size} className="text-blue-500" />;
    case 'budget_increase':
      return <TrendingUp size={size} className="text-green-500" />;
    case 'budget_decrease':
      return <TrendingDown size={size} className="text-destructive" />;
    case 'budget_change':
      return <Banknote size={size} className="text-yellow-500" />;
    case 'audience_change':
      return <Users size={size} className="text-purple-500" />;
    case 'creative_refresh':
      return <RefreshCw size={size} className="text-blue-500" />;
    case 'audience_expand':
      return <Maximize size={size} className="text-purple-500" />;
    default:
      return <AlertCircle size={size} className="text-muted-foreground" />;
  }
};

interface TimelineEventMarkerProps {
  event: TimelineEvent;
  left: number; // Percentage
  onClick?: (event: TimelineEvent) => void;
  isSelected?: boolean;
}

export function TimelineEventMarker({
  event,
  left,
  onClick,
  isSelected,
}: TimelineEventMarkerProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClick?.(event);
              }}
              className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-background border flex items-center justify-center shadow-sm hover:scale-110 transition-transform z-10 ${
                isSelected ? 'ring-2 ring-primary border-primary' : 'border-border'
              }`}
              style={{ left: `${left}%` }}
            >
              {getEventIcon(event.type, 14)}
            </button>
          }
        />
        <TooltipContent>
          <div className="flex flex-col gap-1 text-xs">
            <span className="font-semibold">{event.summary || event.type.replace('_', ' ')}</span>
            <span className="text-muted-foreground">
              {new Date(event.date).toLocaleDateString()} {event.time}
            </span>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

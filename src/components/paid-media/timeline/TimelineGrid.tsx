import React, { useMemo } from 'react';
import { TimelineCampaign, TimelineEvent } from '@/types/timeline';
import { CampaignRow } from './CampaignRow';

interface TimelineGridProps {
    startDateMs: number;
    endDateMs: number;
    campaigns: TimelineCampaign[];
    onEventClick?: (event: TimelineEvent) => void;
    selectedEventId?: string;
}

export function TimelineGrid({
    startDateMs,
    endDateMs,
    campaigns,
    onEventClick,
    selectedEventId
}: TimelineGridProps) {
    const totalDurationMs = endDateMs - startDateMs;
    const DAY_MS = 24 * 60 * 60 * 1000;
    const days = Math.ceil(totalDurationMs / DAY_MS);

    const ticks = useMemo(() => {
        const arr = [];
        for (let i = 0; i <= days; i++) {
            const time = startDateMs + i * DAY_MS;
            arr.push(time);
        }
        return arr;
    }, [startDateMs, days]);

    return (
        <div className="flex flex-col w-full min-w-max border rounded-md bg-card overflow-hidden">
            {/* Header / Axis */}
            <div className="flex h-10 border-b border-border bg-muted/50 sticky top-0 z-30">
                <div className="w-64 shrink-0 px-4 py-2 font-semibold text-sm border-r border-border flex items-center bg-muted/50 sticky left-0 z-40">
                    Campaign / Ad Set / Ad
                </div>
                <div className="flex-grow relative min-w-[500px]">
                    {ticks.map((tick, i) => {
                        const leftPct = ((tick - startDateMs) / totalDurationMs) * 100;
                        if (leftPct < 0 || leftPct > 100) return null;
                        
                        const dateObj = new Date(tick);
                        const label = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

                        return (
                            <div 
                                key={i} 
                                className="absolute top-0 bottom-0 border-l border-border/50 text-xs text-muted-foreground pt-2 pl-1"
                                style={{ left: `${leftPct}%` }}
                            >
                                {label}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Body */}
            <div className="flex flex-col relative w-full">
                {/* Vertical grid lines overlay */}
                <div className="absolute inset-0 pointer-events-none z-0 ml-64 flex-grow min-w-[500px]">
                    {ticks.map((tick, i) => {
                        const leftPct = ((tick - startDateMs) / totalDurationMs) * 100;
                        if (leftPct < 0 || leftPct > 100) return null;
                        return (
                            <div 
                                key={i} 
                                className="absolute top-0 bottom-0 border-l border-border/20"
                                style={{ left: `${leftPct}%` }}
                            />
                        );
                    })}
                </div>

                {/* Rows */}
                <div className="z-10 w-full relative">
                    {campaigns.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground w-full">
                            No campaigns found in this time range.
                        </div>
                    ) : (
                        campaigns.map(camp => (
                            <CampaignRow
                                key={camp.id}
                                campaign={camp}
                                startDateMs={startDateMs}
                                endDateMs={endDateMs}
                                onEventClick={onEventClick}
                                selectedEventId={selectedEventId}
                            />
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

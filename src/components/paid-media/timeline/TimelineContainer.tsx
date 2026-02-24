import React, { useState } from 'react';
import { Maximize2, Minimize2, PanelRightClose, PanelRightOpen, Calendar as CalendarIcon } from 'lucide-react';
import { useTimelineBlocks } from '@/hooks/timeline/useTimelineBlocks';
import { TimelineGrid } from './TimelineGrid';
import { TimelineSidePanel } from './TimelineSidePanel';
import { TimelineEvent } from '@/types/timeline';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, subDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface TimelineContainerProps {
    accountId: string | null;
}

export function TimelineContainer({ accountId }: TimelineContainerProps) {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showSidebar, setShowSidebar] = useState(false);
    const [selectedEventId, setSelectedEventId] = useState<string | undefined>();
    
    // Default range: last 30 days
    const [date, setDate] = useState<{from: Date, to: Date} | undefined>({
        from: subDays(new Date(), 30),
        to: new Date()
    });

    const startDate = date?.from?.toISOString();
    const endDate = date?.to?.toISOString();

    const { campaigns, events, loading, error } = useTimelineBlocks({
        accountId,
        startDate,
        endDate
    });

    const handleEventClick = (event: TimelineEvent) => {
        setSelectedEventId(event.id);
        setShowSidebar(true);
    };

    const startDateMs = date?.from?.getTime() || new Date().getTime() - (30 * 24 * 60 * 60 * 1000);
    const endDateMs = date?.to?.getTime() || new Date().getTime();

    const Content = (
        <div className="flex flex-col h-full bg-background relative overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center justify-between p-2 border-b border-border bg-muted/30">
                <div className="flex items-center gap-2">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                id="date"
                                variant={"outline"}
                                className={cn(
                                    "w-[260px] justify-start text-left font-normal",
                                    !date && "text-muted-foreground"
                                )}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {date?.from ? (
                                    date.to ? (
                                        <>
                                            {format(date.from, "LLL dd, y")} -{" "}
                                            {format(date.to, "LLL dd, y")}
                                        </>
                                    ) : (
                                        format(date.from, "LLL dd, y")
                                    )
                                ) : (
                                    <span>Pick a date range</span>
                                )}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                                initialFocus
                                mode="range"
                                defaultMonth={date?.from}
                                selected={date}
                                onSelect={(range: any) => setDate(range)}
                                numberOfMonths={2}
                            />
                        </PopoverContent>
                    </Popover>
                    
                    {loading && <span className="text-sm text-muted-foreground ml-2 animate-pulse">Loading blocks...</span>}
                    {error && <span className="text-sm text-destructive ml-2">Error: {error.message}</span>}
                </div>

                <div className="flex items-center gap-2">
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => setShowSidebar(!showSidebar)}
                        title="Toggle Events Sidebar"
                    >
                        {showSidebar ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
                    </Button>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => setIsFullscreen(!isFullscreen)}
                        title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                    >
                        {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                    </Button>
                </div>
            </div>

            {/* Main Area */}
            <div className="flex flex-1 overflow-hidden">
                {/* Timeline Graph */}
                <div className="flex-1 overflow-auto relative">
                    <TimelineGrid
                        startDateMs={startDateMs}
                        endDateMs={endDateMs}
                        campaigns={campaigns}
                        onEventClick={handleEventClick}
                        selectedEventId={selectedEventId}
                    />
                </div>

                {/* Sidebar */}
                {showSidebar && (
                    <TimelineSidePanel
                        events={events}
                        selectedEventId={selectedEventId}
                        onSelectEvent={handleEventClick}
                        onClose={() => setShowSidebar(false)}
                    />
                )}
            </div>
        </div>
    );

    if (isFullscreen) {
        return (
            <div className="fixed inset-0 z-50 bg-background flex flex-col">
                {Content}
            </div>
        );
    }

    return (
        <Card className="w-full flex flex-col h-[600px] overflow-hidden">
            <CardHeader className="py-3 px-4 border-b">
                <CardTitle className="text-lg">DCO Timeline</CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-hidden">
                {Content}
            </CardContent>
        </Card>
    );
}

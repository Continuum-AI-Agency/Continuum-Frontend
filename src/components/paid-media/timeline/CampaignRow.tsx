import React, { useMemo, useState } from 'react';
import { TimelineBlock, TimelineCampaign, TimelineEvent } from '@/types/timeline';
import { TimelineRow } from './TimelineRow';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CampaignRowProps {
    campaign: TimelineCampaign;
    startDateMs: number;
    endDateMs: number;
    onEventClick?: (event: TimelineEvent) => void;
    selectedEventId?: string;
}

export function CampaignRow({
    campaign,
    startDateMs,
    endDateMs,
    onEventClick,
    selectedEventId,
}: CampaignRowProps) {
    const [expanded, setExpanded] = useState(false);

    // Compute campaign-level segments from adsets/ads if missing
    // or just render the children
    
    // For simplicity, we just aggregate ad segments up to campaign level if needed
    // Assuming backend returns aggregated events/segments at campaign level
    const campaignEvents = campaign.ad_sets?.flatMap(adset => 
        adset.ads?.flatMap(ad => ad.events || []) || []
    ) || [];

    // Simple status segment based on start/end dates
    const start = campaign.start_date || new Date(startDateMs).toISOString();
    const end = campaign.end_date || new Date(endDateMs).toISOString();
    const campSegment = [{ start, end, status: campaign.status || 'ACTIVE' }];

    return (
        <div className="flex flex-col border-b border-border w-full">
            <div className="flex relative items-center bg-muted/20">
                <Button 
                    variant="ghost" 
                    size="sm" 
                    className="w-8 h-8 p-0 ml-2" 
                    onClick={() => setExpanded(!expanded)}
                >
                    {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </Button>
                <TimelineRow
                    title={campaign.name}
                    subtitle={`Budget: $${campaign.daily_budget || 0}/day`}
                    segments={campSegment}
                    events={campaignEvents} // Optional: showing aggregated events
                    startDateMs={startDateMs}
                    endDateMs={endDateMs}
                    indent={0}
                    onEventClick={onEventClick}
                    selectedEventId={selectedEventId}
                />
            </div>

            {expanded && campaign.ad_sets?.map(adset => (
                <div key={adset.id} className="flex flex-col border-l border-border ml-6">
                    <TimelineRow
                        title={adset.name}
                        subtitle={adset.targeting}
                        segments={[]} // AdSet level segments if available
                        events={adset.ads?.flatMap(ad => ad.events || []) || []}
                        startDateMs={startDateMs}
                        endDateMs={endDateMs}
                        indent={1}
                        onEventClick={onEventClick}
                        selectedEventId={selectedEventId}
                    />
                    
                    {adset.ads?.map(ad => (
                        <TimelineRow
                            key={ad.id}
                            title={ad.name}
                            segments={ad.segments || []}
                            events={ad.events || []}
                            startDateMs={startDateMs}
                            endDateMs={endDateMs}
                            indent={2}
                            onEventClick={onEventClick}
                            selectedEventId={selectedEventId}
                            isAd
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}

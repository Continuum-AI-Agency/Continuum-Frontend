import { ChevronDown, ChevronRight } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import type {
  DailyMetric,
  TimelineAd,
  TimelineAdSet,
  TimelineCampaign,
  TimelineEvent,
  TimelineSegment,
} from '@/types/timeline';
import { TimelineCampaignInsights } from './TimelineCampaignInsights';
import { TimelineRow } from './TimelineRow';

interface CampaignRowProps {
  campaign: TimelineCampaign;
  startDateMs: number;
  endDateMs: number;
  onEventClick?: (event: TimelineEvent) => void;
  selectedEventId?: string;
}

function buildMetricsDailyFromAds(ads: TimelineAd[] = []): DailyMetric[] {
  const byDate = new Map<string, { spend: number; roasSum: number; roasCount: number }>();

  const upsert = (date: string, spend?: number, roas?: number) => {
    const key = new Date(date).toISOString().slice(0, 10);
    const current = byDate.get(key) ?? { spend: 0, roasSum: 0, roasCount: 0 };
    current.spend += spend ?? 0;
    if (typeof roas === 'number') {
      current.roasSum += roas;
      current.roasCount += 1;
    }
    byDate.set(key, current);
  };

  ads.forEach((ad) => {
    ad.segments?.forEach((segment) => {
      upsert(segment.start, segment.spend_start, segment.roas_start);
      upsert(
        segment.end,
        segment.spend_end ?? segment.spend_start,
        segment.roas_end ?? segment.roas_start,
      );
    });
  });

  return Array.from(byDate.entries())
    .map(([date, value]) => ({
      date,
      spend: value.spend,
      roas: value.roasCount > 0 ? value.roasSum / value.roasCount : undefined,
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function buildCampaignMetricsDaily(campaign: TimelineCampaign): DailyMetric[] {
  if (campaign.metrics_daily?.length) {
    return campaign.metrics_daily;
  }
  const ads = campaign.ad_sets?.flatMap((adSet) => adSet.ads ?? []) ?? [];
  return buildMetricsDailyFromAds(ads);
}

function buildAdSetMetricsDaily(adSet: TimelineAdSet): DailyMetric[] {
  return buildMetricsDailyFromAds(adSet.ads ?? []);
}

function buildAdSetEvents(adSet: TimelineAdSet): TimelineEvent[] {
  return adSet.ads?.flatMap((ad) => ad.events || []) || [];
}

function buildAdSetSegments(adSet: TimelineAdSet): TimelineSegment[] {
  return adSet.ads?.flatMap((ad) => ad.segments || []) || [];
}

export function CampaignRow({
  campaign,
  startDateMs,
  endDateMs,
  onEventClick,
  selectedEventId,
}: CampaignRowProps) {
  const [expanded, setExpanded] = useState(false);
  const campaignMetricsDaily = useMemo(() => buildCampaignMetricsDaily(campaign), [campaign]);
  const adSetMetricsById = useMemo(
    () =>
      Object.fromEntries(
        (campaign.ad_sets ?? []).map((adSet) => [adSet.id, buildAdSetMetricsDaily(adSet)]),
      ),
    [campaign.ad_sets],
  );

  const campaignEvents =
    campaign.ad_sets?.flatMap((adSet) => adSet.ads?.flatMap((ad) => ad.events || []) || []) || [];
  const start = campaign.start_date || new Date(startDateMs).toISOString();
  const end = campaign.end_date || new Date(endDateMs).toISOString();
  const campSegment = [
    {
      start,
      end,
      status: (campaign.status === 'PAUSED' ? 'PAUSED' : 'ACTIVE') as 'ACTIVE' | 'PAUSED',
    },
  ];

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
          events={campaignEvents}
          startDateMs={startDateMs}
          endDateMs={endDateMs}
          indent={0}
          onEventClick={onEventClick}
          selectedEventId={selectedEventId}
        />
      </div>

      {expanded ? (
        <div className="flex flex-col border-l border-border ml-6">
          <TimelineCampaignInsights metricsDaily={campaignMetricsDaily} label="Campaign trends" />
          {campaign.ad_sets?.map((adSet) => (
            <div key={adSet.id} className="flex flex-col">
              <TimelineRow
                title={adSet.name}
                subtitle={adSet.targeting}
                segments={buildAdSetSegments(adSet)}
                events={buildAdSetEvents(adSet)}
                startDateMs={startDateMs}
                endDateMs={endDateMs}
                indent={1}
                onEventClick={onEventClick}
                selectedEventId={selectedEventId}
              />
              <TimelineCampaignInsights
                metricsDaily={adSetMetricsById[adSet.id]}
                label={`${adSet.name} trends`}
              />

              {adSet.ads?.map((ad) => (
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
      ) : null}
    </div>
  );
}

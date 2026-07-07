import { CalendarIcon, ClockIcon, GlobeIcon, ReaderIcon } from '@radix-ui/react-icons';

import { Pill } from '@/components/kibo-ui/pill';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Separator } from '@/components/ui/separator';
import type { BrandInsightsEvent } from '@/lib/schemas/brandInsights';
import { BrandEventsList } from './BrandEventsList';

type BrandEventsPanelProps = {
  events: BrandInsightsEvent[];
  country?: string;
  weekStartDate?: string;
  generatedAt?: string;
  status?: string;
};

function formatDate(value?: string) {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function BrandEventsPanel({
  events,
  country,
  weekStartDate,
  generatedAt,
  status,
}: BrandEventsPanelProps) {
  const weekLabel = formatDate(weekStartDate);
  const generatedLabel = formatDate(generatedAt);

  return (
    <GlassPanel className="p-[var(--card-pad)] space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ReaderIcon className="h-4 w-4 text-primary" aria-hidden="true" />
            <span className="text-xs text-muted-foreground">Brand Insights · Events</span>
          </div>
          <h3 className="text-xl font-semibold text-foreground">Time-bound opportunities</h3>
          <span className="block text-sm text-muted-foreground">
            Key dates and campaigns aligned to the latest generation window.
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {country && (
            <Pill variant="muted">
              <GlobeIcon className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              {country}
            </Pill>
          )}
          {weekLabel && (
            <Pill variant="violet">
              <CalendarIcon className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Week of {weekLabel}
            </Pill>
          )}
          {generatedLabel && (
            <Pill variant="success">
              <ClockIcon className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Updated {generatedLabel}
            </Pill>
          )}
          {status && <Pill variant="warning">{status}</Pill>}
        </div>
      </div>

      <Separator />

      <BrandEventsList events={events} />
    </GlassPanel>
  );
}

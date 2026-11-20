import { BookOpen, Calendar, Clock, Globe } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

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

function formatDate(value: string | undefined, uiLocale: string) {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toLocaleDateString(uiLocale, {
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
  const tUi = useTranslations('common');
  const uiLocale = useLocale();

  const weekLabel = formatDate(weekStartDate, uiLocale);
  const generatedLabel = formatDate(generatedAt, uiLocale);

  return (
    <GlassPanel className="p-[var(--card-pad)] space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" aria-hidden="true" />
            <span className="text-xs text-muted-foreground">{tUi('m_25a970ed1f')}</span>
          </div>
          <h3 className="text-xl font-semibold text-foreground">{tUi('m_e2036e64ba')}</h3>
          <span className="block text-sm text-muted-foreground">{tUi('m_ef3fa863a4')}</span>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {country && (
            <Pill variant="muted">
              <Globe className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              {country}
            </Pill>
          )}
          {weekLabel && (
            <Pill variant="violet">
              <Calendar className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              {tUi('m_7f262e0a5d')}
              {weekLabel}
            </Pill>
          )}
          {generatedLabel && (
            <Pill variant="success">
              <Clock className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              {tUi('m_c95815a044')}
              {generatedLabel}
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

// "Easy Fit · Altas": the pilot label, when the payload was computed, how far each source's
// data reaches ("Peaking: datos al 1-nov"), and a banner in words when a source is behind.

import type { EasyfitDashboardResponse, EasyfitSource } from '@continuum/contracts';
import { TriangleAlertIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Pill } from '@/components/kibo-ui/pill';
import { formatDay, formatTimestamp } from './dashboardFormat';
import { EASYFIT_TIME_ZONE } from './easyfitBrand';
import { useDashboardCopy } from './i18n/useDashboardLocale';
import { StatusChip } from './parts/StatusChip';

const SOURCE_ORDER: readonly EasyfitSource[] = ['poliwin', 'peaking', 'meta', 'google'];

export function DashboardHeader({
  meta,
  action,
}: {
  meta: EasyfitDashboardResponse['meta'];
  action?: ReactNode;
}) {
  const { locale, t } = useDashboardCopy();
  const late = new Set(meta.atrasadas);
  const lateNames = SOURCE_ORDER.filter((source) => late.has(source)).map(
    (source) => t.sources[source],
  );

  return (
    <header className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">{t.header.title}</h1>
        <Pill>{t.header.pilot}</Pill>
        <span className="text-xs text-muted-foreground" data-testid="dashboard-updated">
          {t.header.updated(formatTimestamp(meta.generated_at, locale, EASYFIT_TIME_ZONE))}
        </span>
        {action ? <span className="ms-auto">{action}</span> : null}
      </div>
      <ul aria-label={t.header.sourcesLabel} className="m-0 flex list-none flex-wrap gap-1.5 p-0">
        {SOURCE_ORDER.map((source) => {
          const day = meta.fuentes[source];
          if (!day) return null;
          return (
            <li key={source}>
              <StatusChip tone={late.has(source) ? 'warn' : 'neutral'}>
                {t.header.sourceAsOf(t.sources[source], formatDay(day, locale))}
              </StatusChip>
            </li>
          );
        })}
      </ul>
      {lateNames.length > 0 ? (
        <div
          className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm"
          data-testid="stale-banner"
          role="alert"
        >
          <TriangleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            <b>{t.header.staleTitle}.</b> {t.header.staleBody(lateNames.join(', '))}
          </span>
        </div>
      ) : null}
    </header>
  );
}

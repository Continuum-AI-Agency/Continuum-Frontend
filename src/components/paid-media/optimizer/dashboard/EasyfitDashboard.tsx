'use client';

// The Easy Fit "Dashboard" tab of Performance+: the pilot's sign-ups against floor and goal,
// then the cuts by campaign, offer, audience and branch (module package, docs/05). Pilot goals
// sit on top, detail below; nine sections behind a hash-backed sub-tab bar. The payload is
// read whole from GET /easyfit/dashboard; the pilot config (offers, plan) from
// GET /easyfit/config, which also feeds the edit panel for the roles that may write it.

import type { EasyfitDashboardPayload, EasyfitPilotConfig } from '@continuum/contracts';
import { PencilIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { EmptyState } from '@/components/shared/state/EmptyState';
import { ErrorRetryState } from '@/components/shared/state/ErrorRetryState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { ConfigPanel } from './ConfigPanel';
import { DashboardHeader } from './DashboardHeader';
import { chipThresholds, zonedDate } from './dashboardModel';
import { EASYFIT_TIME_ZONE } from './easyfitBrand';
import { useDashboardCopy } from './i18n/useDashboardLocale';
import { PALETTE_ROOT_CLASS } from './parts/palette';
import {
  DASHBOARD_SECTIONS,
  type DashboardSection,
  parseDashboardSection,
  useDashboardSection,
} from './useDashboardSection';
import {
  useCanEditEasyfitConfig,
  useEasyfitConfig,
  useEasyfitDashboard,
} from './useEasyfitDashboardData';
import { AltasMetaView } from './views/AltasMetaView';
import { AudienciasView } from './views/AudienciasView';
import { CampanasView } from './views/CampanasView';
import { EmbudoView } from './views/EmbudoView';
import { MedicionView } from './views/MedicionView';
import { OfertasView } from './views/OfertasView';
import { PilotoView } from './views/PilotoView';
import { PlanView } from './views/PlanView';
import { SucursalesView } from './views/SucursalesView';

function DashboardSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" className="space-y-4" role="status">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-7 w-64 rounded-md bg-muted/70" />
      <Skeleton className="h-9 w-full rounded-md bg-muted/70" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Skeleton className="h-52 rounded-lg bg-muted/70" />
        <Skeleton className="h-52 rounded-lg bg-muted/70" />
        <Skeleton className="h-52 rounded-lg bg-muted/70" />
      </div>
      <Skeleton className="h-64 rounded-lg bg-muted/70" />
    </div>
  );
}

function SectionBody({
  section,
  payload,
  asOfDate,
  config,
}: {
  section: DashboardSection;
  payload: EasyfitDashboardPayload;
  asOfDate: string;
  config: EasyfitPilotConfig | null;
}) {
  const thresholds = chipThresholds(config);
  switch (section) {
    case 'piloto':
      return <PilotoView asOfDate={asOfDate} config={config} payload={payload} />;
    case 'meta':
      return <AltasMetaView payload={payload} thresholds={thresholds} />;
    case 'embudo':
      return <EmbudoView payload={payload} thresholds={thresholds} />;
    case 'campanas':
      return <CampanasView payload={payload} thresholds={thresholds} />;
    case 'ofertas':
      return (
        <OfertasView offers={config?.ofertas ?? null} payload={payload} thresholds={thresholds} />
      );
    case 'audiencias':
      return <AudienciasView payload={payload} thresholds={thresholds} />;
    case 'sucursales':
      return <SucursalesView payload={payload} thresholds={thresholds} />;
    case 'medicion':
      return <MedicionView payload={payload} />;
    case 'plan':
      return <PlanView plan={config?.plan ?? null} />;
  }
}

export function EasyfitDashboard({ brandId }: { brandId: string }) {
  const { t } = useDashboardCopy();
  const dashboard = useEasyfitDashboard(brandId);
  const configQuery = useEasyfitConfig(brandId);
  const canEdit = useCanEditEasyfitConfig(brandId);
  const [section, setSection] = useDashboardSection();
  const [editing, setEditing] = useState(false);

  const shell = (children: ReactNode) => (
    <div className={cn('space-y-4 pb-6', PALETTE_ROOT_CLASS)} data-testid="easyfit-dashboard">
      {children}
    </div>
  );

  if (dashboard.isLoading) return shell(<DashboardSkeleton label={t.states.loading} />);

  if (!dashboard.data) {
    return shell(
      <ErrorRetryState
        message={t.states.errorBody}
        onRetry={() => void dashboard.refetch()}
        retryLabel={t.states.retry}
        title={t.states.errorTitle}
      />,
    );
  }

  const { payload, meta } = dashboard.data;
  const config = configQuery.data ?? null;
  const editAction =
    canEdit && config && !editing ? (
      <Button
        className="h-7 gap-1 px-2.5 text-xs"
        onClick={() => setEditing(true)}
        size="sm"
        type="button"
        variant="secondary"
      >
        <PencilIcon aria-hidden="true" className="size-3.5" />
        {t.config.open}
      </Button>
    ) : null;

  return shell(
    <>
      <DashboardHeader action={editAction} meta={meta} />
      {editing && config ? (
        <ConfigPanel brandId={brandId} config={config} onClose={() => setEditing(false)} />
      ) : null}
      {configQuery.isError ? (
        <p className="text-xs text-muted-foreground" role="status">
          {t.config.loadError}
        </p>
      ) : null}
      {payload ? (
        <>
          <Tabs
            onValueChange={(value) => setSection(parseDashboardSection(String(value)))}
            value={section}
          >
            <div className="max-w-full overflow-x-auto border-border/60 border-b">
              <TabsList aria-label={t.nav.label} className="h-9 gap-4 p-0" variant="line">
                {DASHBOARD_SECTIONS.map((key) => (
                  <TabsTrigger
                    className="h-9 flex-none px-0 text-xs group-data-horizontal/tabs:after:bottom-0"
                    key={key}
                    value={key}
                  >
                    {t.nav[key]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          </Tabs>
          <SectionBody
            asOfDate={zonedDate(payload.meta.actualizado, EASYFIT_TIME_ZONE)}
            config={config}
            payload={payload}
            section={section}
          />
          <footer className="text-xs text-muted-foreground">{t.footer}</footer>
        </>
      ) : (
        <EmptyState description={t.states.emptyBody} headline={t.states.emptyTitle} />
      )}
    </>,
  );
}

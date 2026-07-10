'use client';

import { ActivityLogIcon, ChevronLeftIcon, ChevronRightIcon } from '@radix-ui/react-icons';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PaidInsightsList } from '@/components/dashboard/briefing/PaidInsightsList';
import { PaidKpiSelect } from '@/components/dashboard/briefing/PaidKpiSelect';
import { PaidMetricStrip } from '@/components/dashboard/briefing/PaidMetricStrip';
import { PaidScopeToggle } from '@/components/dashboard/briefing/PaidScopeToggle';
import { CompetitorAdsTable } from '@/components/dashboard/competitor/CompetitorAdsTable';
import { DashboardWarmOnMount } from '@/components/dashboard/DashboardWarmOnMount';
import { SendPulseButton } from '@/components/dashboard/SendPulseButton';
import { Skeleton } from '@/components/ui/skeleton';
import { useAccountSelectionStore } from '@/lib/integrations/accountSelectionStore';
import { useDashboardPrefsStore } from '@/stores/dashboardPrefs';

const PAID_SELECTION_KEY = 'paid';

import { PendingActivityTabs } from '@/components/approvals/PendingActivityTabs';
import { PaidEntityTable } from '@/components/dashboard/briefing/PaidEntityTable';
import { DCOActionsWidget } from '@/components/dashboard/DCOActionsWidget';
import type { PaidPerformanceMetricKey } from '@/components/paid-media/PaidMediaReportingWidget';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const HOVER_CHARGE_MS = 800;

const PaidMediaReportingWidget = dynamic(
  () =>
    import('@/components/paid-media/PaidMediaReportingWidget').then((m) => ({
      default: m.PaidMediaReportingWidget,
    })),
  {
    ssr: false,
    loading: () => <Skeleton className="h-96 w-full rounded-lg" />,
  },
);

const BudgetPacingWidget = dynamic(
  () =>
    import('@/components/paid-media/budget-pacing/BudgetPacingWidget').then((m) => ({
      default: m.BudgetPacingWidget,
    })),
  {
    ssr: false,
    loading: () => <Skeleton className="h-64 w-full rounded-lg" />,
  },
);

type PaidDashboardViewProps = {
  brandId: string;
};

const RAIL_COLLAPSE_STORAGE_KEY = 'dashboard.paid.rail.collapsed';
const RAIL_WIDTH_PX = 360;
const STRIP_WIDTH_PX = 36;

const JELLY_SPRING = {
  type: 'spring' as const,
  stiffness: 380,
  damping: 22,
  mass: 0.85,
};
const STRIP_SPRING = {
  type: 'spring' as const,
  stiffness: 320,
  damping: 26,
  mass: 0.7,
};

function readCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(RAIL_COLLAPSE_STORAGE_KEY) === '1';
}

function writeCollapsed(value: boolean): void {
  if (typeof window === 'undefined') return;
  if (value) window.localStorage.setItem(RAIL_COLLAPSE_STORAGE_KEY, '1');
  else window.localStorage.removeItem(RAIL_COLLAPSE_STORAGE_KEY);
}

function DCORailStrip({ onExpand }: { onExpand: () => void }) {
  const reduceMotion = useReducedMotion();
  const [charging, setCharging] = useState(false);
  const timerRef = useRef<number | null>(null);

  const clearCharge = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setCharging(false);
  }, []);

  useEffect(() => () => clearCharge(), [clearCharge]);

  const handlePointerEnter = useCallback(() => {
    if (reduceMotion) return;
    setCharging(true);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setCharging(false);
      onExpand();
    }, HOVER_CHARGE_MS);
  }, [onExpand, reduceMotion]);

  const handlePointerLeave = useCallback(() => {
    clearCharge();
  }, [clearCharge]);

  return (
    <TooltipProvider>
      <div
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onFocusCapture={handlePointerEnter}
        onBlurCapture={handlePointerLeave}
        className="relative flex h-full w-9 flex-col items-center gap-1 overflow-hidden rounded-lg border border-border/70 bg-card py-1.5"
      >
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 origin-bottom bg-gradient-to-t from-primary/45 via-primary/25 to-primary/5"
          initial={false}
          animate={{ scaleY: charging ? 1 : 0 }}
          transition={{
            duration: charging ? HOVER_CHARGE_MS / 1000 : 0.18,
            ease: charging ? 'linear' : [0.4, 0, 1, 1],
          }}
          style={{ height: '100%' }}
        />
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-inset ring-primary/0"
          initial={false}
          animate={{
            boxShadow: charging
              ? 'inset 0 0 0 1px var(--color-primary)'
              : 'inset 0 0 0 0 transparent',
          }}
          transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => {
                clearCharge();
                onExpand();
              }}
              aria-label="Open DCO actions"
              className="relative z-10 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground active:scale-[0.96] after:absolute after:inset-0 after:-m-2 after:content-['']"
              style={{ transitionProperty: 'background-color, color, scale' }}
            >
              <ChevronLeftIcon className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">Open DCO actions (or hover)</TooltipContent>
        </Tooltip>
        <div className="z-10 my-1 h-px w-5 bg-border/70" aria-hidden="true" />
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => {
                clearCharge();
                onExpand();
              }}
              aria-label="Show DCO actions"
              className="relative z-10 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground active:scale-[0.96] after:absolute after:inset-0 after:-m-2 after:content-['']"
              style={{ transitionProperty: 'background-color, color, scale' }}
            >
              <ActivityLogIcon className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">DCO actions</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

function DCORailCollapseButton({ onCollapse }: { onCollapse: () => void }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Hide DCO actions"
            className="absolute right-1.5 top-1.5 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-border/70 bg-background/90 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-accent hover:text-foreground active:scale-[0.96]"
            style={{ transitionProperty: 'background-color, color, scale' }}
          >
            <ChevronRightIcon className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">Hide DCO actions</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function PaidDashboardView({ brandId }: PaidDashboardViewProps) {
  const paidScope = useDashboardPrefsStore((store) => store.paidScope);
  const setSelection = useAccountSelectionStore((store) => store.setSelection);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(() =>
    useAccountSelectionStore.getState().getSelection(brandId, PAID_SELECTION_KEY),
  );
  const [selectedMetric, setSelectedMetric] = useState<PaidPerformanceMetricKey>('spend');
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    setCollapsed(readCollapsed());
  }, []);

  // Remember the last ad account this brand looked at (shared store, same as
  // organic) so it is restored on the next visit instead of re-defaulting.
  const handleAccountChange = useCallback(
    (id: string) => {
      setSelectedAccountId(id);
      setSelection(brandId, PAID_SELECTION_KEY, id);
    },
    [brandId, setSelection],
  );

  const handleCollapse = useCallback(() => {
    setCollapsed(true);
    writeCollapsed(true);
  }, []);

  const handleExpand = useCallback(() => {
    setCollapsed(false);
    writeCollapsed(false);
  }, []);

  const reportingArea = (
    <div className="flex flex-col gap-[var(--app-shell-gap)]">
      <div className="min-w-0">
        <PaidMediaReportingWidget
          brandId={brandId}
          accountId={selectedAccountId ?? undefined}
          onAccountChange={handleAccountChange}
          selectedMetric={selectedMetric}
          onSelectedMetricChange={setSelectedMetric}
        />
      </div>
      <div className="min-w-0 min-h-[var(--dashboard-compact-panel-min-height)] overflow-hidden rounded-lg border bg-card">
        <BudgetPacingWidget
          brandId={brandId}
          selectedAccountId={selectedAccountId}
          selectedMetric={selectedMetric}
        />
      </div>
    </div>
  );

  const dispatchResize = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new Event('resize'));
  }, []);

  return (
    <div className="flex min-w-0 flex-col gap-[var(--app-shell-gap)]">
      <DashboardWarmOnMount brandId={brandId} isCold={false} />
      <section className="flex min-w-0 flex-col gap-[var(--dashboard-section-gap)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-foreground">Overview</h2>
            <p className="text-xs text-muted-foreground">
              Your paid performance at a glance. Pick your next move.
            </p>
          </div>
          <SendPulseButton brandId={brandId} />
        </div>
        <PaidMetricStrip brandId={brandId} adAccountId={selectedAccountId} />
        <div
          data-tour-id="dashboard-top-ads"
          className="grid grid-cols-1 items-start gap-[var(--dashboard-section-gap)] lg:grid-cols-2 lg:[&>*]:min-h-[var(--dashboard-min-panel-height)]"
        >
          <div className="flex min-w-0 flex-col gap-[var(--dashboard-section-gap)]">
            <div className="flex items-center justify-between gap-2">
              <PaidScopeToggle />
              <PaidKpiSelect />
            </div>
            <PaidEntityTable
              brandId={brandId}
              adAccountId={selectedAccountId}
              scope={paidScope}
              title={paidScope === 'top_adsets' ? 'Top ad sets' : 'Top campaigns'}
              emptyMessage={
                paidScope === 'top_adsets'
                  ? 'No ad set performance yet for this account.'
                  : 'No campaign performance yet for this account.'
              }
            />
          </div>
          <PaidInsightsList brandId={brandId} adAccountId={selectedAccountId} />
        </div>
        <CompetitorAdsTable brandId={brandId} />
      </section>

      <div className="grid min-h-[var(--dashboard-reporting-min-height)] grid-cols-[minmax(0,1fr)_auto] gap-[var(--app-shell-gap)]">
        <div className="min-w-0">{reportingArea}</div>

        <AnimatePresence initial={false} mode="wait" onExitComplete={dispatchResize}>
          {collapsed ? (
            <motion.div
              key="dco-strip"
              initial={reduceMotion ? false : { opacity: 0, scale: 0.96, x: 8 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={
                reduceMotion
                  ? { opacity: 0 }
                  : {
                      opacity: 0,
                      scale: 0.96,
                      x: 8,
                      transition: { duration: 0.16, ease: [0.4, 0, 1, 1] },
                    }
              }
              transition={STRIP_SPRING}
              style={{
                transformOrigin: 'right center',
                overflow: 'hidden',
                width: STRIP_WIDTH_PX,
              }}
              onAnimationComplete={dispatchResize}
            >
              <div style={{ width: STRIP_WIDTH_PX }} className="h-full">
                <DCORailStrip onExpand={handleExpand} />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="dco-rail"
              initial={reduceMotion ? false : { opacity: 0, scale: 0.98, x: 12 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={
                reduceMotion
                  ? { opacity: 0 }
                  : {
                      opacity: 0,
                      scale: 0.98,
                      x: 12,
                      transition: { duration: 0.18, ease: [0.4, 0, 1, 1] },
                    }
              }
              transition={JELLY_SPRING}
              style={{
                transformOrigin: 'right center',
                overflow: 'hidden',
                width: RAIL_WIDTH_PX,
              }}
              onAnimationComplete={dispatchResize}
            >
              <div style={{ width: RAIL_WIDTH_PX }} className="relative h-full">
                <PendingActivityTabs
                  brandId={brandId}
                  variant="rail"
                  className="h-full"
                  activityContent={
                    <DCOActionsWidget brandId={brandId} variant="rail" className="h-full" />
                  }
                />
                <DCORailCollapseButton onCollapse={handleCollapse} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

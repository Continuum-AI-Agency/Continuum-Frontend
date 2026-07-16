'use client';

import { ReactFlowProvider } from '@xyflow/react';
import { Maximize2, Minimize2, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { type AdAccount, AdAccountSelector } from '@/components/paid-media/AdAccountSelector';
import {
  useOptimizerAdAccounts,
  usePrefetchOptimizerOverview,
} from '@/components/paid-media/optimizer/useOptimizerData';
import { PaidSetupDiagnostics } from '@/components/paid-media/PaidSetupDiagnostics';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSession } from '@/hooks/useSession';
import type { PaidMediaPlatform } from '@/lib/paid-media/performance-types';
import { prefetchPaidMediaDashboard } from '@/lib/prefetch/paid-media-cache';
import { cn } from '@/lib/utils';

const PAID_MEDIA_TABS = ['dashboard', 'performance', 'jaina'] as const;
type PaidMediaTab = (typeof PAID_MEDIA_TABS)[number];

function normalizePaidMediaTab(value: string | null): PaidMediaTab | null {
  if (value === 'budget') return 'performance';
  return PAID_MEDIA_TABS.some((tab) => tab === value) ? (value as PaidMediaTab) : null;
}

const CampaignCanvas = dynamic(
  () => import('@/CampaignCanvas/components/CampaignCanvas').then((mod) => mod.CampaignCanvas),
  { ssr: false },
);

function DashboardSkeleton() {
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2 p-2">
      <div className="flex items-center justify-end gap-2">
        <Skeleton className="h-8 w-28 rounded-md" />
        <Skeleton className="h-8 w-32 rounded-md" />
        <Skeleton className="h-8 w-20 rounded-md" />
      </div>
      <div className="@container/paid-skeleton min-h-0">
        <div className="grid h-full min-h-0 gap-2 @[60rem]/paid-skeleton:grid-cols-[minmax(0,1fr)_clamp(16rem,22cqi,22rem)]">
          <Skeleton className="min-h-0 rounded-xl" />
          <Skeleton className="min-h-0 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

function JainaSkeleton() {
  return (
    <div className="flex flex-col h-full">
      <Skeleton className="flex-1 m-4 rounded-xl" />
      <Skeleton className="h-12 m-4 rounded-lg" />
    </div>
  );
}

function OptimizerSurfaceSkeleton() {
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-border/70 bg-background">
      <div className="flex items-center justify-between border-border/70 border-b px-4 py-3">
        <Skeleton className="h-5 w-28 rounded-md" />
        <Skeleton className="h-8 w-72 rounded-md" />
      </div>
      <div className="min-h-0 space-y-3 overflow-hidden p-3">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
        </div>
        <Skeleton className="h-[min(20rem,45vh)] rounded-lg" />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Skeleton className="h-36 rounded-lg" />
          <Skeleton className="h-36 rounded-lg" />
          <Skeleton className="h-36 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

const PaidMediaDashboard = dynamic(
  () =>
    import('@/components/paid-media/dashboard/PaidMediaDashboard').then(
      (mod) => mod.PaidMediaDashboard,
    ),
  { ssr: false, loading: () => <DashboardSkeleton /> },
);

const JainaChatSurface = dynamic(
  () =>
    import('@/components/paid-media/jaina/JainaChatSurface').then((mod) => mod.JainaChatSurface),
  { ssr: false, loading: () => <JainaSkeleton /> },
);

const ReportJobsBell = dynamic(
  () =>
    import('@/components/paid-media/jaina/components/ReportJobsBell').then(
      (mod) => mod.ReportJobsBell,
    ),
  { ssr: false },
);

// The "performance" tab slot now hosts the Paid Media Optimizer surface. The
// legacy CampaignPerformanceTab component is preserved on disk (see risks note
// for where it should be re-surfaced) but is no longer wired into this slot.
const OptimizerTab = dynamic(
  () => import('@/components/paid-media/optimizer/OptimizerTab').then((mod) => mod.OptimizerTab),
  { ssr: false, loading: () => <OptimizerSurfaceSkeleton /> },
);

type PaidMediaClientPageProps = {
  brandProfileId: string;
  brandName: string;
  initialAccounts?: AdAccount[];
  initialAdAccountId?: string | null;
};

type PaidMediaAccountContext = {
  brandProfileId: string;
  selectedAdAccount: string | null;
};

export default function PaidMediaClientPage({
  brandProfileId,
  brandName,
  initialAccounts,
  initialAdAccountId,
}: PaidMediaClientPageProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get('tab');
  const normalizedTabParam = normalizePaidMediaTab(tabParam);
  const { user } = useSession();
  const [, startTabTransition] = React.useTransition();

  const [accountContext, setAccountContext] = React.useState<PaidMediaAccountContext>(() => ({
    brandProfileId,
    selectedAdAccount: initialAdAccountId ?? null,
  }));
  const isBrandContextTransition = accountContext.brandProfileId !== brandProfileId;
  const selectedAdAccount = isBrandContextTransition ? null : accountContext.selectedAdAccount;
  const setSelectedAdAccount = React.useCallback(
    (adAccountId: string | null) => {
      setAccountContext((current) => {
        if (current.brandProfileId !== brandProfileId) return current;
        if (current.selectedAdAccount === adAccountId) return current;
        return { ...current, selectedAdAccount: adAccountId };
      });
    },
    [brandProfileId],
  );
  const [platform, setPlatform] = React.useState<PaidMediaPlatform>('meta');
  const [selectedCampaign, setSelectedCampaign] = React.useState<string | null>(null);
  const prefetchOptimizerOverview = usePrefetchOptimizerOverview(brandProfileId, selectedAdAccount);

  // The optimizer admits only ad accounts ASSIGNED to this brand
  // (plugin_mcp.list_brand_ad_accounts). Scope the picker to that exact set so it
  // can never offer an account the optimizer rejects with "isn't linked to this
  // brand". That RPC covers meta + google only — LinkedIn stays unfiltered. While
  // the query loads or errors we pass undefined so the selector shows everything
  // (an outage must never dead-end the picker).
  const optimizerAccounts = useOptimizerAdAccounts(brandProfileId);
  const assignedAccountIds = React.useMemo(() => {
    if (platform !== 'meta' && platform !== 'google-ads') return undefined;
    if (!optimizerAccounts.isSuccess) return undefined;
    return optimizerAccounts.data.map((account) => account.account_id);
  }, [platform, optimizerAccounts.isSuccess, optimizerAccounts.data]);

  // Switching ad platform clears the account so the selector auto-picks one for it.
  const handlePlatformChange = React.useCallback(
    (next: PaidMediaPlatform) => {
      setPlatform(next);
      setSelectedAdAccount(null);
    },
    [setSelectedAdAccount],
  );
  const [activeTab, setActiveTab] = React.useState<PaidMediaTab>(normalizedTabParam ?? 'dashboard');
  const [isCanvasOpen, setIsCanvasOpen] = React.useState(false);
  const [isJainaFullscreen, setIsJainaFullscreen] = React.useState(false);
  const [canvasWidthPx, setCanvasWidthPx] = React.useState(540);
  const [isResizingCanvas, setIsResizingCanvas] = React.useState(false);
  const canvasShellRef = React.useRef<HTMLDivElement | null>(null);

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Reset brand-dependent state when server re-renders with a new brand
  // biome-ignore lint/correctness/useExhaustiveDependencies: brandProfileId is the intended trigger — this reset must re-run when the active brand changes, not only when initialAdAccountId does.
  React.useEffect(() => {
    setAccountContext((current) => {
      const nextAdAccount = initialAdAccountId ?? null;
      if (
        current.brandProfileId === brandProfileId &&
        current.selectedAdAccount === nextAdAccount
      ) {
        return current;
      }
      return {
        brandProfileId,
        selectedAdAccount: nextAdAccount,
      };
    });
    setSelectedCampaign(null);
    setPlatform('meta');
  }, [brandProfileId, initialAdAccountId]);

  React.useEffect(() => {
    if (normalizedTabParam) {
      setActiveTab((current) => (current === normalizedTabParam ? current : normalizedTabParam));
    }
  }, [normalizedTabParam]);

  const handleTabChange = (value: string) => {
    const normalizedTab = normalizePaidMediaTab(value);
    if (!normalizedTab) return;
    setActiveTab(normalizedTab);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', normalizedTab);
    startTabTransition(() => {
      router.replace(`?${params.toString()}`, { scroll: false });
    });
  };

  // Prefetch dashboard data while user is on Jaina tab so data is warm on switch-back
  React.useEffect(() => {
    if (activeTab !== 'jaina' || !selectedAdAccount) return;
    const idleHandle =
      typeof requestIdleCallback === 'function'
        ? requestIdleCallback(() =>
            prefetchPaidMediaDashboard({ brandId: brandProfileId, adAccountId: selectedAdAccount }),
          )
        : setTimeout(
            () =>
              prefetchPaidMediaDashboard({
                brandId: brandProfileId,
                adAccountId: selectedAdAccount,
              }),
            2000,
          );
    return () => {
      if (typeof cancelIdleCallback === 'function') {
        cancelIdleCallback(idleHandle as number);
      } else {
        clearTimeout(idleHandle as ReturnType<typeof setTimeout>);
      }
    };
  }, [activeTab, brandProfileId, selectedAdAccount]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: selectedAdAccount is the intended trigger — the selected campaign is cleared whenever the ad account changes.
  React.useEffect(() => {
    setSelectedCampaign(null);
  }, [selectedAdAccount]);

  const handleToggleCanvas = React.useCallback(() => {
    setIsCanvasOpen((previous) => !previous);
  }, []);

  React.useEffect(() => {
    if (activeTab !== 'jaina') setIsJainaFullscreen(false);
  }, [activeTab]);

  const handleCanvasActionApplied = React.useCallback(() => {
    setIsCanvasOpen(true);
  }, []);

  const getCanvasWidthLimits = React.useCallback(() => {
    const shellWidth = canvasShellRef.current?.clientWidth ?? 1200;
    const min = Math.max(320, Math.floor(shellWidth * 0.25));
    const max = Math.max(min, Math.floor(shellWidth * 0.7));
    return { min, max };
  }, []);

  const clampCanvasWidth = React.useCallback(
    (value: number) => {
      const { min, max } = getCanvasWidthLimits();
      return Math.max(min, Math.min(max, value));
    },
    [getCanvasWidthLimits],
  );

  const handleCanvasResizeStart = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isCanvasOpen) return;
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = canvasWidthPx;

      setIsResizingCanvas(true);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const deltaX = moveEvent.clientX - startX;
        const nextWidth = clampCanvasWidth(startWidth - deltaX);
        setCanvasWidthPx(nextWidth);
      };

      const handlePointerUp = () => {
        setIsResizingCanvas(false);
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    },
    [canvasWidthPx, clampCanvasWidth, isCanvasOpen],
  );

  React.useEffect(() => {
    const updateWidth = () => {
      setCanvasWidthPx((current) => clampCanvasWidth(current));
    };
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [clampCanvasWidth]);

  const hasSeededCanvasWidth = React.useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: activeTab is the intended trigger — the canvas shell re-mounts per tab, so the observer must re-attach and re-seed its width when the tab changes.
  React.useEffect(() => {
    const shell = canvasShellRef.current;
    if (!shell || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const parentWidth = entry.contentRect.width;
      if (parentWidth <= 0) return;
      if (!hasSeededCanvasWidth.current) {
        hasSeededCanvasWidth.current = true;
        const seeded = Math.min(Math.max(parentWidth * 0.4, 320), 560);
        setCanvasWidthPx(clampCanvasWidth(seeded));
      } else {
        setCanvasWidthPx((current) => clampCanvasWidth(current));
      }
    });
    observer.observe(shell);
    return () => observer.disconnect();
  }, [clampCanvasWidth, activeTab]);

  // When no ad account is selected the paid surfaces have nothing to render, so
  // we replace the empty dashboard/optimization panels with an actionable setup
  // path instead of blank charts (IMP-010 / BUG-003 / BUG-004). Jaina keeps its
  // own concierge inside JainaChatSurface.
  const renderBlockedState = () => (
    <div className="flex h-full min-h-0 items-center justify-center overflow-y-auto p-4">
      <PaidSetupDiagnostics
        brandId={brandProfileId}
        platform={platform}
        onPlatformChange={handlePlatformChange}
        heading="Connect an ad account to unlock Scale"
        description="Scale reads your campaigns to show pacing, DCO actions, and performance. Finish the steps below to get started."
      />
    </div>
  );

  if (!mounted) {
    return (
      <div className="box-border grid h-full min-h-0 w-full max-w-none grid-rows-[auto_auto_minmax(0,1fr)] gap-2 overflow-hidden px-0 py-2">
        <Skeleton className="h-9 w-[min(20rem,50vw)] rounded-md" />
        <div className="rounded-lg border bg-card px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-8 w-[min(18rem,45vw)] rounded-md" />
            <Skeleton className="h-8 w-[min(22rem,48vw)] rounded-md" />
          </div>
        </div>
        <div className="min-h-0 rounded-xl border bg-card p-3">
          <Skeleton className="h-full min-h-0 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (isBrandContextTransition) {
    return (
      <div
        role="status"
        aria-label="Switching Scale brand context"
        className="box-border grid h-full min-h-0 w-full max-w-none grid-rows-[auto_auto_minmax(0,1fr)] gap-2 overflow-hidden px-0 py-2"
      >
        <span className="sr-only">Switching Scale to {brandName}</span>
        <Skeleton className="h-9 w-[min(20rem,50vw)] rounded-md" />
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-full min-h-0 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="@container/paid box-border h-full min-h-0 w-full max-w-none overflow-hidden px-0 py-1">
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-[var(--app-shell-gap)] overflow-hidden"
      >
        <PageHeader
          title="Scale"
          description="Paid media command center — connect and assign an ad account to unlock campaign pacing, DCO actions, and Jaina."
          className="px-[var(--app-shell-pad-inline)]"
        />

        <div className="flex min-h-9 flex-wrap items-center justify-between gap-[var(--app-shell-gap)] rounded-lg border border-border/70 bg-muted/10 px-[var(--app-shell-pad-inline)] py-[var(--app-shell-pad-block)]">
          <div data-tour-id="paid-account-selector" className="inline-flex">
            <AdAccountSelector
              brandId={brandProfileId}
              platform={platform}
              selectedAccountId={selectedAdAccount}
              onSelect={setSelectedAdAccount}
              initialTimelineAccounts={initialAccounts}
              assignedAccountIds={assignedAccountIds}
            />
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            <ReportJobsBell brandProfileId={brandProfileId} />
            {activeTab === 'jaina' ? (
              <>
                <Button
                  type="button"
                  variant={isCanvasOpen ? 'outline' : 'secondary'}
                  size="sm"
                  onClick={handleToggleCanvas}
                  className="h-8 gap-1.5 px-2 text-xs"
                  aria-pressed={isCanvasOpen}
                >
                  {isCanvasOpen ? (
                    <PanelRightClose className="size-3.5" />
                  ) : (
                    <PanelRightOpen className="size-3.5" />
                  )}
                  {isCanvasOpen ? 'Hide canvas' : 'Canvas'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsJainaFullscreen((v) => !v)}
                  className="h-8 w-8 p-0"
                  aria-label={isJainaFullscreen ? 'Exit full screen' : 'Full screen'}
                  aria-pressed={isJainaFullscreen}
                >
                  {isJainaFullscreen ? (
                    <Minimize2 className="size-3.5" />
                  ) : (
                    <Maximize2 className="size-3.5" />
                  )}
                </Button>
              </>
            ) : null}
            <TabsList className="h-8">
              <TabsTrigger
                value="dashboard"
                className="px-3 text-xs"
                onMouseEnter={() => {
                  void import('@/components/paid-media/dashboard/PaidMediaDashboard');
                }}
                onFocus={() => {
                  void import('@/components/paid-media/dashboard/PaidMediaDashboard');
                }}
              >
                Dashboard
              </TabsTrigger>
              <TabsTrigger
                value="performance"
                className="px-3 text-xs"
                onMouseEnter={() => {
                  void import('@/components/paid-media/optimizer/OptimizerTab');
                  prefetchOptimizerOverview();
                }}
                onFocus={() => {
                  void import('@/components/paid-media/optimizer/OptimizerTab');
                  prefetchOptimizerOverview();
                }}
              >
                Optimization
              </TabsTrigger>
              <TabsTrigger
                value="jaina"
                data-tour-id="paid-jaina-tab"
                className="px-3 text-xs"
                onMouseEnter={() => {
                  void import('@/components/paid-media/jaina/JainaChatSurface');
                }}
                onFocus={() => {
                  void import('@/components/paid-media/jaina/JainaChatSurface');
                }}
              >
                Jaina
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        <TabsContent value="dashboard" className="box-border min-h-0 overflow-hidden">
          {selectedAdAccount ? (
            <PaidMediaDashboard
              brandId={brandProfileId}
              adAccountId={selectedAdAccount}
              platform={platform}
              onPlatformChange={handlePlatformChange}
            />
          ) : (
            renderBlockedState()
          )}
        </TabsContent>

        <TabsContent value="performance" className="box-border min-h-0 overflow-hidden">
          {selectedAdAccount ? (
            <OptimizerTab
              brandId={brandProfileId}
              adAccountId={selectedAdAccount}
              platform={platform}
            />
          ) : (
            renderBlockedState()
          )}
        </TabsContent>

        <TabsContent value="jaina" className="box-border flex min-h-0 flex-col overflow-hidden">
          <div
            ref={canvasShellRef}
            className={cn(
              'relative flex flex-1 min-h-0 overflow-hidden rounded-lg border bg-background/70',
              isJainaFullscreen && 'fixed inset-0 z-50 rounded-none border-none',
            )}
          >
            <div className="min-h-0 min-w-0 flex-1">
              <JainaChatSurface
                brandProfileId={brandProfileId}
                brandName={brandName}
                adAccountId={selectedAdAccount}
                campaignId={selectedCampaign}
                userId={user?.id ?? null}
                onCanvasActionApplied={handleCanvasActionApplied}
                className="rounded-none border-none bg-transparent backdrop-blur-none"
              />
            </div>

            <AnimatePresence initial={false}>
              {isCanvasOpen ? (
                <>
                  <motion.div
                    key="canvas-handle"
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize campaign canvas"
                    className="z-30 w-2 shrink-0 cursor-col-resize bg-border/70 transition-colors hover:bg-primary/50"
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 28, mass: 0.8 }}
                    onPointerDown={handleCanvasResizeStart}
                  />
                  <motion.aside
                    key="canvas-panel"
                    className="relative min-h-0 shrink-0 overflow-hidden border-l border-border/70 bg-background/80"
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 24 }}
                    transition={{ type: 'spring', stiffness: 240, damping: 26, mass: 0.85 }}
                    style={{
                      width: canvasWidthPx,
                      boxShadow: isResizingCanvas
                        ? 'inset 0 0 0 1px hsl(var(--primary) / 0.35)'
                        : undefined,
                    }}
                  >
                    <motion.div
                      className="absolute inset-0 p-0.5"
                      initial={{ opacity: 0.6 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ReactFlowProvider>
                        <CampaignCanvas />
                      </ReactFlowProvider>
                    </motion.div>
                  </motion.aside>
                </>
              ) : null}
            </AnimatePresence>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

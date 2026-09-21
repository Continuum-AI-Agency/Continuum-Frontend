'use client';

import { ReactFlowProvider } from '@xyflow/react';
import { Maximize2, Minimize2, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { type AdAccount, AdAccountSelector } from '@/components/paid-media/AdAccountSelector';
import { SavedDashboardsPanel } from '@/components/paid-media/jaina/components/SavedDashboardsPanel';
import {
  useOptimizerAdAccounts,
  usePrefetchOptimizerOverview,
} from '@/components/paid-media/optimizer/useOptimizerData';
import { useOptimizerUrlState } from '@/components/paid-media/optimizer/useOptimizerUrlState';
import { PaidSetupDiagnostics } from '@/components/paid-media/PaidSetupDiagnostics';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSession } from '@/hooks/useSession';
import type { AutomationDeploymentEnvironment } from '@/lib/automations/access';
import { isAdminUser } from '@/lib/brands/brand-switcher-utils';
import { canAccessGoals } from '@/lib/goals/access';
import { JainaBrandScopeProvider } from '@/lib/jaina/brandScope';
import type { PaidMediaPlatform } from '@/lib/paid-media/performance-types';
import { prefetchPaidMediaDashboard } from '@/lib/prefetch/paid-media-cache';
import { cn } from '@/lib/utils';

const PAID_MEDIA_TABS = ['dashboard', 'performance', 'jaina'] as const;
type PaidMediaTab = (typeof PAID_MEDIA_TABS)[number];

function normalizePaidMediaTab(value: string | null): PaidMediaTab | null {
  if (value === 'budget') return 'performance';
  return PAID_MEDIA_TABS.some((tab) => tab === value) ? (value as PaidMediaTab) : null;
}

const OpenAiCampaignBar = dynamic(
  () =>
    import('@/CampaignCanvas/components/OpenAiCampaignBar').then((mod) => mod.OpenAiCampaignBar),
  { ssr: false },
);

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

// The win-rate explorer is a pop-out, not a tab: it needs full height, and the
// dashboard keeps only the compact kill/scale/iterate calls.
const WhatsWorkingExplorerPopover = dynamic(
  () =>
    import('@/components/paid-media/dashboard/whats-working/WhatsWorkingExplorerPopover').then(
      (mod) => mod.WhatsWorkingExplorerPopover,
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
  deploymentEnvironment?: AutomationDeploymentEnvironment;
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
  deploymentEnvironment = 'production',
}: PaidMediaClientPageProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get('tab');
  const normalizedTabParam = normalizePaidMediaTab(tabParam);
  // Deep link from completion toasts (/scale?tab=jaina&sessionId=...): a session id
  // implies the Jaina tab even when the tab param is missing or invalid.
  const jainaSessionIdParam = searchParams.get('sessionId');
  // Deep link with a question already written (/scale?tab=jaina&prompt=...): the Optimizer's
  // "Ask Jaina" chips, "Explore options with Jaina" and a dashboard's refresh all land here.
  // A slash-prefixed prompt is a Goal command, not chat input, and is left alone.
  const jainaPromptParam = searchParams.get('prompt');
  const jainaInitialPrompt =
    jainaPromptParam && jainaPromptParam.trim().length > 0 && !jainaPromptParam.startsWith('/')
      ? jainaPromptParam
      : null;
  const clearJainaPrompt = React.useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (!params.has('prompt')) return;
    params.delete('prompt');
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);
  const { user } = useSession();
  const goalsAccessEnabled = canAccessGoals({
    isAdmin: isAdminUser(user),
    environment: deploymentEnvironment,
  });
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
  const [activeTab, setActiveTab] = React.useState<PaidMediaTab>(
    normalizedTabParam ?? (jainaSessionIdParam || jainaInitialPrompt ? 'jaina' : 'dashboard'),
  );
  const [isCanvasOpen, setIsCanvasOpen] = React.useState(false);
  // The ads-manager panel on the Dashboard tab. Separate from `isCanvasOpen`, which is
  // Jaina's canvas: the two tabs open the same canvas for different reasons and closing
  // one must not close the other.
  const [isAdsManagerOpen, setIsAdsManagerOpen] = React.useState(false);
  const adsManagerShellRef = React.useRef<HTMLDivElement | null>(null);
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

  // A cited optimizer figure in a Jaina answer opens the read it was taken from. Two pieces of
  // state have to move together for that to land anywhere: the paid-media tab, which is React
  // state on this shell, and where inside the optimizer to arrive, which is URL state the
  // optimizer already owns. Stable identity matters — `JainaMessageItem` is memoized, and a new
  // function each render would put every finished message back into each streaming frame.
  const { openAccountRead } = useOptimizerUrlState();
  const handleOpenAccountRead = React.useCallback(() => {
    setActiveTab('performance');
    openAccountRead();
  }, [openAccountRead]);

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

  const handleCreateNewCampaign = React.useCallback(async () => {
    // Imported here rather than at module scope so the canvas store (and React Flow with
    // it) stays out of the Dashboard bundle until someone actually opens the builder.
    const { useCampaignStore } = await import('@/CampaignCanvas/stores/useCampaignStore');
    useCampaignStore.getState().startOpenAiDraft();
    setIsAdsManagerOpen(true);
  }, []);

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
            {platform === 'meta' && selectedAdAccount ? (
              <WhatsWorkingExplorerPopover brandId={brandProfileId} />
            ) : null}
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

        <TabsContent value="dashboard" className="box-border flex min-h-0 flex-col overflow-hidden">
          {/* A saved dashboard is something you READ, so it belongs with the numbers rather
           *  than inside the chat that happened to produce it. Jaina is the conversation; what
           *  the conversation left behind lives here. The panel reads the Jaina brand scope, so
           *  it brings that provider with it. */}
          {/* shrink-0: the panel bounds its own height, so it must not also be squeezed to
           *  nothing by the ads manager's flex-1 below it. */}
          <div className="shrink-0">
            <JainaBrandScopeProvider adAccountId={selectedAdAccount} brandId={brandProfileId}>
              <SavedDashboardsPanel />
            </JainaBrandScopeProvider>
          </div>
          <div ref={adsManagerShellRef} className="relative flex min-h-0 flex-1 overflow-hidden">
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
              {selectedAdAccount ? (
                <PaidMediaDashboard
                  brandId={brandProfileId}
                  adAccountId={selectedAdAccount}
                  platform={platform}
                  onPlatformChange={handlePlatformChange}
                  onCreateNewCampaign={handleCreateNewCampaign}
                />
              ) : (
                renderBlockedState()
              )}
            </div>

            <AnimatePresence initial={false}>
              {isAdsManagerOpen ? (
                <>
                  <motion.div
                    key="ads-manager-handle"
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize ads manager"
                    className="z-30 w-2 shrink-0 cursor-col-resize bg-border/70 transition-colors hover:bg-primary/50"
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 28, mass: 0.8 }}
                    onPointerDown={handleCanvasResizeStart}
                  />
                  <motion.aside
                    key="ads-manager-panel"
                    className="relative min-h-0 shrink-0 overflow-hidden border-l border-border/70 bg-background/80"
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 24 }}
                    transition={{ type: 'spring', stiffness: 240, damping: 26, mass: 0.85 }}
                    style={{ width: canvasWidthPx }}
                  >
                    <div className="flex h-full min-h-0 flex-col">
                      <div className="flex items-center justify-between gap-2 border-b px-2 py-1.5">
                        <OpenAiCampaignBar
                          brandId={brandProfileId}
                          adAccountId={selectedAdAccount}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          aria-label="Close ads manager"
                          onClick={() => setIsAdsManagerOpen(false)}
                        >
                          <PanelRightClose className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="relative min-h-0 flex-1">
                        <ReactFlowProvider>
                          <CampaignCanvas />
                        </ReactFlowProvider>
                      </div>
                    </div>
                  </motion.aside>
                </>
              ) : null}
            </AnimatePresence>
          </div>
        </TabsContent>

        <TabsContent value="performance" className="box-border min-h-0 overflow-hidden">
          {selectedAdAccount ? (
            <OptimizerTab
              brandId={brandProfileId}
              adAccountId={selectedAdAccount}
              platform={platform}
              onSelectAdAccount={setSelectedAdAccount}
            />
          ) : (
            renderBlockedState()
          )}
        </TabsContent>

        <TabsContent value="jaina" className="box-border flex min-h-0 flex-col overflow-hidden">
          <JainaBrandScopeProvider adAccountId={selectedAdAccount} brandId={brandProfileId}>
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
                  initialSessionId={jainaSessionIdParam}
                  initialPrompt={jainaInitialPrompt}
                  onInitialPromptConsumed={clearJainaPrompt}
                  onCanvasActionApplied={handleCanvasActionApplied}
                  onOpenAccountRead={handleOpenAccountRead}
                  goalsAccessEnabled={goalsAccessEnabled}
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
                          ? 'inset 0 0 0 1px color-mix(in srgb, var(--primary) 35%, transparent)'
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
          </JainaBrandScopeProvider>
        </TabsContent>
      </Tabs>
    </div>
  );
}

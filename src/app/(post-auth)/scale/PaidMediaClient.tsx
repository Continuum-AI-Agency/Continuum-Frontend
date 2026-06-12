"use client";

import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type AdAccount, AdAccountSelector } from "@/components/paid-media/AdAccountSelector";
import type { PaidMediaPlatform } from "@/lib/paid-media/performance-types";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ReactFlowProvider } from "@xyflow/react";
import { useSession } from "@/hooks/useSession";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { PanelRightOpen, PanelRightClose, Maximize2, Minimize2 } from "lucide-react";
import { prefetchPaidMediaDashboard } from "@/lib/prefetch/paid-media-cache";
import {
  SurfaceTourTrigger,
  useReadyAfterPaint,
} from "@/components/onboarding/v2/tour/SurfaceTourTrigger";
import { TOUR_PAID_MEDIA } from "@/components/onboarding/v2/tour/config";
import { useTourTabStore } from "@/components/onboarding/v2/tour/tourTabStore";

const PAID_MEDIA_TABS = ["dashboard", "performance", "jaina"] as const;
type PaidMediaTab = (typeof PAID_MEDIA_TABS)[number];

function normalizePaidMediaTab(value: string | null): PaidMediaTab | null {
  if (value === "budget") return "performance";
  return PAID_MEDIA_TABS.some((tab) => tab === value) ? (value as PaidMediaTab) : null;
}

const CampaignCanvas = dynamic(
  () => import("@/CampaignCanvas/components/CampaignCanvas").then((mod) => mod.CampaignCanvas),
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

const PaidMediaDashboard = dynamic(
  () =>
    import("@/components/paid-media/dashboard/PaidMediaDashboard").then(
      (mod) => mod.PaidMediaDashboard
    ),
  { ssr: false, loading: () => <DashboardSkeleton /> }
);

const JainaChatSurface = dynamic(
  () =>
    import("@/components/paid-media/jaina/JainaChatSurface").then(
      (mod) => mod.JainaChatSurface
    ),
  { ssr: false, loading: () => <JainaSkeleton /> }
);

const ReportJobsBell = dynamic(
  () =>
    import(
      "@/components/paid-media/jaina/components/ReportJobsBell"
    ).then((mod) => mod.ReportJobsBell),
  { ssr: false }
);

const CampaignPerformanceTab = dynamic(
  () =>
    import("@/components/paid-media/performance/CampaignPerformanceTab").then(
      (mod) => mod.CampaignPerformanceTab
    ),
  { ssr: false, loading: () => <Skeleton className="h-96 w-full rounded-lg" /> }
);

type PaidMediaClientPageProps = {
  brandProfileId: string;
  brandName: string;
  initialAccounts?: AdAccount[];
  initialAdAccountId?: string | null;
};

export default function PaidMediaClientPage({
  brandProfileId,
  brandName,
  initialAccounts,
  initialAdAccountId,
}: PaidMediaClientPageProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get("tab");
  const normalizedTabParam = normalizePaidMediaTab(tabParam);
  const { user } = useSession();
  const [, startTabTransition] = React.useTransition();
  
  const [selectedAdAccount, setSelectedAdAccount] = React.useState<string | null>(
    initialAdAccountId ?? null
  );
  const [platform, setPlatform] = React.useState<PaidMediaPlatform>("meta");
  const [selectedCampaign, setSelectedCampaign] = React.useState<string | null>(null);

  // Switching ad platform clears the account so the selector auto-picks one for it.
  const handlePlatformChange = React.useCallback((next: PaidMediaPlatform) => {
    setPlatform(next);
    setSelectedAdAccount(null);
  }, []);
  const [activeTab, setActiveTab] = React.useState<PaidMediaTab>(
    normalizedTabParam ?? "dashboard"
  );
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
  React.useEffect(() => {
    setSelectedAdAccount(initialAdAccountId ?? null);
    setSelectedCampaign(null);
    setPlatform("meta");
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
    params.set("tab", normalizedTab);
    startTabTransition(() => {
      router.replace(`?${params.toString()}`, { scroll: false });
    });
  };

  const requestedTourTab = useTourTabStore((state) => state.paidMediaTab);
  const tourTabRequestId = useTourTabStore((state) => state.requestId);

  React.useEffect(() => {
    if (!requestedTourTab || requestedTourTab === activeTab) return;
    handleTabChange(requestedTourTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedTourTab, tourTabRequestId]);

  // Prefetch dashboard data while user is on Jaina tab so data is warm on switch-back
  React.useEffect(() => {
    if (activeTab !== "jaina" || !selectedAdAccount) return;
    const idleHandle =
      typeof requestIdleCallback === "function"
        ? requestIdleCallback(() =>
            prefetchPaidMediaDashboard({ brandId: brandProfileId, adAccountId: selectedAdAccount })
          )
        : setTimeout(
            () =>
              prefetchPaidMediaDashboard({
                brandId: brandProfileId,
                adAccountId: selectedAdAccount,
              }),
            2000
          );
    return () => {
      if (typeof cancelIdleCallback === "function") {
        cancelIdleCallback(idleHandle as number);
      } else {
        clearTimeout(idleHandle as ReturnType<typeof setTimeout>);
      }
    };
  }, [activeTab, brandProfileId, selectedAdAccount]);

  React.useEffect(() => {
    setSelectedCampaign(null);
  }, [selectedAdAccount]);

  const handleToggleCanvas = React.useCallback(() => {
    setIsCanvasOpen((previous) => !previous);
  }, []);

  React.useEffect(() => {
    if (activeTab !== "jaina") setIsJainaFullscreen(false);
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
    [getCanvasWidthLimits]
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
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    },
    [canvasWidthPx, clampCanvasWidth, isCanvasOpen]
  );

  React.useEffect(() => {
    const updateWidth = () => {
      setCanvasWidthPx((current) => clampCanvasWidth(current));
    };
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, [clampCanvasWidth]);

  const hasSeededCanvasWidth = React.useRef(false);
  React.useEffect(() => {
    const shell = canvasShellRef.current;
    if (!shell || typeof ResizeObserver === "undefined") return;
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

  const tourReady = useReadyAfterPaint(mounted && activeTab === "dashboard");

  if (!mounted) {
    return (
      <div className="box-border grid h-full min-h-0 w-full max-w-none grid-rows-[auto_minmax(0,1fr)] gap-2 overflow-hidden px-0 py-2">
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

  return (
    <div className="@container/paid box-border h-full min-h-0 w-full max-w-none overflow-hidden px-0 py-1">
      <SurfaceTourTrigger tourName={TOUR_PAID_MEDIA} ready={tourReady} />
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-[var(--app-shell-gap)] overflow-hidden"
      >
        <div className="flex min-h-9 flex-wrap items-center justify-between gap-[var(--app-shell-gap)] rounded-lg border border-border/70 bg-muted/10 px-[var(--app-shell-pad-inline)] py-[var(--app-shell-pad-block)]">
          <div data-tour-id="paid-account-selector" className="inline-flex">
            <AdAccountSelector
              brandId={brandProfileId}
              platform={platform}
              selectedAccountId={selectedAdAccount}
              onSelect={setSelectedAdAccount}
              initialTimelineAccounts={initialAccounts}
            />
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            <ReportJobsBell brandProfileId={brandProfileId} />
            {activeTab === "jaina" ? (
              <>
                <Button
                  type="button"
                  variant={isCanvasOpen ? "outline" : "secondary"}
                  size="sm"
                  onClick={handleToggleCanvas}
                  className="h-8 gap-1.5 px-2 text-xs"
                  aria-pressed={isCanvasOpen}
                >
                  {isCanvasOpen ? <PanelRightClose className="size-3.5" /> : <PanelRightOpen className="size-3.5" />}
                  {isCanvasOpen ? "Hide canvas" : "Canvas"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsJainaFullscreen((v) => !v)}
                  className="h-8 w-8 p-0"
                  aria-label={isJainaFullscreen ? "Exit full screen" : "Full screen"}
                  aria-pressed={isJainaFullscreen}
                >
                  {isJainaFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
                </Button>
              </>
            ) : null}
            <TabsList className="h-8">
              <TabsTrigger
                value="dashboard"
                className="px-3 text-xs"
                onMouseEnter={() => { void import("@/components/paid-media/dashboard/PaidMediaDashboard"); }}
                onFocus={() => { void import("@/components/paid-media/dashboard/PaidMediaDashboard"); }}
              >
                Dashboard
              </TabsTrigger>
              <TabsTrigger
                value="performance"
                className="px-3 text-xs"
                onMouseEnter={() => { void import("@/components/paid-media/performance/CampaignPerformanceTab"); }}
                onFocus={() => { void import("@/components/paid-media/performance/CampaignPerformanceTab"); }}
              >
                Performance
              </TabsTrigger>
              <TabsTrigger
                value="jaina"
                data-tour-id="paid-jaina-tab"
                className="px-3 text-xs"
                onMouseEnter={() => { void import("@/components/paid-media/jaina/JainaChatSurface"); }}
                onFocus={() => { void import("@/components/paid-media/jaina/JainaChatSurface"); }}
              >
                Jaina
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        <TabsContent value="dashboard" className="box-border min-h-0 overflow-hidden">
          <PaidMediaDashboard
            brandId={brandProfileId}
            adAccountId={selectedAdAccount}
            platform={platform}
            onPlatformChange={handlePlatformChange}
          />
        </TabsContent>

        <TabsContent value="performance" className="box-border min-h-0 overflow-hidden">
          <CampaignPerformanceTab brandId={brandProfileId} adAccountId={selectedAdAccount} />
        </TabsContent>

        <TabsContent value="jaina" className="box-border flex min-h-0 flex-col overflow-hidden">
          <div
            ref={canvasShellRef}
            className={cn(
              "relative flex flex-1 min-h-0 overflow-hidden rounded-xl border bg-background/70 shadow-2xl",
              isJainaFullscreen && "fixed inset-0 z-50 rounded-none border-none"
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
                    transition={{ type: "spring", stiffness: 260, damping: 28, mass: 0.8 }}
                    onPointerDown={handleCanvasResizeStart}
                  />
                  <motion.aside
                    key="canvas-panel"
                    className="relative min-h-0 shrink-0 overflow-hidden border-l border-border/70 bg-background/80"
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 24 }}
                    transition={{ type: "spring", stiffness: 240, damping: 26, mass: 0.85 }}
                    style={{
                      width: canvasWidthPx,
                      boxShadow: isResizingCanvas
                        ? "inset 0 0 0 1px hsl(var(--primary) / 0.35)"
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

"use client";

import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdAccountSelector } from "@/components/paid-media/AdAccountSelector";
import { JainaChatSurface } from "@/components/paid-media/jaina/JainaChatSurface";
import { PaidMediaDashboard } from "@/components/paid-media/dashboard/PaidMediaDashboard";
import { useSearchParams, useRouter } from "next/navigation";
import { CampaignCanvas } from "@/CampaignCanvas/components/CampaignCanvas";
import { ReactFlowProvider } from "@xyflow/react";
import { useSession } from "@/hooks/useSession";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AnimatePresence, motion } from "framer-motion";
import { PanelRightOpen, PanelRightClose } from "lucide-react";

type PaidMediaClientPageProps = {
  brandProfileId: string;
  brandName: string;
};

export default function PaidMediaClientPage({
  brandProfileId,
  brandName,
}: PaidMediaClientPageProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get("tab");
  const { user } = useSession();
  
  const [selectedAdAccount, setSelectedAdAccount] = React.useState<string | null>(null);
  const [selectedCampaign, setSelectedCampaign] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState(tabParam || "dashboard");
  const [isCanvasOpen, setIsCanvasOpen] = React.useState(false);
  const [canvasWidthPx, setCanvasWidthPx] = React.useState(540);
  const [isResizingCanvas, setIsResizingCanvas] = React.useState(false);
  const canvasShellRef = React.useRef<HTMLDivElement | null>(null);

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (tabParam && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [tabParam, activeTab]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    router.push(`?${params.toString()}`);
  };

  React.useEffect(() => {
    setSelectedCampaign(null);
  }, [selectedAdAccount]);

  const handleToggleCanvas = React.useCallback(() => {
    setIsCanvasOpen((previous) => !previous);
  }, []);

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

  if (!mounted) {
    return (
      <div className="box-border flex h-full min-h-0 w-full max-w-none flex-col gap-2 px-0 py-2">
        <div className="rounded-lg border bg-card px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-8 w-60 rounded-md" />
            <Skeleton className="h-8 w-52 rounded-md" />
          </div>
        </div>
        <div className="flex-1 min-h-0 rounded-xl border bg-card p-4 space-y-3">
          <Skeleton className="h-[38%] w-full rounded-lg" />
          <Skeleton className="h-1 w-full rounded" />
          <Skeleton className="h-[58%] w-full rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="box-border flex h-full min-h-0 w-full max-w-none flex-col gap-2 overflow-hidden px-0 py-2">
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/10 px-3 py-2">
          <AdAccountSelector
            brandId={brandProfileId}
            selectedAccountId={selectedAdAccount}
            onSelect={setSelectedAdAccount}
          />
          <TabsList className="h-9">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="jaina">Jaina Analyst</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="dashboard" className="box-border flex-1 min-h-0 pt-2 overflow-auto">
          <PaidMediaDashboard brandId={brandProfileId} adAccountId={selectedAdAccount} />
        </TabsContent>

        <TabsContent value="jaina" className="box-border flex-1 min-h-0 pt-2 flex flex-col overflow-hidden">
          <div className="mb-2 flex items-center justify-end">
            <Button
              type="button"
              variant={isCanvasOpen ? "outline" : "secondary"}
              size="sm"
              onClick={handleToggleCanvas}
              className="gap-2"
              aria-pressed={isCanvasOpen}
            >
              {isCanvasOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
              {isCanvasOpen ? "Hide Canvas" : "Open Canvas"}
            </Button>
          </div>

          <div
            ref={canvasShellRef}
            className="relative flex flex-1 min-h-0 overflow-hidden rounded-xl border bg-background/70 shadow-2xl"
          >
            <div className="min-w-0 flex-1">
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
                    initial={{ width: 0, opacity: 0, x: 24 }}
                    animate={{ width: canvasWidthPx, opacity: 1, x: 0 }}
                    exit={{ width: 0, opacity: 0, x: 24 }}
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

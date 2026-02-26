"use client";

import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdAccountSelector } from "@/components/paid-media/AdAccountSelector";
import { JainaChatSurface } from "@/components/paid-media/jaina/JainaChatSurface";
import { PaidMediaDashboard } from "@/components/paid-media/dashboard/PaidMediaDashboard";
import { useSearchParams, useRouter } from "next/navigation";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { CampaignCanvas } from "@/CampaignCanvas/components/CampaignCanvas";
import { ReactFlowProvider } from "@xyflow/react";
import { useCampaignStore } from "@/CampaignCanvas/stores/useCampaignStore";
import { buildCampaignCanvasPayload } from "@/lib/campaign-canvas/payload";
import { useSession } from "@/hooks/useSession";
import { Skeleton } from "@/components/ui/skeleton";

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
  const nodes = useCampaignStore((state) => state.nodes);
  const edges = useCampaignStore((state) => state.edges);

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

  const campaignCanvasPayload = React.useMemo(
    () =>
      buildCampaignCanvasPayload(nodes, edges, {
        source: "agent-check-in",
        brandProfileId,
        adAccountId: selectedAdAccount,
        campaignId: selectedCampaign,
      }),
    [brandProfileId, edges, nodes, selectedAdAccount, selectedCampaign]
  );

  if (!mounted) {
    return (
      <div className="box-border flex h-full min-h-0 w-full max-w-none flex-col gap-4 px-3 py-6 sm:px-4 lg:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Skeleton className="h-10 w-56 rounded-md" />
        </div>
        <div className="rounded-lg border bg-card p-2">
          <Skeleton className="h-9 w-56 rounded-md" />
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
    <div className="box-border flex h-full min-h-0 w-full max-w-none flex-col gap-4 overflow-hidden px-3 py-6 sm:px-4 lg:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <AdAccountSelector
          brandId={brandProfileId}
          selectedAccountId={selectedAdAccount}
          onSelect={setSelectedAdAccount}
        />
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="h-full min-h-0 flex-1 flex flex-col overflow-hidden">
        <div className="border-b px-1">
          <TabsList>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="jaina">Jaina Analyst</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="dashboard" className="box-border flex-1 min-h-0 pt-4 overflow-auto">
          <PaidMediaDashboard brandId={brandProfileId} adAccountId={selectedAdAccount} />
        </TabsContent>

        <TabsContent value="jaina" className="box-border flex-1 min-h-0 pt-4 flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0 flex flex-col border rounded-xl overflow-hidden bg-white/5 shadow-2xl relative">
            <ResizablePanelGroup orientation="horizontal" className="h-full w-full min-h-0">
              <ResizablePanel
                defaultSize="62%"
                minSize="35%"
                maxSize="85%"
                className="flex min-h-0 flex-col overflow-hidden bg-black/20"
                style={{ minWidth: 0 }}
              >
                <JainaChatSurface
                  brandProfileId={brandProfileId}
                  brandName={brandName}
                  adAccountId={selectedAdAccount}
                  campaignId={selectedCampaign}
                  campaignCanvasPayload={campaignCanvasPayload}
                  userId={user?.id ?? null}
                  className="rounded-none border-none bg-transparent backdrop-blur-none"
                />
              </ResizablePanel>

              <ResizableHandle withHandle className="bg-white/10 z-50 hover:bg-primary/40 transition-colors w-1.5" />

              <ResizablePanel
                defaultSize="38%"
                minSize="15%"
                className="relative min-h-0 overflow-hidden bg-black/10"
                style={{ minWidth: 0 }}
              >
                <div className="absolute inset-0 p-0.5">
                  <ReactFlowProvider>
                    <CampaignCanvas />
                  </ReactFlowProvider>
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

"use client";

import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdAccountSelector } from "@/components/paid-media/AdAccountSelector";
import { JainaChatSurface } from "@/components/paid-media/jaina/JainaChatSurface";
import { PaidMediaDashboard } from "@/components/paid-media/dashboard/PaidMediaDashboard";
import { useSearchParams, useRouter } from "next/navigation";

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
  
  const [selectedAdAccount, setSelectedAdAccount] = React.useState<string | null>(null);
  const [selectedCampaign, setSelectedCampaign] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState(tabParam || "dashboard");

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

  if (!mounted) {
    return (
      <div className="flex h-full min-h-0 w-full max-w-none flex-col gap-4 px-3 py-6 sm:px-4 lg:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="h-10 w-48 animate-pulse rounded-md bg-white/5" />
        </div>
        <div className="flex-1 animate-pulse rounded-xl bg-white/5" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full max-w-none flex-col gap-4 px-3 py-6 sm:px-4 lg:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <AdAccountSelector
          brandId={brandProfileId}
          selectedAccountId={selectedAdAccount}
          onSelect={setSelectedAdAccount}
        />
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="h-full min-h-0 flex-1 flex flex-col">
        <div className="border-b px-1">
          <TabsList>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="jaina">Jaina Analyst</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="dashboard" className="flex-1 min-h-0 pt-4 overflow-auto">
          <PaidMediaDashboard brandId={brandProfileId} adAccountId={selectedAdAccount} />
        </TabsContent>

        <TabsContent value="jaina" className="flex-1 min-h-0 pt-4">
          <JainaChatSurface
            brandProfileId={brandProfileId}
            brandName={brandName}
            adAccountId={selectedAdAccount}
            campaignId={selectedCampaign}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

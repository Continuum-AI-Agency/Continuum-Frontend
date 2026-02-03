"use client";

import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdAccountSelector } from "@/components/paid-media/AdAccountSelector";
import { CampaignList } from "@/components/paid-media/CampaignList";
import { JainaChatSurface } from "@/components/paid-media/jaina/JainaChatSurface";

type PaidMediaClientPageProps = {
  brandProfileId: string;
  brandName: string;
};

export default function PaidMediaClientPage({
  brandProfileId,
  brandName,
}: PaidMediaClientPageProps) {
  const [selectedAdAccount, setSelectedAdAccount] = React.useState<string | null>(null);
  const [selectedCampaign, setSelectedCampaign] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState("jaina");

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Reset campaign selection when ad account changes
  React.useEffect(() => {
    setSelectedCampaign(null);
  }, [selectedAdAccount]);

  const handleCampaignSelect = (campaignId: string) => {
    setSelectedCampaign(campaignId);
    // Switch to Jaina tab to analyze the selected campaign
    setActiveTab("jaina");
  };

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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full min-h-0 flex-1 flex flex-col">
        <div className="border-b px-1">
          <TabsList>
            <TabsTrigger value="jaina">Jaina Analyst</TabsTrigger>
            <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="jaina" className="flex-1 min-h-0 pt-4">
          <JainaChatSurface
            brandProfileId={brandProfileId}
            brandName={brandName}
            adAccountId={selectedAdAccount}
            campaignId={selectedCampaign}
          />
        </TabsContent>

        <TabsContent value="campaigns" className="flex-1 min-h-0 pt-4 overflow-auto">
          <CampaignList
            brandId={brandProfileId}
            adAccountId={selectedAdAccount}
            onSelectCampaign={handleCampaignSelect}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

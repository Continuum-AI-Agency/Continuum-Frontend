"use client";

import React from "react";
import { PaidMediaReportingWidget } from "@/components/paid-media/PaidMediaReportingWidget";
import { DCOActionsWidget } from "@/components/dashboard/DCOActionsWidget";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

type PaidDashboardViewProps = {
  brandId: string;
};

export function PaidDashboardView({ brandId }: PaidDashboardViewProps) {
  return (
    <ResizablePanelGroup orientation="vertical" className="h-full min-h-0">
      <ResizablePanel defaultSize={35} minSize={20} className="min-h-0">
        <div className="h-full min-h-0 border-b bg-background p-4 overflow-hidden">
          <PaidMediaReportingWidget brandId={brandId} />
        </div>
      </ResizablePanel>
      
      <ResizableHandle withHandle className="h-px w-full" />
      
      <ResizablePanel defaultSize={65} minSize={20} className="min-h-0">
        <div className="h-full min-h-0 p-4 overflow-hidden">
          <DCOActionsWidget
            brandId={brandId}
            className="h-full min-h-0 flex flex-col overflow-hidden"
          />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

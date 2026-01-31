"use client";

import React from "react";
import { ReloadIcon, CheckCircledIcon, CrossCircledIcon, ExclamationTriangleIcon } from "@radix-ui/react-icons";

type RealtimeStatus = "INITIALIZING" | "SUBSCRIBED" | "TIMED_OUT" | "CLOSED" | "ERROR";

interface CanvasSyncStatusProps {
  status: RealtimeStatus;
  dbStatus: RealtimeStatus;
  isSaving: boolean;
}

export function CanvasSyncStatus({ status, dbStatus, isSaving }: CanvasSyncStatusProps) {
  if (dbStatus === "ERROR" || dbStatus === "TIMED_OUT" || dbStatus === "CLOSED") {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 bg-red-500/10 text-red-600 rounded-full text-xs font-medium border border-red-500/20" title="Database sync failed. Reload to retry.">
        <CrossCircledIcon className="w-3.5 h-3.5" />
        <span>Sync Error</span>
      </div>
    );
  }
  
  if (status === "ERROR") {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-500/10 text-amber-600 rounded-full text-xs font-medium border border-amber-500/20" title="Presence disconnected. cursors may lag.">
        <ExclamationTriangleIcon className="w-3.5 h-3.5" />
        <span>Live Disconnected</span>
      </div>
    );
  }

  if (isSaving) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-500/10 text-blue-600 rounded-full text-xs font-medium border border-blue-500/20">
        <ReloadIcon className="w-3.5 h-3.5 animate-spin" />
        <span>Saving...</span>
      </div>
    );
  }

  if (dbStatus === "INITIALIZING" || status === "INITIALIZING") {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-500/10 text-amber-600 rounded-full text-xs font-medium border border-amber-500/20">
        <ReloadIcon className="w-3.5 h-3.5 animate-spin" />
        <span>Connecting...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 bg-green-500/10 text-green-600 rounded-full text-xs font-medium border border-green-500/20">
      <CheckCircledIcon className="w-3.5 h-3.5" />
      <span>Saved</span>
    </div>
  );
}

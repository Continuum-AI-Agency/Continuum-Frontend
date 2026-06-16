"use client";

import React from "react";
import { ReloadIcon, CheckCircledIcon, CrossCircledIcon, ExclamationTriangleIcon } from "@radix-ui/react-icons";

type RealtimeStatus = "INITIALIZING" | "SUBSCRIBED" | "TIMED_OUT" | "CLOSED" | "ERROR";

interface CanvasSyncStatusProps {
  status: RealtimeStatus;
  dbStatus: RealtimeStatus;
  isSaving: boolean;
  isCollaborative?: boolean;
}

export function CanvasSyncStatus({ status, dbStatus, isSaving, isCollaborative = false }: CanvasSyncStatusProps) {
  const dbDegraded = dbStatus === "ERROR" || dbStatus === "TIMED_OUT" || dbStatus === "CLOSED";
  const presenceDegraded = status === "ERROR";

  // Only alarm when collaborating: a dropped channel means peers may diverge.
  if (isCollaborative && dbDegraded) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 bg-red-500/10 text-red-600 rounded-full text-xs font-medium border border-red-500/20" title="Database sync failed. Reload to retry.">
        <CrossCircledIcon className="w-3.5 h-3.5" />
        <span>Sync Error</span>
      </div>
    );
  }

  if (isCollaborative && presenceDegraded) {
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

  // Solo with a degraded channel is harmless: edits are local-authoritative and
  // still persist. Show a calm offline state instead of an alarming error.
  if (!isCollaborative && (dbDegraded || presenceDegraded)) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 bg-muted text-muted-foreground rounded-full text-xs font-medium border border-border" title="Offline — your work is saved locally and syncs when you reconnect.">
        <CheckCircledIcon className="w-3.5 h-3.5" />
        <span>Saved locally</span>
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

"use client";

import React from "react";
import { ReloadIcon, CheckCircledIcon, CrossCircledIcon, ExclamationTriangleIcon } from "@radix-ui/react-icons";
import {
  deriveCanvasConnectionState,
  type CanvasConnectionState,
  type RealtimeStatus,
} from "./canvasConnectionState";

interface CanvasSyncStatusProps {
  status: RealtimeStatus;
  dbStatus: RealtimeStatus;
  isSaving: boolean;
  isCollaborative?: boolean;
  roomsLoading?: boolean;
  hasRoom?: boolean;
}

const PILL = "flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border";

export function CanvasSyncStatus({
  status,
  dbStatus,
  isSaving,
  isCollaborative = false,
  roomsLoading = false,
  hasRoom = true,
}: CanvasSyncStatusProps) {
  const state: CanvasConnectionState = deriveCanvasConnectionState({
    roomsLoading,
    hasRoom,
    status,
    dbStatus,
    isSaving,
    isCollaborative,
  });

  switch (state) {
    case "workspace-loading":
      return (
        <div className={`${PILL} bg-muted text-muted-foreground border-border`} title="Loading your workspace…">
          <ReloadIcon className="w-3.5 h-3.5 animate-spin opacity-70" />
          <span>Loading workspace...</span>
        </div>
      );

    case "idle":
      return (
        <div className={`${PILL} bg-muted text-muted-foreground border-border`} title="No workspace open yet.">
          <CheckCircledIcon className="w-3.5 h-3.5" />
          <span>Ready</span>
        </div>
      );

    case "sync-error":
      return (
        <div className={`${PILL} bg-red-500/10 text-red-600 border-red-500/20`} title="Database sync failed. Reload to retry.">
          <CrossCircledIcon className="w-3.5 h-3.5" />
          <span>Sync Error</span>
        </div>
      );

    case "live-disconnected":
      return (
        <div className={`${PILL} bg-amber-500/10 text-amber-600 border-amber-500/20`} title="Presence disconnected. cursors may lag.">
          <ExclamationTriangleIcon className="w-3.5 h-3.5" />
          <span>Live Disconnected</span>
        </div>
      );

    case "saving":
      return (
        <div className={`${PILL} bg-blue-500/10 text-blue-600 border-blue-500/20`}>
          <ReloadIcon className="w-3.5 h-3.5 animate-spin" />
          <span>Saving...</span>
        </div>
      );

    case "saved-locally":
      return (
        <div className={`${PILL} bg-muted text-muted-foreground border-border`} title="Offline — your work is saved locally and syncs when you reconnect.">
          <CheckCircledIcon className="w-3.5 h-3.5" />
          <span>Saved locally</span>
        </div>
      );

    case "connecting":
      return (
        <div className={`${PILL} bg-amber-500/10 text-amber-600 border-amber-500/20`}>
          <ReloadIcon className="w-3.5 h-3.5 animate-spin" />
          <span>Connecting...</span>
        </div>
      );

    default:
      return (
        <div className={`${PILL} bg-green-500/10 text-green-600 border-green-500/20`}>
          <CheckCircledIcon className="w-3.5 h-3.5" />
          <span>Saved</span>
        </div>
      );
  }
}

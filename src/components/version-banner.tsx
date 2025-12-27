"use client";

import { Button } from "@/components/ui/button";
import { useVersionCheck } from "@/hooks/use-version-check";

export function VersionBanner() {
  const { isUpdateAvailable, reload } = useVersionCheck();

  if (!isUpdateAvailable) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 w-[min(24rem,calc(100vw-2rem))] rounded-lg border border-subtle bg-surface p-4 shadow-brand-glow"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-primary">New Continuum update available</p>
          <p className="text-xs text-secondary">Refresh to load the latest deployment.</p>
        </div>
        <Button size="sm" onClick={reload} className="w-full sm:w-auto">
          Refresh
        </Button>
      </div>
    </div>
  );
}

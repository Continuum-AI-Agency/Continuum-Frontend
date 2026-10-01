'use client';

import { Sparkles } from 'lucide-react';
import { createContext, useContext, useState } from 'react';
import { Button } from '@/components/ui/button';

/** UI command only; campaign data remains in the existing canvas store. */
const CampaignCreativeAction = createContext<((nodeId: string) => Promise<void>) | null>(null);
export const CampaignCreativeActionsProvider = CampaignCreativeAction.Provider;

export function CampaignCreativeGenerateButton({ nodeId }: { nodeId: string }) {
  const request = useContext(CampaignCreativeAction);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!request) return null;
  return (
    <div className="nodrag nopan p-2">
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={async (event) => {
          event.stopPropagation();
          setBusy(true);
          setError(null);
          try {
            await request(nodeId);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Creative request failed');
          } finally {
            setBusy(false);
          }
        }}
      >
        <Sparkles className="size-3.5" />
        Generate / Enrich
      </Button>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

'use client';

import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { createContext, useContext, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useUiErrorMessage } from '@/i18n/errors';

/** UI command only; campaign data remains in the existing canvas store. */
const CampaignCreativeAction = createContext<((nodeId: string) => Promise<void>) | null>(null);
export const CampaignCreativeActionsProvider = CampaignCreativeAction.Provider;

export function CampaignCreativeGenerateButton({ nodeId }: { nodeId: string }) {
  const uiText = useTranslations('scale');
  const formatUiError = useUiErrorMessage();
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
            setError(formatUiError(cause));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Sparkles className="size-3.5" />
        {uiText('generate_enrich_45de453')}
      </Button>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

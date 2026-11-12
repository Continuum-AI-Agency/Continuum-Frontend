'use client';

import { useTranslations } from 'next-intl';
import { useUiErrorMessage } from '@/i18n/errors';

/**
 * Connecting OpenAI Ads is a paste, not a redirect.
 *
 * Every other provider here opens an OAuth popup. OpenAI issues a partner API key scoped to
 * one client ad account, so the whole flow is: paste the key, we call GET /ad_account with
 * it, and the account that comes back IS the verification. The key is sent once and never
 * comes back — nothing in this component ever reads it after submit.
 *
 * The copy has to carry one fact the user cannot discover themselves: OpenAI must configure
 * Continuum as an API partner for their account first. Without that sentence a 403 reads as
 * a broken product rather than a phone call.
 */

import { CheckCircle2, Loader2 } from 'lucide-react';
import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/ToastProvider';
import { useConnectOpenAiAds } from '@/lib/api/openaiAds';

type OpenAiAdsConnectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string | null;
  onConnected?: () => void;
};

export function OpenAiAdsConnectDialog({
  open,
  onOpenChange,
  brandId,
  onConnected,
}: OpenAiAdsConnectDialogProps) {
  const uiErrorMessage = useUiErrorMessage();

  const tUi = useTranslations('settings');

  const { show } = useToast();
  const connect = useConnectOpenAiAds();
  const [apiKey, setApiKey] = React.useState('');

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!brandId) {
        show({
          title: tUi('m_65e6fa498d'),
          description: tUi('m_d5eb62e23a'),
          variant: 'error',
        });
        return;
      }
      try {
        const result = await connect.mutateAsync({
          apiKey: apiKey.trim(),
          brandId,
        });
        setApiKey('');
        onOpenChange(false);
        onConnected?.();
        show({
          title: tUi('m_c2f9b7b489'),
          description: tUi('m_3e8843112b', {
            v0: String(result.account.name ?? result.account.id),
          }),
          variant: 'success',
        });
      } catch (error) {
        const message = error instanceof Error ? uiErrorMessage(error) : tUi('m_83a6fd7b78');
        show({
          title: tUi('m_9ed243a97c'),
          description: message.includes('partner') ? tUi('m_f2b725de62') : message,
          variant: 'error',
        });
      }
    },
    [apiKey, brandId, connect, onConnected, onOpenChange, show, tUi, uiErrorMessage],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{tUi('m_ad5d3b7cb2')}</DialogTitle>
            <DialogDescription>{tUi('m_c38c4e2626')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="openai-ads-key">{tUi('m_a47bad8ffc')}</Label>
              <Input
                id="openai-ads-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="sk-..."
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                disabled={connect.isPending}
              />
              <p className="text-xs text-muted-foreground">{tUi('m_43321a010d')}</p>
            </div>

            <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">{tUi('m_6acad42ddd')}</p>
              <p className="mt-1">{tUi('m_7bb244b51a')}</p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={connect.isPending}
            >
              {tUi('m_77dfd2135f')}
            </Button>
            <Button type="submit" disabled={connect.isPending || apiKey.trim().length < 8}>
              {connect.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              {tUi('m_6394aacb69')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

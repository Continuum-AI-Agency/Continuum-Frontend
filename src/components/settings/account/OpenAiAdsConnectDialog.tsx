'use client';

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
  const { show } = useToast();
  const connect = useConnectOpenAiAds();
  const [apiKey, setApiKey] = React.useState('');

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!brandId) {
        show({
          title: 'Pick a brand first',
          description: 'An OpenAI ad account is connected to one brand.',
          variant: 'error',
        });
        return;
      }
      try {
        const result = await connect.mutateAsync({ apiKey: apiKey.trim(), brandId });
        setApiKey('');
        onOpenChange(false);
        onConnected?.();
        show({
          title: 'Connected',
          description: `${result.account.name ?? result.account.id} is now linked to this brand.`,
          variant: 'success',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Please try again.';
        show({
          title: 'Could not connect',
          description: message.includes('partner')
            ? 'OpenAI has not enabled API access for this ad account yet. Contact your OpenAI partner representative.'
            : message,
          variant: 'error',
        });
      }
    },
    [apiKey, brandId, connect, onConnected, onOpenChange, show],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Connect OpenAI Ads</DialogTitle>
            <DialogDescription>
              Paste the Ads API key OpenAI issued for this ad account. We verify it against the
              account before storing it, encrypted.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="openai-ads-key">Ads API key</Label>
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
              <p className="text-xs text-muted-foreground">
                Issue it in the Settings tab of Ads Manager. One key covers one ad account.
              </p>
            </div>

            <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Not an OAuth connection</p>
              <p className="mt-1">
                OpenAI must configure Continuum as an API partner for your ad account before
                campaign management works. Contact our team and we will arrange it with your OpenAI
                representative.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={connect.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={connect.isPending || apiKey.trim().length < 8}>
              {connect.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              Verify and connect
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

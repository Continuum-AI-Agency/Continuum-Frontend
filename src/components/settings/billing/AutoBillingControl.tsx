'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/ToastProvider';
import { setOverageBilling } from '@/lib/billing/billingApi';
import {
  type AutoBillingView,
  formatUsd,
  type PendingBillingChange,
} from '@/lib/billing/billingViewModel';
import { billingOverviewKey } from '@/lib/billing/useBilling';

// Metered overage is opt-in: credit packs are the base way to top up, and only an owner who
// turns this on has Canvas usage past their credits billed to the card (up to the plan's
// monthly cap). Turning it on asks first; turning it off does not, because off only stops
// charges.

const PER_CREDIT = formatUsd(0.01);

function describe({ enabled, capUsd, disabledReason }: AutoBillingView): string {
  if (disabledReason) return disabledReason;
  const cap = capUsd !== null ? `, up to ${formatUsd(capUsd)} a month` : '';
  return enabled
    ? `On. When credits run out, Canvas usage is billed to your card at ${PER_CREDIT} per credit${cap}.`
    : `Off. When credits run out, generation pauses until you buy a pack. Turn on to keep generating at ${PER_CREDIT} per credit${cap}.`;
}

export function AutoBillingControl({
  brandId,
  autoBilling,
  onChanged,
}: {
  brandId: string;
  autoBilling: AutoBillingView;
  onChanged: (change: PendingBillingChange) => void;
}) {
  const { show } = useToast();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const labelId = useId();
  const descriptionId = useId();
  const cap = autoBilling.capUsd !== null ? formatUsd(autoBilling.capUsd) : null;

  const change = useMutation({
    mutationFn: (enabled: boolean) => setOverageBilling(brandId, { enabled }),
    onSuccess: (result) => {
      setConfirming(false);
      onChanged({ kind: 'overage_changed', enabled: result.overageEnabled });
      void queryClient.invalidateQueries({ queryKey: billingOverviewKey(brandId) });
    },
    onError: (error, enabled) => {
      show({
        title: `Could not turn auto-billing ${enabled ? 'on' : 'off'}`,
        description: error.message,
        variant: 'error',
      });
      void queryClient.invalidateQueries({ queryKey: billingOverviewKey(brandId) });
    },
  });

  return (
    <div data-testid="auto-billing" className="flex items-start justify-between gap-4">
      <div className="min-w-0 space-y-1">
        <p id={labelId} className="text-sm font-medium text-foreground">
          Auto-bill overage to card
        </p>
        <p id={descriptionId} className="max-w-[60ch] text-xs text-muted-foreground">
          {describe(autoBilling)}
        </p>
      </div>
      <Switch
        className="mt-0.5"
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
        checked={autoBilling.enabled}
        disabled={autoBilling.disabledReason !== null || change.isPending}
        aria-busy={change.isPending}
        onCheckedChange={(next) => (next ? setConfirming(true) : change.mutate(false))}
      />
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turn on auto-billing?</AlertDialogTitle>
            <AlertDialogDescription>
              When this brand runs out of Canvas credits, generation keeps going and usage is billed
              to the card on file at {PER_CREDIT} per credit
              {cap ? `, up to ${cap} a month` : ''}. It appears on your next invoice. Credit packs
              are still used first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={change.isPending}>Keep it off</AlertDialogCancel>
            <AlertDialogAction
              variant="cta"
              disabled={change.isPending}
              aria-busy={change.isPending}
              onClick={() => change.mutate(true)}
            >
              {change.isPending ? 'Turning on…' : 'Turn on auto-billing'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

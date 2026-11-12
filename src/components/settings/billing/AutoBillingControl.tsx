'use client';

import type { CreditWallet } from '@continuum/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
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
import { useUiErrorMessage } from '@/i18n/errors';
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

const PER_CREDIT_USD = 0.01;

// The same switch drives both meters; only the words differ.
function getBillingCopy(tUi: ReturnType<typeof useTranslations<'settings'>>) {
  return {
    canvas: {
      label: tUi('m_df0311de41'),
      confirmTitle: tUi('m_f6ff73157c'),
      usage: tUi('m_0e11fea82d'),
      paused: tUi('m_2c5661e1ad'),
      keepGoing: tUi('m_e76c196480'),
      wallet: tUi('m_1d63df100a'),
      goesOn: tUi('m_0c10a60a73'),
    },
    x: {
      label: tUi('m_f039b0ecbf'),
      confirmTitle: tUi('m_521bbd16af'),
      usage: tUi('m_61f46d3602'),
      paused: tUi('m_09c5ae936b'),
      keepGoing: tUi('m_fd3ec04bcb'),
      wallet: tUi('m_cf13da279f'),
      goesOn: tUi('m_0e2db78480'),
    },
  } as const;
}

function describe(
  { enabled, capUsd, disabledReason }: AutoBillingView,
  copy: ReturnType<typeof getBillingCopy>[CreditWallet],
  tUi: ReturnType<typeof useTranslations<'settings'>>,
  locale: string,
): string {
  if (disabledReason) return disabledReason;
  const cap =
    capUsd !== null ? tUi('autoBillingMonthlyCap', { cap: formatUsd(capUsd, 'usd', locale) }) : '';
  const rate = formatUsd(PER_CREDIT_USD, 'usd', locale);
  return enabled
    ? tUi('autoBillingOn', { usage: copy.usage, rate, cap })
    : tUi('autoBillingOff', {
        paused: copy.paused,
        keepGoing: copy.keepGoing,
        rate,
        cap,
      });
}

export function AutoBillingControl({
  brandId,
  autoBilling,
  onChanged,
  meter = 'canvas',
}: {
  brandId: string;
  autoBilling: AutoBillingView;
  onChanged: (change: PendingBillingChange) => void;
  /** Which metered item the switch adds or removes. */
  meter?: CreditWallet;
}) {
  const uiErrorMessage = useUiErrorMessage();

  const tUi = useTranslations('settings');
  const uiLocale = useLocale();

  const COPY = getBillingCopy(tUi);

  const copy = COPY[meter];
  const { show } = useToast();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const labelId = useId();
  const descriptionId = useId();
  const cap = autoBilling.capUsd !== null ? formatUsd(autoBilling.capUsd, 'usd', uiLocale) : null;

  const change = useMutation({
    mutationFn: (enabled: boolean) => setOverageBilling(brandId, { enabled, meter }),
    onSuccess: (result) => {
      setConfirming(false);
      onChanged({
        kind: meter === 'x' ? 'x_overage_changed' : 'overage_changed',
        enabled: result.overageEnabled,
      });
      void queryClient.invalidateQueries({
        queryKey: billingOverviewKey(brandId),
      });
    },
    onError: (error, enabled) => {
      show({
        title: tUi('m_a574e4108a', {
          v0: String(enabled ? tUi('m_db3d405b10') : tUi('m_da7a687343')),
        }),
        description: uiErrorMessage(error),
        variant: 'error',
      });
      void queryClient.invalidateQueries({
        queryKey: billingOverviewKey(brandId),
      });
    },
  });

  return (
    <div
      data-testid={meter === 'x' ? 'x-auto-billing' : 'auto-billing'}
      className="flex items-start justify-between gap-4"
    >
      <div className="min-w-0 space-y-1">
        <p id={labelId} className="text-sm font-medium text-foreground">
          {copy.label}
        </p>
        <p id={descriptionId} className="max-w-[60ch] text-xs text-muted-foreground">
          {describe(autoBilling, copy, tUi, uiLocale)}
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
            <AlertDialogTitle>{copy.confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {tUi('autoBillingConfirmation', {
                wallet: copy.wallet,
                goesOn: copy.goesOn,
                rate: formatUsd(PER_CREDIT_USD, 'usd', uiLocale),
                cap: cap ? tUi('autoBillingMonthlyCap', { cap }) : '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={change.isPending}>{tUi('m_2a54b84b88')}</AlertDialogCancel>
            <AlertDialogAction
              variant="cta"
              disabled={change.isPending}
              aria-busy={change.isPending}
              onClick={() => change.mutate(true)}
            >
              {change.isPending ? tUi('m_3c718be90a') : tUi('m_9fccd2cede')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

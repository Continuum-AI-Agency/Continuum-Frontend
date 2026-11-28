'use client';

import type { WatchmanReadiness as Readiness } from '@continuum/contracts';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button, buttonVariants } from '@/components/ui/button';

export function WatchmanReadiness({
  readiness,
  canManage,
  refreshing,
  onRefresh,
  onResumeSetup,
  onBudget,
}: {
  readiness: Readiness | null;
  canManage: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onResumeSetup: () => void;
  onBudget: () => void;
}) {
  const t = useTranslations('automations');
  if (readiness?.state === 'ready') return null;
  const blockers =
    readiness?.checks.filter((check) => !['ready', 'not_required'].includes(check.status)) ?? [];
  return (
    <div role="status" className="shrink-0 border-b border-border p-[var(--card-pad)] text-xs">
      <p className="font-medium">
        {t(readiness?.state === 'blocked' ? 'team.setupBlocked' : 'team.readinessUnknown')}
      </p>
      <ul className="mt-2 space-y-2">
        {blockers.map((check) => (
          <li key={check.key} className="space-y-1">
            <p className="text-muted-foreground">
              {t(`team.readinessChecks.${check.key}`)}: {check.reason ?? t('team.unknown')}
            </p>
            {check.recovery_action === 'connect_account' ||
            check.recovery_action === 'reconnect_account' ? (
              <Link
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
                href="/settings?section=integrations"
              >
                {t('team.manageConnections')}
              </Link>
            ) : check.recovery_action === 'resume_setup' && canManage ? (
              <Button variant="outline" size="sm" onClick={onResumeSetup}>
                {t('team.resumeSetup')}
              </Button>
            ) : check.recovery_action === 'adjust_budget' && canManage ? (
              <Button variant="outline" size="sm" onClick={onBudget}>
                {t('team.adjustBudget')}
              </Button>
            ) : check.key === 'entitlement' ? (
              <Link
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
                href="/settings?section=billing"
              >
                {t('team.reviewBilling')}
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
      {blockers.some((check) => check.recovery_action === 'contact_support') ? (
        <p className="mt-2 max-w-prose text-muted-foreground">{t('team.serviceUnavailable')}</p>
      ) : null}
      <Button
        className="mt-3"
        variant="outline"
        size="sm"
        onClick={onRefresh}
        disabled={refreshing}
      >
        {t('team.checkReadiness')}
      </Button>
    </div>
  );
}

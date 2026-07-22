// INVARIANT: renders only accounts already tagged into the brand
// (`brand_profile_integration_accounts`). To assign new ones, the user opens
// `AssignmentsDialog`. Never reach for the caller's full user_integrations list
// here — that's `UserConnectionsSwitcher`'s job.
'use client';

import { Plug, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AssignmentsDialog } from '@/components/integrations/AssignmentsDialog';
import type { PlatformKey } from '@/components/onboarding/platforms';
import { useActiveBrandContext } from '@/components/providers/ActiveBrandProvider';
import {
  IntegrationSwitcher,
  type IntegrationSwitcherData,
  type IntegrationSwitcherItem,
  type IntegrationSwitcherItemStatus,
  type IntegrationSwitcherTab,
} from '@/components/shadcn-studio/card/integration-switcher';
import { Button } from '@/components/ui/button';
import { useBrandIntegrations } from '@/hooks/useBrandIntegrations';
import { getMemberDisplayName } from '@/lib/brands/memberDisplay';
import type { BrandIntegrationSummary } from '@/lib/integrations/brandProfile';
import type { BrandMember } from '@/lib/onboarding/state';
import { PLATFORM_ICONS, PLATFORM_LABELS } from '../shell/platformIcons';

type BrandIntegrationsSwitcherProps = {
  initialSummary?: BrandIntegrationSummary;
  members: BrandMember[];
  currentUserId: string;
};

function statusFor(status: string | null): IntegrationSwitcherItemStatus {
  return status && status.toLowerCase() === 'active' ? 'checked' : 'copy';
}

function extractAssignedIntegrationAccountIds(summary?: BrandIntegrationSummary): string[] {
  if (!summary) return [];

  const ids = new Set<string>();
  (Object.keys(summary) as PlatformKey[]).forEach((platformKey) => {
    summary[platformKey]?.accounts.forEach((account) => {
      ids.add(account.integrationAccountId);
    });
  });

  return Array.from(ids);
}

export function BrandIntegrationsSwitcher({
  initialSummary,
  members,
  currentUserId,
}: BrandIntegrationsSwitcherProps) {
  const { activeBrandId } = useActiveBrandContext();
  const { integrations, isLoading, refresh } = useBrandIntegrations(activeBrandId, initialSummary);
  const [assignmentsOpen, setAssignmentsOpen] = useState(false);
  const resolvedSummary = integrations ?? initialSummary;

  const { tabs, data, hasAny } = useMemo(() => {
    const summary = resolvedSummary ?? null;
    if (!summary)
      return {
        tabs: [] as IntegrationSwitcherTab[],
        data: {} as IntegrationSwitcherData,
        hasAny: false,
      };

    const tabs: IntegrationSwitcherTab[] = [];
    const data: IntegrationSwitcherData = {};

    (Object.keys(summary) as PlatformKey[]).forEach((platformKey) => {
      const accounts = summary[platformKey]?.accounts ?? [];
      if (accounts.length === 0) return;

      tabs.push({
        id: platformKey,
        name: PLATFORM_LABELS[platformKey] ?? platformKey,
        icon: PLATFORM_ICONS[platformKey] ?? Plug,
      });

      data[platformKey] = accounts.map<IntegrationSwitcherItem>((account) => {
        const isTeammate = account.ownerUserId !== null && account.ownerUserId !== currentUserId;
        return {
          id:
            account.externalAccountId ?? account.alias ?? account.integrationAccountId.slice(0, 6),
          title: account.name || account.alias || 'Unnamed account',
          icon: PLATFORM_ICONS[platformKey] ?? Plug,
          status: statusFor(account.status),
          subtitle: isTeammate
            ? `Tagged by ${getMemberDisplayName(members, account.ownerUserId)}`
            : undefined,
        };
      });
    });

    return { tabs, data, hasAny: tabs.length > 0 };
  }, [resolvedSummary, members, currentUserId]);

  const assignedIds = useMemo(
    () => extractAssignedIntegrationAccountIds(resolvedSummary),
    [resolvedSummary],
  );

  const openAssignments = () => setAssignmentsOpen(true);

  const assignButton = (
    <Button
      variant="outline"
      size="sm"
      className="gap-1"
      onClick={openAssignments}
      disabled={!activeBrandId || isLoading}
    >
      <Plus className="h-4 w-4" />
      Assign accounts
    </Button>
  );

  return (
    <>
      {hasAny ? (
        <div className="space-y-3">
          <IntegrationSwitcher
            integrations={tabs}
            data={data}
            className="max-w-none"
            tabBarTrailing={assignButton}
          />
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 px-5 py-10 text-center">
          <Plug className="mx-auto mb-2 h-5 w-5 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium text-foreground">No integrations assigned</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            Assign provider accounts to this brand to surface them across the app.
          </p>
          <div className="mt-4 inline-block">{assignButton}</div>
        </div>
      )}

      {activeBrandId ? (
        <AssignmentsDialog
          open={assignmentsOpen}
          onOpenChange={setAssignmentsOpen}
          brandProfileId={activeBrandId}
          summary={resolvedSummary ?? ({} as BrandIntegrationSummary)}
          assignedIds={assignedIds}
          members={members}
          currentUserId={currentUserId}
          onSaved={async () => {
            await refresh();
          }}
        />
      ) : null}
    </>
  );
}

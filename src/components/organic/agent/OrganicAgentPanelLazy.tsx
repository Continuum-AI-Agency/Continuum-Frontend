'use client';

import dynamic from 'next/dynamic';
import type { OrganicAgentMentionContext } from './OrganicAgentPanel';

const OrganicAgentPanelDynamic = dynamic(
  () =>
    import('@/components/organic/agent/OrganicAgentPanel').then((m) => ({
      default: m.OrganicAgentPanel,
    })),
  { ssr: false },
);

type OrganicAgentPanelLazyProps = {
  brandId: string;
  platformAccountIds: Record<string, string>;
  platformAccountOptions?: Record<string, Array<{ id: string; label: string }>>;
  mentionContext?: OrganicAgentMentionContext;
  initialSessionId?: string | null;
};

export function OrganicAgentPanelLazy(props: OrganicAgentPanelLazyProps) {
  return <OrganicAgentPanelDynamic {...props} />;
}

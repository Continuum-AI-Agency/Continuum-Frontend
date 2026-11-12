'use client';
import { useTranslations } from 'next-intl';

import { InspirationBrowser } from '@/components/competitors/InspirationBrowser';
import { Panel } from '@/components/shared/Panel';
import { CompetitorSpyLink } from './CompetitorSpyLink';

// What the watched competitors are posting organically, as a compact thumbnail
// grid that expands on hover. The shared InspirationBrowser adds an inline source
// toggle, on-demand Sync, per-competitor health summary, and Save-to-board on
// each card; the full workspace is one click away.
export function CompetitorOrganicTable({ brandId }: { brandId: string }) {
  const uiText = useTranslations('dashboard');
  return (
    <Panel
      title={uiText('competitor_organic_6086eac')}
      className="h-full"
      bodyClassName="flex flex-col"
      action={<CompetitorSpyLink href="/competitor-spy?tab=inspiration" />}
    >
      <InspirationBrowser
        brandId={brandId}
        defaultSource="organic"
        variant="compact"
        showSync
        feedLimit={18}
        gridClassName="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-3 xl:grid-cols-4 gap-2"
      />
    </Panel>
  );
}

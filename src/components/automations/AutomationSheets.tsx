'use client';

// One-line mount for a chat surface: both automation Sheets plus the email
// deep-link reader (?automation=<id>&run=<runId> opens the detail sheet once).
// Mounts nothing while Automations ships dark in production — the outer/inner
// split keeps the availability gate ahead of the hooks.

import type { AgentTarget } from '@continuum/contracts';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useAutomationSheetStore } from '@/lib/automations/sheet-store';
import { AutomationBuilderSheet } from './AutomationBuilderSheet';
import { AutomationDetailSheet } from './AutomationDetailSheet';

type AutomationSheetsProps = {
  agent: AgentTarget;
  brandId: string | null;
};

export function AutomationSheets(props: AutomationSheetsProps) {
  return <AutomationSheetsInner {...props} />;
}

function AutomationSheetsInner({ agent, brandId }: AutomationSheetsProps) {
  const openDetail = useAutomationSheetStore((state) => state.openDetail);
  const searchParams = useSearchParams();
  const consumedDeepLink = useRef(false);

  useEffect(() => {
    if (consumedDeepLink.current) return;
    const automationId = searchParams.get('automation');
    if (!automationId) return;
    consumedDeepLink.current = true;
    openDetail(automationId, searchParams.get('run') ?? undefined);
  }, [searchParams, openDetail]);

  return (
    <>
      <AutomationBuilderSheet agent={agent} brandId={brandId} />
      <AutomationDetailSheet agent={agent} brandId={brandId} />
    </>
  );
}

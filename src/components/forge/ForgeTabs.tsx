'use client';

import { useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { ForgeWorkbench } from '@/components/forge/ForgeWorkbench';
import {
  PendingApprovals,
  useRenderApprovals,
  waitingCount,
} from '@/components/forge/PendingApprovals';
import { templateListQuery } from '@/components/forge/queryKeys';
import type { ForgeRenderIntent, ForgeTemplateIntent } from '@/components/forge/RenderRequestsGrid';
import { confirmForgeExit } from '@/components/forge/useForgeExitGuard';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const RenderRequestsGrid = dynamic(() =>
  import('@/components/forge/RenderRequestsGrid').then((module) => module.RenderRequestsGrid),
);
const RenderJobsGrid = dynamic(() =>
  import('@/components/forge/RenderJobsGrid').then((module) => module.RenderJobsGrid),
);

// The three things a person does on Forge, as three tabs: make a template, set up renders
// against a published one, and watch them come back. A render request is against a PUBLISHED
// template — including ones that never came through the Library — so the grids do not live
// inside the workbench's "selected upload" branch, and a spreadsheet wants the full width.
//
// Approvals are the ledger's: a finished render waits there for a person before it becomes an ad.
// The ledger tab carries the waiting count, so nothing waits unseen from the Templates tab.

type ForgeTab = 'templates' | 'render' | 'renders';

// `min-w-0` down the chain: a flex child's minimum width is its content's, so without it one wide
// row (a long file name, a wide grid) widens the whole page instead of scrolling inside its panel.
const PANEL = 'min-h-0 min-w-0 overflow-y-auto overscroll-contain pt-2';

export function ForgeTabs({
  brandId,
  brandName,
  metaWritesAllowed,
}: {
  brandId: string;
  brandName?: string;
  /** The brand's arming switch for real Meta writes, read by the page beside its control. */
  metaWritesAllowed?: boolean;
}) {
  const [tab, setTab] = useState<ForgeTab>('templates');
  const [visited, setVisited] = useState<ReadonlySet<ForgeTab>>(() => new Set(['templates']));
  // The Render picker's list is the slowest read on the page; start it now, not on first visit.
  const queryClient = useQueryClient();
  useEffect(() => {
    void queryClient.prefetchQuery(templateListQuery(brandId));
  }, [brandId, queryClient]);
  const activate = (next: ForgeTab, after?: () => void) => {
    void confirmForgeExit().then((allowed) => {
      if (!allowed) return;
      setVisited((current) => (current.has(next) ? current : new Set(current).add(next)));
      setTab(next);
      after?.();
    });
  };
  // The last "open this in Render" from anywhere on the page, until the grid takes it. Dropped
  // once taken: an intent kept around would replace whatever the person moved on to.
  const [renderIntent, setRenderIntent] = useState<ForgeRenderIntent | undefined>(undefined);
  const openRender = (intent: ForgeRenderIntent) => {
    activate('render', () => setRenderIntent(intent));
  };
  // The way back: a template opened from the Render tab, held until the workbench takes it.
  const [templateIntent, setTemplateIntent] = useState<ForgeTemplateIntent | undefined>(undefined);
  const openTemplate = (intent: ForgeTemplateIntent) => {
    activate('templates', () => setTemplateIntent(intent));
  };
  // The approval notification links to `/forge#approvals`. A hash never reaches the server, so the
  // ledger opens after mount.
  useEffect(() => {
    if (window.location.hash !== '#approvals') return;
    setVisited((current) => new Set(current).add('renders'));
    setTab('renders');
  }, []);
  const approvalQuery = useRenderApprovals(brandId);
  const waiting = waitingCount(approvalQuery.data);
  const approvalCountUnavailable = approvalQuery.isError && waiting === undefined;
  const approvalStatus =
    approvalQuery.data === undefined
      ? approvalQuery.isError
        ? 'unavailable'
        : 'checking'
      : approvalQuery.isError
        ? 'stale'
        : null;
  return (
    // Bounded by the page: the strip stays put and each panel scrolls on its own.
    <Tabs
      value={tab}
      onValueChange={(next) => activate(next as ForgeTab)}
      className="min-h-0 min-w-0 flex-1"
    >
      <TabsList className="shrink-0">
        <TabsTrigger value="templates">Templates</TabsTrigger>
        <TabsTrigger value="render">Render</TabsTrigger>
        <TabsTrigger value="renders">
          Render ledger
          {approvalCountUnavailable ? (
            <Badge variant="warning" className="ml-1.5" title="Approval count unavailable">
              Approval count unavailable
            </Badge>
          ) : waiting ? (
            <Badge variant="warning" className="ml-1.5 tabular-nums">
              {waiting}
              <span className="sr-only"> waiting for approval</span>
            </Badge>
          ) : null}
          {approvalStatus === 'unavailable' ? (
            <Badge
              variant="destructive"
              className="ml-1.5"
              title="Approval count unavailable. Open the ledger and retry to check pending work."
            >
              ?<span className="sr-only"> Approval count unavailable</span>
            </Badge>
          ) : null}
          {approvalStatus === 'checking' ? (
            <Badge variant="muted" className="ml-1.5" title="Checking approval count">
              …<span className="sr-only"> Checking approval count</span>
            </Badge>
          ) : null}
          {approvalStatus === 'stale' ? (
            <span
              className="ml-1.5 text-xs text-muted-foreground"
              title="Approval count may be stale"
            >
              stale
            </span>
          ) : null}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="templates" className={PANEL}>
        <ForgeWorkbench
          key={brandId}
          brandId={brandId}
          brandName={brandName}
          onOpenRender={openRender}
          templateIntent={templateIntent}
          onTemplateIntentConsumed={() => setTemplateIntent(undefined)}
        />
      </TabsContent>
      {/* Kept mounted: unsaved rows live in the grid, and a tab round trip must not reload them. */}
      {visited.has('render') ? (
        <TabsContent value="render" keepMounted className={PANEL}>
          <RenderRequestsGrid
            key={brandId}
            brandId={brandId}
            metaWritesAllowed={metaWritesAllowed}
            active={tab === 'render'}
            intent={renderIntent}
            onIntentConsumed={() => setRenderIntent(undefined)}
            onFired={() => activate('renders')}
            onOpenTemplate={openTemplate}
          />
        </TabsContent>
      ) : null}
      {visited.has('renders') ? (
        <TabsContent value="renders" className={PANEL}>
          <div key={brandId} className="flex min-w-0 flex-col gap-4">
            <PendingApprovals brandId={brandId} />
            <RenderJobsGrid brandId={brandId} active={tab === 'renders'} />
          </div>
        </TabsContent>
      ) : null}
    </Tabs>
  );
}

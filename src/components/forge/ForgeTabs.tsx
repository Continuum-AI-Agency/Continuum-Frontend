'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { ForgeWorkbench } from '@/components/forge/ForgeWorkbench';
import type { ForgeRenderIntent } from '@/components/forge/RenderRequestsGrid';
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

type ForgeTab = 'templates' | 'render' | 'renders';

// `min-w-0` down the chain: a flex child's minimum width is its content's, so without it one wide
// row (a long file name, a wide grid) widens the whole page instead of scrolling inside its panel.
const PANEL = 'min-h-0 min-w-0 overflow-y-auto overscroll-contain pt-2';

export function ForgeTabs({ brandId, brandName }: { brandId: string; brandName?: string }) {
  const [tab, setTab] = useState<ForgeTab>('templates');
  const [visited, setVisited] = useState<ReadonlySet<ForgeTab>>(() => new Set(['templates']));
  const activate = (next: ForgeTab) => {
    setVisited((current) => (current.has(next) ? current : new Set(current).add(next)));
    setTab(next);
  };
  // The last "open this in Render" from anywhere on the page, until the grid takes it. Dropped
  // once taken: an intent kept around would replace whatever the person moved on to.
  const [renderIntent, setRenderIntent] = useState<ForgeRenderIntent | undefined>(undefined);
  const openRender = (intent: ForgeRenderIntent) => {
    setRenderIntent(intent);
    activate('render');
  };
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
        <TabsTrigger value="renders">Render ledger</TabsTrigger>
      </TabsList>
      <TabsContent value="templates" className={PANEL}>
        <ForgeWorkbench
          key={brandId}
          brandId={brandId}
          brandName={brandName}
          onOpenRender={openRender}
        />
      </TabsContent>
      {/* Kept mounted: unsaved rows live in the grid, and a tab round trip must not reload them. */}
      {visited.has('render') ? (
        <TabsContent value="render" keepMounted className={PANEL}>
          <RenderRequestsGrid
            key={brandId}
            brandId={brandId}
            active={tab === 'render'}
            intent={renderIntent}
            onIntentConsumed={() => setRenderIntent(undefined)}
            onFired={() => activate('renders')}
          />
        </TabsContent>
      ) : null}
      {visited.has('renders') ? (
        <TabsContent value="renders" className={PANEL}>
          <RenderJobsGrid key={brandId} brandId={brandId} active={tab === 'renders'} />
        </TabsContent>
      ) : null}
    </Tabs>
  );
}

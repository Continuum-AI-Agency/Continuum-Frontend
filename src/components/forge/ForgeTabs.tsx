'use client';

import { useState } from 'react';
import { ForgeWorkbench } from '@/components/forge/ForgeWorkbench';
import { RenderJobsGrid } from '@/components/forge/RenderJobsGrid';
import { type ForgeRenderIntent, RenderRequestsGrid } from '@/components/forge/RenderRequestsGrid';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// The three things a person does on Forge, as three tabs: make a template, set up renders
// against a published one, and watch them come back. A render request is against a PUBLISHED
// template — including ones that never came through the Library — so the grids do not live
// inside the workbench's "selected upload" branch, and a spreadsheet wants the full width.

type ForgeTab = 'templates' | 'render' | 'renders';

const PANEL = 'min-h-0 overflow-y-auto overscroll-contain pt-2';

export function ForgeTabs({ brandId, brandName }: { brandId: string; brandName?: string }) {
  const [tab, setTab] = useState<ForgeTab>('templates');
  // The last "open this in Render" from anywhere on the page, until the grid takes it. Dropped
  // once taken: an intent kept around would replace whatever the person moved on to.
  const [renderIntent, setRenderIntent] = useState<ForgeRenderIntent | undefined>(undefined);
  const openRender = (intent: ForgeRenderIntent) => {
    setRenderIntent(intent);
    setTab('render');
  };
  return (
    // Bounded by the page: the strip stays put and each panel scrolls on its own.
    <Tabs value={tab} onValueChange={(next) => setTab(next as ForgeTab)} className="min-h-0 flex-1">
      <TabsList className="shrink-0">
        <TabsTrigger value="templates">Templates</TabsTrigger>
        <TabsTrigger value="render">Render</TabsTrigger>
        <TabsTrigger value="renders">Renders</TabsTrigger>
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
      <TabsContent value="render" keepMounted className={PANEL}>
        <RenderRequestsGrid
          key={brandId}
          brandId={brandId}
          intent={renderIntent}
          onIntentConsumed={() => setRenderIntent(undefined)}
          onFired={() => setTab('renders')}
        />
      </TabsContent>
      <TabsContent value="renders" className={PANEL}>
        <RenderJobsGrid key={brandId} brandId={brandId} active={tab === 'renders'} />
      </TabsContent>
    </Tabs>
  );
}

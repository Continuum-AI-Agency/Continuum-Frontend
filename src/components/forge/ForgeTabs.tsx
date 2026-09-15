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

export function ForgeTabs({ brandId }: { brandId: string }) {
  const [tab, setTab] = useState<ForgeTab>('templates');
  // The last "open this in Render" from anywhere on the page. Kept, not consumed: the Render
  // panel unmounts when hidden, and remounting should land on what was last asked for.
  const [renderIntent, setRenderIntent] = useState<ForgeRenderIntent | undefined>(undefined);
  const openRender = (intent: ForgeRenderIntent) => {
    setRenderIntent(intent);
    setTab('render');
  };
  return (
    <Tabs value={tab} onValueChange={(next) => setTab(next as ForgeTab)}>
      <TabsList className="mb-4">
        <TabsTrigger value="templates">Templates</TabsTrigger>
        <TabsTrigger value="render">Render</TabsTrigger>
        <TabsTrigger value="renders">Renders</TabsTrigger>
      </TabsList>
      <TabsContent value="templates">
        <ForgeWorkbench key={brandId} brandId={brandId} onOpenRender={openRender} />
      </TabsContent>
      <TabsContent value="render">
        <RenderRequestsGrid
          key={brandId}
          brandId={brandId}
          intent={renderIntent}
          onFired={() => setTab('renders')}
        />
      </TabsContent>
      <TabsContent value="renders">
        <RenderJobsGrid key={brandId} brandId={brandId} active={tab === 'renders'} />
      </TabsContent>
    </Tabs>
  );
}

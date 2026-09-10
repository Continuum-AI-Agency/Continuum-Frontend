'use client';

import { useState } from 'react';
import { ForgeWorkbench } from '@/components/forge/ForgeWorkbench';
import { RenderJobsGrid } from '@/components/forge/RenderJobsGrid';
import { RenderRequestsGrid } from '@/components/forge/RenderRequestsGrid';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// The three things a person does on Forge, as three tabs: make a template, set up renders
// against a published one, and watch them come back. A render request is against a PUBLISHED
// template — including ones that never came through the Library — so the grids do not live
// inside the workbench's "selected upload" branch, and a spreadsheet wants the full width.

type ForgeTab = 'templates' | 'render' | 'renders';

export function ForgeTabs({ brandId }: { brandId: string }) {
  const [tab, setTab] = useState<ForgeTab>('templates');
  return (
    <Tabs value={tab} onValueChange={(next) => setTab(next as ForgeTab)}>
      <TabsList className="mb-4">
        <TabsTrigger value="templates">Templates</TabsTrigger>
        <TabsTrigger value="render">Render</TabsTrigger>
        <TabsTrigger value="renders">Renders</TabsTrigger>
      </TabsList>
      <TabsContent value="templates">
        <ForgeWorkbench brandId={brandId} />
      </TabsContent>
      <TabsContent value="render">
        <RenderRequestsGrid brandId={brandId} onFired={() => setTab('renders')} />
      </TabsContent>
      <TabsContent value="renders">
        <RenderJobsGrid brandId={brandId} active={tab === 'renders'} />
      </TabsContent>
    </Tabs>
  );
}

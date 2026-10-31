// The browser half of `canvas:e2e:bench`: real Frontend components fed the captured Backend
// parts through the real projection, one scene per URL hash. The bench (canvas-e2e.bench.ts)
// bundles this with Bun, styles it with the app's own Tailwind, and asserts the rendered DOM.

import type { LiveChangePreviewPayload } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactFlowProvider } from '@xyflow/react';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { CampaignCanvas } from '@/CampaignCanvas/components/CampaignCanvas';
import { LiveChangeCanvas } from '@/CampaignCanvas/LiveChangeCanvas';
import { LiveChangeCompanion } from '@/CampaignCanvas/LiveChangeCompanion';
import { LiveChangeChatCard } from '@/CampaignCanvas/lectura/LiveChangeChatCard';
import { StoreLectura } from '@/CampaignCanvas/lectura/StoreLectura';
import { useCampaignStore } from '@/CampaignCanvas/stores/useCampaignStore';
import { JainaCampaignStructure } from '@/components/paid-media/jaina/blocks/JainaCampaignStructure';
import { PaidScaffoldCard } from '@/components/paid-media/jaina/scaffold/PaidScaffoldCard';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { latestStructureDiffFor } from '@/lib/campaign-canvas/scaffoldDiff';
import {
  type DuplicateCapture,
  hydratedCopyOf,
  type LiveChangeCapture,
  projectTurn,
} from './canvasBenchPath';

type BenchData = {
  live: Record<string, LiveChangeCapture>;
  copy: DuplicateCapture;
  /** Hand-built Google previews (no Google live-change frame exists yet). */
  synthetic: Record<string, LiveChangePreviewPayload>;
};

const data = (window as unknown as { __CANVAS_BENCH__: BenchData }).__CANVAS_BENCH__;
const [group = '', key = '', view = ''] = location.hash.slice(1).split(':');
const noop = () => {};

const livePreviewOf = (capture: LiveChangeCapture): LiveChangePreviewPayload => {
  const preview = projectTurn(`msg_${key}`, capture.parts).liveChangePreviews?.at(-1);
  if (!preview) throw new Error(`the projection found no live change in ${key}`);
  return preview;
};

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="h-full w-full bg-background text-foreground">{children}</div>;
}

function ChatColumn({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-background p-3">
      <div className="mx-auto flex max-w-[640px] flex-col gap-3">{children}</div>
    </div>
  );
}

function LiveScene({ preview, mapOnly }: { preview: LiveChangePreviewPayload; mapOnly: boolean }) {
  if (view === 'chat') {
    return (
      <ChatColumn>
        <LiveChangeChatCard preview={preview} onOpen={noop} />
      </ChatColumn>
    );
  }
  // A phone never shows the companion's Map; the standalone canvas is the Map there.
  if (mapOnly) return <LiveChangeCanvas preview={preview} decision="pending" />;
  return <LiveChangeCompanion preview={preview} decision="pending" />;
}

/** The companion's body on a copy: the store hydrated from the rows, the diff from the chat. */
function CopyCanvas() {
  const message = React.useMemo(() => projectTurn('msg_copy', data.copy.parts), []);
  const graph = React.useMemo(() => hydratedCopyOf(data.copy), []);
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    useCampaignStore.getState().loadHydratedGraph(graph);
    setReady(true);
  }, [graph]);
  const structureDiff = latestStructureDiffFor([message], graph.hydration.scaffoldId);
  if (!ready) return null;
  return (
    <Frame>
      <div className="flex h-full min-h-0 flex-col" data-testid="copy-canvas">
        {view === 'read' ? (
          <StoreLectura structureDiff={structureDiff} />
        ) : (
          <ReactFlowProvider>
            <CampaignCanvas layout="columns" structureDiff={structureDiff} />
          </ReactFlowProvider>
        )}
      </div>
    </Frame>
  );
}

function CopyChat() {
  const message = React.useMemo(() => projectTurn('msg_copy', data.copy.parts), []);
  const structure = message.campaignStructures?.find((entry) => entry.layout === 'diff') ?? null;
  const scaffold = message.scaffold ?? null;
  const client = React.useMemo(() => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const graph = hydratedCopyOf(data.copy);
    // The card reads its rows by version id; seeded here exactly as the read would return them.
    queryClient.setQueryData(['paid-scaffold-tree', graph.hydration.versionId], {
      versionId: graph.hydration.versionId,
      rows: Object.values(graph.hydration.sourceRows),
      header: {
        scaffoldId: graph.hydration.scaffoldId,
        brandId: '',
        adAccountId: null,
        contentHash: graph.hydration.contentHash,
        name: graph.hydration.scaffoldName,
        version: graph.hydration.version,
        lifecycle: graph.hydration.lifecycle,
        plan: graph.hydration.plan,
        currentVersionId: graph.hydration.versionId,
      },
    });
    return queryClient;
  }, []);
  if (!structure || !scaffold) throw new Error('the projection found no copy proposal');
  return (
    <QueryClientProvider client={client}>
      <ChatColumn>
        {view === 'structure' ? <JainaCampaignStructure structure={structure} /> : null}
        {view === 'card' ? (
          <PaidScaffoldCard
            scaffold={scaffold}
            structure={structure}
            approval={null}
            resolution={null}
            denial={null}
            optimisticDecision={null}
            isStreaming={false}
            onDeploy={noop}
          />
        ) : null}
      </ChatColumn>
    </QueryClientProvider>
  );
}

function Scene() {
  if (group === 'live') {
    const capture = data.live[key];
    if (!capture) throw new Error(`no live capture ${key}`);
    return <LiveScene preview={livePreviewOf(capture)} mapOnly={view === 'map-only'} />;
  }
  if (group === 'synthetic') {
    const preview = data.synthetic[key];
    if (!preview) throw new Error(`no synthetic preview ${key}`);
    return <LiveScene preview={preview} mapOnly={view === 'map-only'} />;
  }
  if (group === 'copy' && (view === 'read' || view === 'map')) return <CopyCanvas />;
  if (group === 'copy') return <CopyChat />;
  throw new Error(`unknown scene ${location.hash}`);
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <ToastProvider>
    <Frame>
      <Scene />
    </Frame>
  </ToastProvider>,
);

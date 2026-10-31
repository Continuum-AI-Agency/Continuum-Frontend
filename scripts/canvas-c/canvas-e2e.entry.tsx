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
import { CanvasViewToggle, useCanvasView } from '@/CampaignCanvas/lectura/CanvasViewToggle';
import { LiveChangeChatCard } from '@/CampaignCanvas/lectura/LiveChangeChatCard';
import { StoreLectura } from '@/CampaignCanvas/lectura/StoreLectura';
import { PortfolioChatCard } from '@/CampaignCanvas/portfolio/PortfolioBand';
import { PortfolioCompanion } from '@/CampaignCanvas/portfolio/PortfolioCompanion';
import { useCampaignStore } from '@/CampaignCanvas/stores/useCampaignStore';
import {
  CampaignModelBody,
  useVersionLine,
  VersionLineBar,
} from '@/CampaignCanvas/versions/VersionLine';
import { JainaCampaignStructure } from '@/components/paid-media/jaina/blocks/JainaCampaignStructure';
import { PaidScaffoldCard } from '@/components/paid-media/jaina/scaffold/PaidScaffoldCard';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { latestLiveChangeOf } from '@/lib/campaign-canvas/liveChange';
import { portfolioOfMessage } from '@/lib/campaign-canvas/portfolio';
import { latestStructureDiffFor } from '@/lib/campaign-canvas/scaffoldDiff';
import { liveChangeVersionsOf, scaffoldVersionsOf } from '@/lib/campaign-canvas/versions';
import {
  composedLiveVersionThread,
  composedPortfolioTurn,
  type DuplicateCapture,
  derivedCopyVersionThread,
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

/** COMPOSED: two real ITESO approvals and the real AV CAMACHO copy, in one turn. */
function PortfolioScene() {
  const portfolio = React.useMemo(
    () => portfolioOfMessage(composedPortfolioTurn(data.live, data.copy)),
    [],
  );
  if (!portfolio) throw new Error('the composed turn is not a portfolio');
  if (view === 'chat') {
    return (
      <ChatColumn>
        <PortfolioChatCard portfolio={portfolio} onOpen={noop} />
      </ChatColumn>
    );
  }
  return <PortfolioCompanion portfolio={portfolio} />;
}

/** The ITESO thread (v1 pause, v2 raise — applied, SYNTHETIC — v3 placements), on its companion. */
function LiveVersionsScene() {
  const thread = React.useMemo(() => composedLiveVersionThread(data.live), []);
  const latest = latestLiveChangeOf(thread);
  if (!latest) throw new Error('the composed thread has no live change');
  const campaignId = latest.preview.nodes.find((node) => node.level === 'campaign')?.id ?? '';
  const versions = React.useMemo(
    () => liveChangeVersionsOf(thread, campaignId),
    [thread, campaignId],
  );
  return (
    <LiveChangeCompanion preview={latest.preview} decision={latest.decision} versions={versions} />
  );
}

/**
 * The real copy (v1) and its DERIVED v2, drawn the way the scaffold companion draws a version:
 * the line, Map / Read, and the version's model. The companion's record bar reads Supabase and
 * is not mounted here.
 */
function CopyVersionsScene() {
  const derived = React.useMemo(() => derivedCopyVersionThread(data.copy), []);
  const versions = React.useMemo(
    () => scaffoldVersionsOf(derived.thread, derived.parentScaffoldId),
    [derived],
  );
  const { view, setView } = useCanvasView('proposed');
  // The store would hold v1 (the canvas's current version) until v2 is loaded: v2 is drawn here.
  const state = useVersionLine(versions, derived.v2.scaffoldId);
  const shown = state.view;
  if (!shown) throw new Error('no version to show');
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="copy-versions">
      <div className="flex flex-wrap items-center justify-end gap-2 border-b border-border bg-card px-3 py-2">
        <CanvasViewToggle view={view} onChange={setView} />
        <VersionLineBar state={state} />
      </div>
      <div className="min-h-0 flex-1">
        <CampaignModelBody
          model={shown.model}
          view={view}
          drawKey={`${shown.version.id}:${shown.comparison ? 'c' : 'p'}`}
        />
      </div>
    </div>
  );
}

function Scene() {
  if (group === 'portfolio') return <PortfolioScene />;
  if (group === 'versions' && key === 'live') return <LiveVersionsScene />;
  if (group === 'versions' && key === 'copy') return <CopyVersionsScene />;
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

'use client';

import { ReactFlowProvider } from '@xyflow/react';
import { useMemo } from 'react';
import type { CanvasViewContext } from '@/lib/campaign-canvas/canvasView';
import { lecturaFromCanvasGraph } from '@/lib/campaign-canvas/lectura';
import { CanvasJainaContext, canvasJainaSending } from './canvasJaina';
import { CampaignCanvas } from './components/CampaignCanvas';
import { ScaffoldRecordBar } from './components/ScaffoldRecordBar';
import type { CanvasDeployRequest } from './hooks/useDeployRequest';
import { CanvasViewToggle, useCanvasView } from './lectura/CanvasViewToggle';
import { LecturaView } from './lectura/LecturaView';
import { useCampaignStore } from './stores/useCampaignStore';

const ignoreAdAccount = () => {};

/**
 * The canvas docked beside the Scale page's Jaina chat — the chat's companion. It shows the
 * scaffold the conversation is about (`scaffoldId`, from the chat's latest proposal), saves
 * versions the chat then follows, and hands Generate and Deploy to the chat beside it.
 *
 * No "Propose via Jaina" here: a save IS the new version, so re-proposing the graph through a
 * turn has nothing left to do. And the chat does not carry the canvas on every turn — that
 * would make every analytics question an operator turn.
 *
 * Two views of the same graph (design C): Map, the node graph to think and edit in, and Read,
 * the cards a person approves from. A scaffold Jaina just proposed opens in Read; a pane opened
 * by hand opens in Map; the person's own choice wins for each (`canvasView.ts`).
 */
export function ScaleCompanionCanvas({
  brandId,
  scaffoldId,
  onSend,
  onDeploy,
  deployInFlight,
  deployRefusal,
  viewContext = 'manual',
}: {
  brandId: string;
  scaffoldId: string | null;
  /** Puts a turn in the chat beside the canvas and sends it. */
  onSend: (text: string) => void;
  onDeploy: (request: CanvasDeployRequest) => void;
  deployInFlight: boolean;
  deployRefusal: string | null;
  /** Why the pane is open: a Jaina proposal opens in Read, anything else in Map. */
  viewContext?: CanvasViewContext;
}) {
  const canvasJaina = useMemo(() => canvasJainaSending(onSend), [onSend]);
  const { view, setView, isPhone } = useCanvasView(viewContext);
  return (
    <ReactFlowProvider>
      <CanvasJainaContext.Provider value={canvasJaina}>
        <div className="flex h-full w-full min-h-0 flex-col">
          <div className="flex flex-wrap items-center justify-center gap-2 border-b border-border/70 bg-background/85 px-3 py-2">
            <div className="flex min-w-0 flex-1 justify-center">
              <ScaffoldRecordBar
                brandId={brandId}
                requestedScaffoldId={scaffoldId}
                onAdAccountChange={ignoreAdAccount}
                onDeploy={onDeploy}
                deployInFlight={deployInFlight}
                deployRefusal={deployRefusal}
              />
            </div>
            <CanvasViewToggle view={view} onChange={setView} mapDisabled={isPhone} />
          </div>
          <div className="relative min-h-0 flex-1">
            {view === 'lectura' ? <StoreLectura /> : <CampaignCanvas layout="columns" />}
          </div>
        </div>
      </CanvasJainaContext.Provider>
    </ReactFlowProvider>
  );
}

/** Read, drawn from the same graph the Map edits — a save in one is what the other shows. */
function StoreLectura() {
  const nodes = useCampaignStore((store) => store.nodes);
  const edges = useCampaignStore((store) => store.edges);
  const model = useMemo(() => lecturaFromCanvasGraph(nodes, edges), [nodes, edges]);
  if (model.campaigns.length === 0) {
    return (
      <div className="grid h-full place-items-center p-6 text-center text-[13px] text-muted-foreground">
        No campaign on the canvas yet. When Jaina proposes one, it appears here.
      </div>
    );
  }
  return <LecturaView model={model} />;
}

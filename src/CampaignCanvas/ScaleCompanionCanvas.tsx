'use client';

import { ReactFlowProvider } from '@xyflow/react';
import { PencilLine } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import type { CanvasViewContext } from '@/lib/campaign-canvas/canvasView';
import type { ScaffoldStructureDiff } from '@/lib/campaign-canvas/scaffoldDiff';
import type { VersionLine } from '@/lib/campaign-canvas/versions';
import { CanvasJainaContext, canvasJainaSending } from './canvasJaina';
import { CampaignCanvas } from './components/CampaignCanvas';
import { ScaffoldRecordBar } from './components/ScaffoldRecordBar';
import type { CanvasDeployRequest } from './hooks/useDeployRequest';
import { CanvasViewHint, CanvasViewToggle, useCanvasView } from './lectura/CanvasViewToggle';
import { PlatformChip } from './lectura/LecturaView';
import { StoreLectura } from './lectura/StoreLectura';
import { useCampaignStore } from './stores/useCampaignStore';
import { CampaignModelBody, useVersionLine, VersionLineBar } from './versions/VersionLine';

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
 * the cards a person approves from. Auto mode by task (`canvasView.ts`): a scaffold Jaina just
 * proposed opens in Read; a scaffold picked from the record bar, Edit, or the first change to
 * a node opens the Map; the person's own pick per task kind wins over auto.
 */
export function ScaleCompanionCanvas({
  brandId,
  scaffoldId,
  onSend,
  onDeploy,
  deployInFlight,
  deployRefusal,
  viewContext = 'manual',
  viewTaskKey = 0,
  structureDiff = null,
  versions = null,
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
  /** A new value is a new task (another proposal): it ends editing and re-applies auto mode. */
  viewTaskKey?: number | string;
  /** The Backend's diff of a campaign copy, from the chat: exact marks on the copy's nodes. */
  structureDiff?: ScaffoldStructureDiff | null;
  /**
   * The scaffold's versions the thread drew (one structure part each), oldest first. An older
   * one, or one compared with the version before, is drawn read-only in place of the graph.
   */
  versions?: VersionLine | null;
}) {
  const canvasJaina = useMemo(() => canvasJainaSending(onSend), [onSend]);
  const { view, setView, isPhone, startEditing, openByHand, hint, dismissHint } = useCanvasView(
    viewContext,
    viewTaskKey,
  );
  // The first change to a node makes the task the person's: the Map, whatever opened it.
  const isDirty = useCampaignStore((store) => store.isDirty);
  const wasDirty = useRef(isDirty);
  useEffect(() => {
    if (isDirty && !wasDirty.current) startEditing();
    wasDirty.current = isDirty;
  }, [isDirty, startEditing]);
  const hasCampaign = useCampaignStore((store) => store.nodes.length > 0);
  const platform = useCampaignStore((store) => store.platform);
  const storeVersionId = useCampaignStore((store) => store.hydration?.versionId ?? null);
  // The line belongs to the scaffold on the canvas; another scaffold picked by hand has its own.
  const storeScaffoldId = useCampaignStore((store) => store.hydration?.scaffoldId ?? null);
  const versionLine = useVersionLine(
    versions && versions.key === storeScaffoldId ? versions : null,
    storeVersionId,
  );
  const shown = versionLine.active ? versionLine.view : null;
  const edit = () => {
    // Editing happens on the graph, which is the current version.
    versionLine.reset();
    startEditing();
  };
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
                onScaffoldPicked={openByHand}
              />
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {hasCampaign && platform === 'meta' ? <PlatformChip platform="meta" /> : null}
              {view === 'lectura' && hasCampaign && !isPhone ? (
                <button
                  type="button"
                  onClick={edit}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1 text-[13px] font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                  data-testid="canvas-edit"
                >
                  <PencilLine className="size-3.5" aria-hidden />
                  Edit
                </button>
              ) : null}
              <CanvasViewToggle view={view} onChange={setView} mapDisabled={isPhone} />
            </div>
            {hint ? (
              <div className="flex w-full justify-end">
                <CanvasViewHint hint={hint} onDismiss={dismissHint} />
              </div>
            ) : null}
            <VersionLineBar state={versionLine} />
          </div>
          <div className="relative min-h-0 flex-1">
            {shown ? (
              <CampaignModelBody
                model={shown.model}
                view={view}
                drawKey={`${shown.version.id}:${shown.comparison ? 'compare' : 'plain'}`}
              />
            ) : view === 'lectura' ? (
              <StoreLectura structureDiff={structureDiff} />
            ) : (
              <CampaignCanvas layout="columns" structureDiff={structureDiff} />
            )}
          </div>
        </div>
      </CanvasJainaContext.Provider>
    </ReactFlowProvider>
  );
}

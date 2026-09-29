'use client';

import { ReactFlowProvider } from '@xyflow/react';
import { useMemo } from 'react';
import { CanvasJainaContext, canvasJainaSending } from './canvasJaina';
import { CampaignCanvas } from './components/CampaignCanvas';
import { ScaffoldRecordBar } from './components/ScaffoldRecordBar';
import type { CanvasDeployRequest } from './hooks/useDeployRequest';

const ignoreAdAccount = () => {};

/**
 * The canvas docked beside the Scale page's Jaina chat — the chat's companion. It shows the
 * scaffold the conversation is about (`scaffoldId`, from the chat's latest proposal), saves
 * versions the chat then follows, and hands Generate and Deploy to the chat beside it.
 *
 * No "Propose via Jaina" here: a save IS the new version, so re-proposing the graph through a
 * turn has nothing left to do. And the chat does not carry the canvas on every turn — that
 * would make every analytics question an operator turn.
 */
export function ScaleCompanionCanvas({
  brandId,
  scaffoldId,
  onSend,
  onDeploy,
  deployInFlight,
  deployRefusal,
}: {
  brandId: string;
  scaffoldId: string | null;
  /** Puts a turn in the chat beside the canvas and sends it. */
  onSend: (text: string) => void;
  onDeploy: (request: CanvasDeployRequest) => void;
  deployInFlight: boolean;
  deployRefusal: string | null;
}) {
  const canvasJaina = useMemo(() => canvasJainaSending(onSend), [onSend]);
  return (
    <ReactFlowProvider>
      <CanvasJainaContext.Provider value={canvasJaina}>
        <div className="relative h-full w-full">
          <CampaignCanvas />
          <div className="pointer-events-none absolute top-3 right-3 left-3 z-40 flex justify-center">
            <ScaffoldRecordBar
              brandId={brandId}
              requestedScaffoldId={scaffoldId}
              onAdAccountChange={ignoreAdAccount}
              onDeploy={onDeploy}
              deployInFlight={deployInFlight}
              deployRefusal={deployRefusal}
            />
          </div>
        </div>
      </CanvasJainaContext.Provider>
    </ReactFlowProvider>
  );
}

'use client';

import { useCallback, useRef, useState } from 'react';
import type { OperatorActionRequestProp } from '@/components/paid-media/jaina/JainaChatSurface';
import type { OperatorActionOutcome } from '@/lib/jaina/operatorOutcome';

export type CanvasDeployRequest = {
  versionId: string;
  contentHash: string;
  name: string;
  version: number;
};

/**
 * The canvas's "Deploy paused", as a request the embedded Jaina panel carries out.
 *
 * ONE gate per version at a time: the request id is the version and its hash, and a second click
 * while the first is in flight is ignored rather than opening a second gate. The flight ends when
 * the panel reports the outcome — the gate opened, or the reason it did not, which is kept here
 * so the record bar can say it.
 */
export function useDeployRequest() {
  const [request, setRequest] = useState<OperatorActionRequestProp | null>(null);
  const [inFlight, setInFlight] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const inFlightId = useRef<string | null>(null);

  const requestDeploy = useCallback((deploy: CanvasDeployRequest): boolean => {
    const id = `deploy:${deploy.versionId}:${deploy.contentHash}`;
    if (inFlightId.current) return false;
    inFlightId.current = id;
    setInFlight(true);
    setRefusal(null);
    setRequest({
      id,
      action: {
        tool: 'paid_scaffold_deploy',
        input: { scaffold_version_id: deploy.versionId, content_hash: deploy.contentHash },
      },
      displayText: `Deploy paused: ${deploy.name} v${deploy.version}`,
    });
    return true;
  }, []);

  /** The panel took the request; it stays in flight until it settles. */
  const consumed = useCallback(() => setRequest(null), []);

  const settled = useCallback((id: string, outcome: OperatorActionOutcome) => {
    if (inFlightId.current !== id) return;
    inFlightId.current = null;
    setInFlight(false);
    setRefusal(outcome.ok ? null : outcome.reason);
  }, []);

  /** Ends a flight nobody will settle — the panel that would have carried it was closed. */
  const cancel = useCallback(
    (reason: string) => {
      const id = inFlightId.current;
      if (!id) return;
      setRequest(null);
      settled(id, { ok: false, reason });
    },
    [settled],
  );

  return { request, inFlight, refusal, requestDeploy, consumed, settled, cancel };
}

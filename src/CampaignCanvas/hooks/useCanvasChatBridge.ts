'use client';

import { useCallback, useMemo, useState } from 'react';
import { useActiveBrandContext } from '@/components/providers/ActiveBrandProvider';
import { buildCampaignCanvasPayload } from '@/lib/campaign-canvas/payload';
import { canvasJainaSending } from '../canvasJaina';
import { useCampaignStore } from '../stores/useCampaignStore';
import { type CanvasDeployRequest, useDeployRequest } from './useDeployRequest';

/**
 * The ask that "Propose via Jaina" puts in the composer.
 *
 * It is PRE-FILLED, not auto-sent. The canvas is a human's edit of a record, and the
 * turn it produces is the one thing that can reach Meta — so the person doing it reads
 * the request before it leaves, and can say more about what changed.
 */
const PROPOSE_PROMPT =
  'Propose the campaign on my canvas as a new paid scaffold. Use the structure and names in the canvas block below exactly as given.';

/**
 * What a host needs to seat a Jaina chat beside a canvas: the graph as the chat reads it,
 * and the three ways the canvas hands work to the chat — Propose (pre-filled), Deploy paused
 * (an operator action) and Generate with Jaina (sent, its spend still gated by an approval).
 *
 * `openChat` brings the chat into view; every hand-off calls it first, because each one
 * ends on something the person must see or answer there.
 */
export function useCanvasChatBridge({
  adAccountId,
  openChat,
}: {
  adAccountId: string | null;
  openChat: () => void;
}) {
  const { activeBrandId } = useActiveBrandContext();
  const nodes = useCampaignStore((store) => store.nodes);
  const edges = useCampaignStore((store) => store.edges);
  const hydration = useCampaignStore((store) => store.hydration);
  const deploy = useDeployRequest();
  const [initialPrompt, setInitialPrompt] = useState<string | null>(null);
  const [autoSendPrompt, setAutoSendPrompt] = useState<{ id: string; text: string } | null>(null);

  /**
   * The graph as a chat turn carries it. The try/catch is not decoration:
   * `buildCampaignCanvasPayload` parses its own output, and a graph it refuses must degrade
   * to a normal chat, never to a blank page.
   */
  const campaignCanvasPayload = useMemo(() => {
    try {
      return buildCampaignCanvasPayload(nodes, edges, {
        source: 'propose',
        brandProfileId: activeBrandId,
        adAccountId,
      });
    } catch {
      return null;
    }
  }, [nodes, edges, activeBrandId, adAccountId]);

  const propose = useCallback(() => {
    openChat();
    setInitialPrompt(
      hydration
        ? `${PROPOSE_PROMPT} It started as "${hydration.scaffoldName}" v${hydration.version}.`
        : PROPOSE_PROMPT,
    );
  }, [hydration, openChat]);

  const { requestDeploy } = deploy;
  const deployInChat = useCallback(
    (request: CanvasDeployRequest) => {
      if (!requestDeploy(request)) return;
      openChat();
    },
    [openChat, requestDeploy],
  );

  const canvasJaina = useMemo(
    () =>
      canvasJainaSending((text) => {
        openChat();
        setAutoSendPrompt({ id: crypto.randomUUID(), text });
      }),
    [openChat],
  );

  const onInitialPromptConsumed = useCallback(() => setInitialPrompt(null), []);
  const onAutoSendConsumed = useCallback(() => setAutoSendPrompt(null), []);

  return {
    campaignCanvasPayload,
    deploy,
    propose,
    deployInChat,
    canvasJaina,
    chatProps: {
      initialPrompt,
      onInitialPromptConsumed,
      autoSendPrompt,
      onAutoSendConsumed,
      operatorActionRequest: deploy.request,
      onOperatorActionConsumed: deploy.consumed,
      onOperatorActionSettled: deploy.settled,
    },
  };
}

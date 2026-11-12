'use client';

import { ReactFlowProvider } from '@xyflow/react';
import {
  ArrowLeft,
  Bot,
  GripHorizontal,
  Maximize2,
  MessageSquareText,
  Minimize2,
  X,
} from 'lucide-react';
import { AnimatePresence, motion, useDragControls } from 'motion/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { JainaChatSurface } from '@/components/paid-media/jaina/JainaChatSurface';
import { useActiveBrandContext } from '@/components/providers/ActiveBrandProvider';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  buildCampaignCreativeRequest,
  type CampaignCreativeRequest,
} from '@/lib/campaign-canvas/creativeGeneration';
import { CanvasJainaContext } from './canvasJaina';
import { CampaignCanvas } from './components/CampaignCanvas';
import { CampaignCreativeActionsProvider } from './components/CampaignCreativeActions';
import { ScaffoldRecordBar } from './components/ScaffoldRecordBar';
import { useCanvasChatBridge } from './hooks/useCanvasChatBridge';
import { CanvasViewToggle, useCanvasView } from './lectura/CanvasViewToggle';
import { StoreLectura } from './lectura/StoreLectura';
import { useCampaignStore } from './stores/useCampaignStore';

/** The room Read leaves above itself for the floating bar: the bar's bottom edge plus a gap. */
export const barClearancePx = (bar: { offsetTop: number; offsetHeight: number }): number =>
  Math.ceil(bar.offsetTop + bar.offsetHeight + 12);

/**
 * The floating bar is one row on a wide screen, two with a loaded proposal, and wraps further on
 * a phone; Read (drawn under it) needs its live height, so the page measures it as it changes.
 */
function useBarClearance(bar: React.RefObject<HTMLDivElement | null>): number | null {
  const [clearance, setClearance] = useState<number | null>(null);
  useEffect(() => {
    const element = bar.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const update = () => setClearance(barClearancePx(element));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [bar]);
  return clearance;
}

/** Where "Back to chat" leads: the thread that opened this canvas, else the Jaina tab. */
export const jainaThreadHref = (sessionId: string | null): string =>
  sessionId ? `/scale?tab=jaina&sessionId=${encodeURIComponent(sessionId)}` : '/scale?tab=jaina';

const CampaignFlowCanvasPage = ({
  requestedScaffoldId = null,
  requestedSessionId = null,
}: {
  /** From `?scaffold=`: the scaffold a Jaina card asked this canvas to load. */
  requestedScaffoldId?: string | null;
  /** From `?session=`: the Jaina thread that card sits in. */
  requestedSessionId?: string | null;
}) => {
  const uiText = useTranslations('scale');
  const [isJainaOpen, setIsJainaOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [creativeRequest, setCreativeRequest] = useState<CampaignCreativeRequest | null>(null);
  const [adAccountId, setAdAccountId] = useState<string | null>(null);
  const dragControls = useDragControls();
  // The full page is where people build by hand: auto opens the Map, Read is one click away,
  // and the pick is remembered with the companion's own manual pick (canvasView.ts).
  const { view, setView, isPhone, startEditing, openByHand } = useCanvasView('manual');
  const isDirty = useCampaignStore((store) => store.isDirty);
  React.useEffect(() => {
    if (isDirty) startEditing();
  }, [isDirty, startEditing]);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const barClearance = useBarClearance(barRef);

  const { activeBrandId, brandSummaries, user } = useActiveBrandContext();
  const brandName = useMemo(
    () => brandSummaries.find((brand) => brand.id === activeBrandId)?.name ?? 'Untitled brand',
    [activeBrandId, brandSummaries],
  );

  /**
   * Every hand-off opens the panel MAXIMIZED, because each ends on something to answer: a
   * propose or generate turn stops on an approval card whose Approve/Deny footer sits behind
   * the conversations sidebar at the 420px floating width — rendered, but out of reach.
   */
  const openChat = useCallback(() => {
    setIsJainaOpen(true);
    setIsMaximized(true);
  }, []);
  const bridge = useCanvasChatBridge({ adAccountId, openChat });
  const { deploy } = bridge;

  // Closing the panel unmounts the chat that would settle the request.
  const { cancel: cancelDeploy, inFlight: deployInFlight } = deploy;
  React.useEffect(() => {
    if (!isJainaOpen && deployInFlight) {
      cancelDeploy('The Jaina panel was closed before the approval opened. Deploy again.');
    }
  }, [cancelDeploy, deployInFlight, isJainaOpen]);

  const handleGenerateCreative = useCallback(
    async (nodeId: string) => {
      if (!activeBrandId || !adAccountId) throw new Error('Select a brand and ad account first.');
      const request = await buildCampaignCreativeRequest({
        ...useCampaignStore.getState(),
        nodeId,
        brandId: activeBrandId,
        adAccountId,
      });
      setCreativeRequest(request);
      setIsJainaOpen(true);
      setIsMaximized(true);
    },
    [activeBrandId, adAccountId],
  );

  const chatDimensions = useMemo(
    () => ({
      width: isMaximized ? 'min(94vw, 980px)' : 'min(92vw, 420px)',
      height: isMaximized ? 'min(88vh, 880px)' : 'min(75vh, 620px)',
    }),
    [isMaximized],
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background font-sans">
      <ReactFlowProvider>
        {/* Main Canvas Area */}
        <div ref={canvasContainerRef} className="relative flex-1 h-full w-full">
          {/* The record this canvas is showing, and the one way forward from it. */}
          {/* A phone wraps the bar inside the screen; centring it there pushed Back to chat
              and the Map/Read switch off both edges. */}
          <div
            ref={barRef}
            className="pointer-events-none absolute inset-x-2 top-3 z-40 flex flex-wrap items-start justify-center gap-2 lg:inset-x-auto lg:left-1/2 lg:flex-nowrap lg:-translate-x-1/2"
          >
            {/* Back to the conversation this canvas was opened from. */}
            <Link
              href={jainaThreadHref(requestedSessionId)}
              className={buttonVariants({
                variant: 'outline',
                size: 'sm',
                className:
                  'pointer-events-auto shrink-0 gap-1.5 bg-background/90 shadow-sm backdrop-blur',
              })}
              data-testid="canvas-back-to-chat"
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              {uiText('back_to_chat_5978844')}
            </Link>
            <ScaffoldRecordBar
              brandId={activeBrandId}
              requestedScaffoldId={requestedScaffoldId}
              onAdAccountChange={setAdAccountId}
              onPropose={bridge.propose}
              onDeploy={bridge.deployInChat}
              deployInFlight={deploy.inFlight}
              deployRefusal={deploy.refusal}
              onScaffoldPicked={openByHand}
            />
            <div className="pointer-events-auto shrink-0 rounded-lg bg-background/90 shadow-sm backdrop-blur">
              <CanvasViewToggle view={view} onChange={setView} mapDisabled={isPhone} />
            </div>
          </div>

          {view === 'lectura' ? (
            <div
              className="absolute inset-0 z-30 bg-background"
              data-testid="canvas-page-read"
              style={
                barClearance === null
                  ? undefined
                  : ({
                      '--canvas-bar-clearance': `${barClearance}px`,
                    } as React.CSSProperties)
              }
            >
              <StoreLectura size="page" />
            </div>
          ) : null}

          {/* The Map last in the DOM, so Tab reaches the bar before any node or edge; inert while
              Read covers it, so a keyboard never wanders through what it cannot see. */}
          <div className="h-full w-full" inert={view === 'lectura'}>
            <CanvasJainaContext.Provider value={bridge.canvasJaina}>
              <CampaignCreativeActionsProvider value={handleGenerateCreative}>
                <CampaignCanvas />
              </CampaignCreativeActionsProvider>
            </CanvasJainaContext.Provider>
          </div>

          {/* Jaina Floating Chat */}
          <AnimatePresence initial={false}>
            {isJainaOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 16 }}
                animate={{
                  opacity: 1,
                  scale: 1,
                  y: 0,
                  width: chatDimensions.width,
                  height: chatDimensions.height,
                }}
                exit={{ opacity: 0, scale: 0.98, y: 8 }}
                transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
                drag
                dragControls={dragControls}
                dragConstraints={canvasContainerRef}
                dragListener={false}
                dragMomentum={false}
                dragElastic={0.08}
                className="absolute bottom-20 right-4 z-50 flex flex-col overflow-hidden rounded-2xl border bg-background/80 shadow-2xl backdrop-blur-md transition-[background-color,border-color,box-shadow] duration-300 md:bottom-24 md:right-8"
                style={{ touchAction: 'none' }}
              >
                {/* Draggable Handle */}
                <div
                  className="flex h-12 w-full cursor-grab items-center justify-between border-b bg-muted/30 px-4 active:cursor-grabbing"
                  onPointerDown={(e) => dragControls.start(e)}
                >
                  <div className="flex items-center gap-2">
                    <GripHorizontal className="h-4 w-4 text-muted-foreground" />
                    <div className="flex items-center gap-1.5">
                      <Bot className="h-4 w-4 text-primary" />
                      <span className="text-xs font-bold uppercase tracking-widest opacity-80">
                        {uiText('jaina_analyst_b8dad55')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10"
                      aria-label={
                        isMaximized
                          ? uiText('minimize_chat_bdddf85')
                          : uiText('maximize_chat_50027c9')
                      }
                      onClick={() => setIsMaximized(!isMaximized)}
                    >
                      {isMaximized ? (
                        <Minimize2 className="h-3.5 w-3.5" />
                      ) : (
                        <Maximize2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 text-destructive hover:text-destructive hover:bg-destructive/10"
                      aria-label={uiText('close_chat_3b14c5d')}
                      onClick={() => setIsJainaOpen(false)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex-1 overflow-hidden p-1">
                  <JainaChatSurface
                    brandProfileId={activeBrandId}
                    brandName={brandName}
                    adAccountId={adAccountId}
                    userId={user?.id ?? null}
                    initialSessionId={requestedSessionId}
                    campaignCanvasPayload={bridge.campaignCanvasPayload}
                    {...bridge.chatProps}
                    requestedCreative={creativeRequest}
                    onCreativeRequestConsumed={() => setCreativeRequest(null)}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Jaina Toggle Button */}
          <div className="absolute bottom-4 right-4 z-50 md:bottom-8 md:right-8">
            <Button
              size="lg"
              variant={isJainaOpen ? 'outline' : 'default'}
              className={`relative h-14 w-14 rounded-full shadow-2xl transition-transform transition-shadow duration-200 ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.96] ${!isJainaOpen ? 'hover:scale-105' : ''}`}
              aria-label={isJainaOpen ? uiText('hide_jaina_fb1746c') : uiText('open_jaina_c8a1f3b')}
              onClick={() => setIsJainaOpen(!isJainaOpen)}
            >
              <MessageSquareText
                className={`absolute h-6 w-6 transition-[opacity,transform,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)] ${
                  isJainaOpen ? 'scale-[0.25] opacity-0 blur-[4px]' : 'scale-100 opacity-100 blur-0'
                }`}
              />
              <X
                className={`absolute h-6 w-6 transition-[opacity,transform,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)] ${
                  isJainaOpen ? 'scale-100 opacity-100 blur-0' : 'scale-[0.25] opacity-0 blur-[4px]'
                }`}
              />
            </Button>
          </div>
        </div>
      </ReactFlowProvider>
    </div>
  );
};

export default CampaignFlowCanvasPage;

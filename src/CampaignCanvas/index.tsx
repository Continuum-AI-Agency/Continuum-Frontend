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
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { JainaChatSurface } from '@/components/paid-media/jaina/JainaChatSurface';
import { useActiveBrandContext } from '@/components/providers/ActiveBrandProvider';
import { Button, buttonVariants } from '@/components/ui/button';
import { CanvasJainaContext } from './canvasJaina';
import { CampaignCanvas } from './components/CampaignCanvas';
import { ScaffoldRecordBar } from './components/ScaffoldRecordBar';
import { useCanvasChatBridge } from './hooks/useCanvasChatBridge';

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
  const [isJainaOpen, setIsJainaOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [adAccountId, setAdAccountId] = useState<string | null>(null);
  const dragControls = useDragControls();
  const canvasContainerRef = useRef<HTMLDivElement>(null);

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
          <CanvasJainaContext.Provider value={bridge.canvasJaina}>
            <CampaignCanvas />
          </CanvasJainaContext.Provider>

          {/* The record this canvas is showing, and the one way forward from it. */}
          <div className="pointer-events-none absolute top-3 left-1/2 z-40 flex -translate-x-1/2 items-start gap-2">
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
              Back to chat
            </Link>
            <ScaffoldRecordBar
              brandId={activeBrandId}
              requestedScaffoldId={requestedScaffoldId}
              onAdAccountChange={setAdAccountId}
              onPropose={bridge.propose}
              onDeploy={bridge.deployInChat}
              deployInFlight={deploy.inFlight}
              deployRefusal={deploy.refusal}
            />
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
                        Jaina Analyst
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10"
                      aria-label={isMaximized ? 'Minimize chat' : 'Maximize chat'}
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
                      aria-label="Close chat"
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
              aria-label={isJainaOpen ? 'Hide Jaina' : 'Open Jaina'}
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

'use client';
import { ReactFlowProvider } from '@xyflow/react';
import { Bot, GripHorizontal, Maximize2, MessageSquareText, Minimize2, X } from 'lucide-react';
import { AnimatePresence, motion, useDragControls } from 'motion/react';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { JainaChatSurface } from '@/components/paid-media/jaina/JainaChatSurface';
import { useActiveBrandContext } from '@/components/providers/ActiveBrandProvider';
import { Button } from '@/components/ui/button';
import { buildCampaignCanvasPayload } from '@/lib/campaign-canvas/payload';
import { CampaignCanvas } from './components/CampaignCanvas';
import { ScaffoldRecordBar } from './components/ScaffoldRecordBar';
import { useCampaignStore } from './stores/useCampaignStore';

/**
 * The ask that "Propose via Jaina" puts in the composer.
 *
 * It is PRE-FILLED, not auto-sent. The canvas is a human's edit of a record, and the
 * turn it produces is the one thing that can reach Meta — so the person doing it reads
 * the request before it leaves, and can say more about what changed.
 */
const PROPOSE_PROMPT =
  'Propose the campaign on my canvas as a new paid scaffold. Use the structure and names in the canvas block below exactly as given.';

const CampaignFlowCanvasPage = () => {
  const [isJainaOpen, setIsJainaOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [initialPrompt, setInitialPrompt] = useState<string | null>(null);
  const [adAccountId, setAdAccountId] = useState<string | null>(null);
  const dragControls = useDragControls();
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  const { activeBrandId, brandSummaries, user } = useActiveBrandContext();
  const brandName = useMemo(
    () => brandSummaries.find((brand) => brand.id === activeBrandId)?.name ?? 'Untitled brand',
    [activeBrandId, brandSummaries],
  );

  const nodes = useCampaignStore((store) => store.nodes);
  const edges = useCampaignStore((store) => store.edges);
  const hydration = useCampaignStore((store) => store.hydration);

  /**
   * The canvas rides along with every turn from THIS chat — it is the canvas page's
   * assistant, and a question about the graph is unanswerable without the graph. The
   * try/catch is not decoration: `buildCampaignCanvasPayload` parses its own output, and
   * a graph it refuses must degrade to a normal chat, never to a blank page.
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

  const handlePropose = useCallback(() => {
    setIsJainaOpen(true);
    // Maximized, because this flow ENDS in a decision. A propose turn finishes on an
    // approval card whose Approve/Deny footer sits behind the conversations sidebar at
    // the default 420px floating width — the buttons render, and the pointer never
    // reaches them. Opening at the wide size is what makes the gate answerable.
    setIsMaximized(true);
    setInitialPrompt(
      hydration
        ? `${PROPOSE_PROMPT} It started as "${hydration.scaffoldName}" v${hydration.version}.`
        : PROPOSE_PROMPT,
    );
  }, [hydration]);

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
          <CampaignCanvas />

          {/* The record this canvas is showing, and the one way forward from it. */}
          <div className="pointer-events-none absolute top-3 left-1/2 z-40 -translate-x-1/2">
            <ScaffoldRecordBar
              brandId={activeBrandId}
              onAdAccountChange={setAdAccountId}
              onPropose={handlePropose}
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
                    campaignCanvasPayload={campaignCanvasPayload}
                    initialPrompt={initialPrompt}
                    onInitialPromptConsumed={() => setInitialPrompt(null)}
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

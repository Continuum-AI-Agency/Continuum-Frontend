'use client';
import { ReactFlowProvider } from '@xyflow/react';
import { Bot, GripHorizontal, Maximize2, MessageSquareText, Minimize2, X } from 'lucide-react';
import { AnimatePresence, motion, useDragControls } from 'motion/react';
import React, { useMemo, useRef, useState } from 'react';
import { JainaChatSurface } from '@/components/paid-media/jaina/JainaChatSurface';
import { Button } from '@/components/ui/button';
import { CampaignCanvas } from './components/CampaignCanvas';

const CampaignFlowCanvasPage = () => {
  const [isJainaOpen, setIsJainaOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const dragControls = useDragControls();
  const canvasContainerRef = useRef<HTMLDivElement>(null);

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
                    brandProfileId="campaign-canvas-preview"
                    brandName="Continuum"
                    adAccountId={null}
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

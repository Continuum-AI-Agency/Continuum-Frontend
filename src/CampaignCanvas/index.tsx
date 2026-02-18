import React, { useState } from 'react';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { CampaignCanvas } from './components/CampaignCanvas';
import { CampaignChat } from './components/CampaignChat';
import { ReactFlowProvider } from '@xyflow/react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { JainaChatSurface } from '@/components/paid-media/jaina/JainaChatSurface';
import { Button } from '@/components/ui/button';
import { Bot, X, GripHorizontal, MessageSquareText, Maximize2, Minimize2 } from 'lucide-react';
import { Theme } from '@radix-ui/themes';

const CampaignFlowCanvasPage = () => {
  const [isJainaOpen, setIsJainaOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const dragControls = useDragControls();

  return (
    <Theme appearance="dark">
      <div className="flex h-screen w-screen overflow-hidden bg-background font-sans">
        <ReactFlowProvider>
          {/* Main Canvas Area */}
          <div className="relative flex-1 h-full w-full">
            <CampaignCanvas />
            
            {/* Jaina Floating Chat */}
            <AnimatePresence>
              {isJainaOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ 
                    opacity: 1, 
                    scale: 1, 
                    y: 0,
                    width: isMaximized ? '600px' : '400px',
                    height: isMaximized ? '800px' : '600px',
                  }}
                  exit={{ opacity: 0, scale: 0.9, y: 20 }}
                  drag
                  dragControls={dragControls}
                  dragListener={false}
                  dragMomentum={false}
                  className="absolute bottom-24 right-8 z-50 flex flex-col overflow-hidden rounded-2xl border bg-background/80 shadow-2xl backdrop-blur-md transition-all duration-300"
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
                        <span className="text-xs font-bold uppercase tracking-widest opacity-80">Jaina Analyst</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8" 
                        onClick={() => setIsMaximized(!isMaximized)}
                      >
                        {isMaximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" 
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
            <div className="absolute bottom-8 right-8 z-50">
              <Button 
                size="lg" 
                variant={isJainaOpen ? "outline" : "default"}
                className={`h-14 w-14 rounded-full shadow-2xl transition-all duration-300 ${!isJainaOpen ? 'hover:scale-110' : ''}`} 
                onClick={() => setIsJainaOpen(!isJainaOpen)}
              >
                {isJainaOpen ? <X className="h-6 w-6" /> : <MessageSquareText className="h-6 w-6" />}
              </Button>
            </div>
          </div>
        </ReactFlowProvider>
      </div>
    </Theme>
  );
};

export default CampaignFlowCanvasPage;

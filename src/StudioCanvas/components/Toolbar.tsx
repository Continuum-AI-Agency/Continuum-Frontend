import { Hash, Play, RotateCw, Square } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { ElementsPanel } from '@/components/ai-studio/elements/ElementsPanel';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useWorkflowExecution } from '../hooks/useWorkflowExecution';
import { useStudioStore } from '../stores/useStudioStore';
import { executeWorkflow } from '../utils/executeWorkflow';

export function Toolbar() {
  const translateUi = useUiTranslations('studio');

  const [isRunning, setIsRunning] = useState(false);
  const [elementsOpen, setElementsOpen] = useState(false);
  const { brandId } = useStudioStore();
  const executionControls = useWorkflowExecution();
  const { streamState, cancel, reset } = executionControls;
  const runIdRef = useRef(0);
  const lastRunRef = useRef<Promise<unknown>>(Promise.resolve());

  const run = async (options: { forceRegenerateAll?: boolean } = {}) => {
    console.warn('[studio] RUNFLOW-CLICK', { brandId, options });
    const runId = ++runIdRef.current;
    setIsRunning(true);
    try {
      // Abort latches cancel so an aborted run's remaining nodes do not start. Clear it only
      // once that run has settled, or its nodes would run alongside this one.
      await lastRunRef.current;
      if (runIdRef.current !== runId) return;
      reset();
      const current = executeWorkflow(executionControls, { brandId, ...options });
      lastRunRef.current = current.catch(() => undefined);
      await current;
    } finally {
      if (runIdRef.current === runId) setIsRunning(false);
    }
  };

  const handleRun = () => run();
  const handleRerunAll = () => run({ forceRegenerateAll: true });

  const handleAbort = () => {
    runIdRef.current += 1;
    cancel();
    setIsRunning(false);
  };

  return (
    <div className="flex gap-2 items-center">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label={translateUi('elements_e1ff7a90')}
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setElementsOpen(true)}
              >
                <Hash className="w-4 h-4" />
              </Button>
            }
          />
          <TooltipContent>
            {translateUi('elements_saved_models_products_and__238131c1')}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <ElementsPanel open={elementsOpen} onOpenChange={setElementsOpen} brandId={brandId} />
      {!isRunning ? (
        <div className="flex items-center gap-1">
          <Button data-tour-id="studio-run-flow" variant="default" size="sm" onClick={handleRun}>
            <Play className="w-4 h-4 mr-2" /> {translateUi('run_flow_63465f6d')}{' '}
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label={translateUi('rerun_all_e3645b88')}
                    variant="destructive"
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleRerunAll}
                  >
                    <RotateCw className="w-4 h-4" />
                  </Button>
                }
              />
              <TooltipContent>
                {translateUi('rerun_all_regenerate_every_node_fro_9dc09be6')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button variant="destructive" size="sm" onClick={handleAbort}>
            <Square className="w-4 h-4 mr-2" /> {translateUi('abort_7a3a94a8')}{' '}
          </Button>
          {streamState.progressPct !== undefined && (
            <div className="flex items-center gap-2 w-24">
              <Progress value={streamState.progressPct} className="h-2 w-full" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

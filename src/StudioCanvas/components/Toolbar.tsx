import { Play, RotateCw, Square } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useWorkflowExecution } from '../hooks/useWorkflowExecution';
import { useStudioStore } from '../stores/useStudioStore';
import { executeWorkflow } from '../utils/executeWorkflow';

export function Toolbar() {
  const [isRunning, setIsRunning] = useState(false);
  const { brandId } = useStudioStore();
  const executionControls = useWorkflowExecution();
  const { streamState, cancel } = executionControls;

  const run = async (options: { forceRegenerateAll?: boolean } = {}) => {
    setIsRunning(true);
    try {
      await executeWorkflow(executionControls, { brandId, ...options });
    } finally {
      setIsRunning(false);
    }
  };

  const handleRun = () => run();
  const handleRerunAll = () => run({ forceRegenerateAll: true });

  const handleAbort = () => {
    cancel();
    setIsRunning(false);
  };

  return (
    <div className="flex gap-2 items-center">
      {!isRunning ? (
        <div className="flex items-center gap-1">
          <Button data-tour-id="studio-run-flow" variant="default" size="sm" onClick={handleRun}>
            <Play className="w-4 h-4 mr-2" />
            Run Flow
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label="Rerun all"
                    variant="destructive"
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleRerunAll}
                  >
                    <RotateCw className="w-4 h-4" />
                  </Button>
                }
              />
              <TooltipContent>Rerun all — regenerate every node from scratch</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button variant="destructive" size="sm" onClick={handleAbort}>
            <Square className="w-4 h-4 mr-2" />
            Abort
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

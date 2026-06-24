import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { PlayIcon, StopIcon } from '@radix-ui/react-icons';
import { executeWorkflow } from '../utils/executeWorkflow';
import { useWorkflowExecution } from '../hooks/useWorkflowExecution';
import { useStudioStore } from '../stores/useStudioStore';
import { Progress } from '@/components/ui/progress';

export function Toolbar() {
  const [isRunning, setIsRunning] = useState(false);
  const { brandId } = useStudioStore();
  const executionControls = useWorkflowExecution();
  const { streamState, cancel } = executionControls;

  const handleRun = async () => {
      setIsRunning(true);
      try {
        await executeWorkflow(executionControls, { brandId });
      } finally {
        setIsRunning(false);
      }
  };

  const handleAbort = () => {
    cancel();
    setIsRunning(false);
  };

  return (
    <div className="flex gap-2 items-center">

      {!isRunning ? (
        <Button data-tour-id="studio-run-flow" variant="default" size="sm" onClick={handleRun}>
          <PlayIcon className="w-4 h-4 mr-2" />
          Run Flow
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          <Button variant="destructive" size="sm" onClick={handleAbort}>
            <StopIcon className="w-4 h-4 mr-2" />
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

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { PlayIcon, ReloadIcon, MinusIcon, ArrowRightIcon, CornersIcon, StopIcon } from '@radix-ui/react-icons';
import { executeWorkflow } from '../utils/executeWorkflow';
import { useWorkflowExecution } from '../hooks/useWorkflowExecution';
import { ExportDialog } from './ExportDialog';
import { ImportDialog } from './ImportDialog';
import { useStudioStore, type EdgeType } from '../stores/useStudioStore';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';

const EDGE_TYPE_OPTIONS: { value: EdgeType; label: string; icon: React.ReactNode }[] = [
  { value: 'bezier', label: 'Curve', icon: <CornersIcon className="w-3 h-3" /> },
  { value: 'straight', label: 'Straight', icon: <MinusIcon className="w-3 h-3" /> },
  { value: 'step', label: 'Step', icon: <ArrowRightIcon className="w-3 h-3 rotate-90" /> },
  { value: 'smoothstep', label: 'Square', icon: <ArrowRightIcon className="w-3 h-3" /> },
];

export function Toolbar() {
  const [isRunning, setIsRunning] = useState(false);
  const { defaultEdgeType, setDefaultEdgeType } = useStudioStore();
  const executionControls = useWorkflowExecution();
  const { streamState, cancel } = executionControls;

  const handleRun = async () => {
      setIsRunning(true);
      try {
        await executeWorkflow(executionControls);
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
      <Select value={defaultEdgeType} onValueChange={(v) => setDefaultEdgeType(v as EdgeType)}>
        <SelectTrigger className="h-8 w-24 text-xs" aria-label="Edge type">
          <SelectValue placeholder="Edge type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="bezier">Curve</SelectItem>
          <SelectItem value="straight">Straight</SelectItem>
          <SelectItem value="step">Step</SelectItem>
          <SelectItem value="smoothstep">Square</SelectItem>
        </SelectContent>
      </Select>
      
      <div className="w-px h-6 bg-border mx-1" />
      
      <ImportDialog />
      <ExportDialog />
      
      <div className="w-px h-6 bg-border mx-1" />
      
      {!isRunning ? (
        <Button variant="default" size="sm" onClick={handleRun}>
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

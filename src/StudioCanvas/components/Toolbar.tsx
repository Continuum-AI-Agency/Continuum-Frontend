import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Loader2 } from 'lucide-react';
import { executeFlow } from '../utils/executeFlow';
import { ExportDialog } from './ExportDialog';
import { ImportDialog } from './ImportDialog';

export function Toolbar() {
  const [isRunning, setIsRunning] = useState(false);

  const handleRun = async () => {
      setIsRunning(true);
      await executeFlow();
      setIsRunning(false);
  };

  return (
    <div className="flex gap-2">
      <ImportDialog />
      <ExportDialog />
      <div className="w-px h-6 bg-border mx-1" />
      <Button variant="default" size="sm" onClick={handleRun} disabled={isRunning}>
        {isRunning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />} 
        Run Flow
      </Button>
    </div>
  );
}

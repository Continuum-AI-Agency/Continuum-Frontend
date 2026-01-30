import React from 'react';
import { Button } from '@/components/ui/button';
import { HandIcon, CursorArrowIcon } from '@radix-ui/react-icons';
import { useStudioStore } from '../stores/useStudioStore';

export function InteractionModeToggle() {
  const { interactionMode, setInteractionMode } = useStudioStore();

  return (
    <div className="flex bg-background/80 backdrop-blur-sm rounded-lg p-1 border border-border shadow-sm gap-1">
      <Button
        variant={interactionMode === 'pan' ? 'secondary' : 'ghost'}
        size="icon"
        className={`h-8 w-8 transition-all ${interactionMode === 'pan' ? 'shadow-sm bg-background' : ''}`}
        onClick={() => setInteractionMode('pan')}
        title="Pan Mode (H)"
      >
        <HandIcon className="w-4 h-4" />
      </Button>
      <Button
        variant={interactionMode === 'select' ? 'secondary' : 'ghost'}
        size="icon"
        className={`h-8 w-8 transition-all ${interactionMode === 'select' ? 'shadow-sm bg-background' : ''}`}
        onClick={() => setInteractionMode('select')}
        title="Selection Mode (V)"
      >
        <CursorArrowIcon className="w-4 h-4" />
      </Button>
    </div>
  );
}

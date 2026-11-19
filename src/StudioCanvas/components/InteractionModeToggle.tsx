import { Hand, MousePointer2 } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import React from 'react';
import { Button } from '@/components/ui/button';
import { useStudioStore } from '../stores/useStudioStore';

export function InteractionModeToggle() {
  const translateUi = useUiTranslations('studio');

  const { interactionMode, setInteractionMode } = useStudioStore();

  return (
    <div className="flex bg-background/80 backdrop-blur-sm rounded-lg p-1 border border-border shadow-sm gap-1">
      <Button
        variant={interactionMode === 'pan' ? 'secondary' : 'ghost'}
        size="icon"
        className={`h-8 w-8 transition-all ${interactionMode === 'pan' ? 'shadow-sm bg-background' : ''}`}
        onClick={() => setInteractionMode('pan')}
        title={translateUi('pan_mode_h_2548e741')}
      >
        <Hand className="w-4 h-4" />
      </Button>
      <Button
        variant={interactionMode === 'select' ? 'secondary' : 'ghost'}
        size="icon"
        className={`h-8 w-8 transition-all ${interactionMode === 'select' ? 'shadow-sm bg-background' : ''}`}
        onClick={() => setInteractionMode('select')}
        title={translateUi('selection_mode_v_3c4db91d')}
      >
        <MousePointer2 className="w-4 h-4" />
      </Button>
    </div>
  );
}

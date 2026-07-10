'use client';

// Hover action on sent user messages in both chat surfaces: opens the
// automation builder Sheet prefilled with that message as the saved prompt.
// Renders nothing while Automations ships dark in production.

import type { AgentTarget } from '@continuum/contracts';
import { CalendarClockIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AUTOMATIONS_AVAILABLE } from '@/lib/automations/availability';
import { useAutomationSheetStore } from '@/lib/automations/sheet-store';

type AutomatePromptActionProps = {
  agent: AgentTarget;
  prompt: string;
  className?: string;
};

export function AutomatePromptAction({ agent, prompt, className }: AutomatePromptActionProps) {
  const openBuilder = useAutomationSheetStore((state) => state.openBuilder);
  if (!AUTOMATIONS_AVAILABLE || !prompt.trim()) return null;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className={className}
            aria-label="Automate this prompt"
            onClick={() => openBuilder({ agent, prompt })}
          >
            <CalendarClockIcon className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Automate this prompt</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

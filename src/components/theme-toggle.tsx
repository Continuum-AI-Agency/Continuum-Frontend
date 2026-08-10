'use client';
import { Moon, Sun } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTheme } from './theme-provider';

export function ThemeToggle() {
  const { appearance, toggle } = useTheme();
  const label = appearance === 'dark' ? 'Switch to light' : 'Switch to dark';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
              {appearance === 'dark' ? <Sun /> : <Moon />}
            </Button>
          }
        />
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default ThemeToggle;

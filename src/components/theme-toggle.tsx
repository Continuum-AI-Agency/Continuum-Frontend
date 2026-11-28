'use client';

import { Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTheme } from './theme-provider';

export function ThemeToggle() {
  const tUi = useTranslations('common');

  const { appearance, toggle } = useTheme();
  const label = appearance === 'dark' ? tUi('m_af9c6b84f2') : tUi('m_5113e84020');

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button variant="ghost" size="icon" onClick={toggle} aria-label={tUi('m_9b0eaf14d3')}>
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

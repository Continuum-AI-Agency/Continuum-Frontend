'use client';

import { Ban, Copy, FileJson, MoreHorizontal, SkipForward } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/toast-imperative';
import type { RuleAction } from '@/lib/approvals/types';

type Props = {
  action: RuleAction;
  onReject: () => void;
  onSkip: () => void;
  onViewPayload: () => void;
};

export function ComposerOverflowMenu({ action, onReject, onSkip, onViewPayload }: Props) {
  const tUi = useTranslations('common');

  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(action.id);
      toast.success(tUi('m_5f2a8f7086'));
    } catch {
      toast.error(tUi('m_d1e1e108a2'));
    }
  }, [action.id, tUi]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            aria-label={tUi('m_a1e34f9157')}
          >
            <MoreHorizontal className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={onReject} className="text-destructive focus:text-destructive">
          <Ban className="mr-2 h-4 w-4" strokeWidth={1.5} />
          {tUi('m_ca5aa8c9f5')}
          <DropdownMenuShortcut>R</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onSkip}>
          <SkipForward className="mr-2 h-4 w-4" strokeWidth={1.5} />
          {tUi('m_3da474537a')}
          <DropdownMenuShortcut>S</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onViewPayload}>
          <FileJson className="mr-2 h-4 w-4" strokeWidth={1.5} />
          {tUi('m_f9816af43f')}
          <DropdownMenuShortcut>P</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handleCopy}>
          <Copy className="mr-2 h-4 w-4" strokeWidth={1.5} />
          {tUi('m_570308dc57')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

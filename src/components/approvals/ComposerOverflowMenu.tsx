'use client';

import { Ban, Copy, FileJson, MoreHorizontal, SkipForward } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { RuleAction } from '@/lib/approvals/types';

type Props = {
  action: RuleAction;
  onReject: () => void;
  onSkip: () => void;
  onViewPayload: () => void;
};

export function ComposerOverflowMenu({ action, onReject, onSkip, onViewPayload }: Props) {
  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(action.id);
      toast.success('Action id copied');
    } catch {
      toast.error("Couldn't copy");
    }
  }, [action.id]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground"
          aria-label="More actions"
        >
          <MoreHorizontal className="h-4 w-4" strokeWidth={1.5} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={onReject} className="text-destructive focus:text-destructive">
          <Ban className="mr-2 h-4 w-4" strokeWidth={1.5} />
          Reject…
          <DropdownMenuShortcut>R</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onSkip}>
          <SkipForward className="mr-2 h-4 w-4" strokeWidth={1.5} />
          Skip
          <DropdownMenuShortcut>S</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onViewPayload}>
          <FileJson className="mr-2 h-4 w-4" strokeWidth={1.5} />
          View raw payload
          <DropdownMenuShortcut>P</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handleCopy}>
          <Copy className="mr-2 h-4 w-4" strokeWidth={1.5} />
          Copy action id
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

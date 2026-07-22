'use client';

import { PanelLeftCloseIcon, PanelLeftOpenIcon, PlusIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// Shared collapse control for the Jaina + Organic conversation sidebars. The two
// sidebars are structural twins; this keeps their hide/show behaviour identical.

// Open/closed state for a conversations rail, persisted per surface so the choice
// survives reloads (CLAUDE.md permits localStorage for panel open/closed state).
// Hydrated in an effect rather than a lazy initializer to avoid an SSR/client
// hydration mismatch on the server-rendered default.
export function useCollapsibleConversations(storageKey: string) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored != null) setIsCollapsed(stored === 'true');
    } catch {
      // localStorage unavailable (private mode) — keep the expanded default.
    }
  }, [storageKey]);

  const toggle = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(storageKey, String(next));
      } catch {
        // Persistence is best-effort; the in-memory toggle still works.
      }
      return next;
    });
  }, [storageKey]);

  return { isCollapsed, toggle };
}

// Collapse affordance shown in the expanded sidebar header.
export function CollapseConversationsButton({
  onToggle,
  className,
}: {
  onToggle: () => void;
  className?: string;
}) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={onToggle}
            aria-label="Hide conversations"
            className={cn('shrink-0 text-muted-foreground', className)}
          >
            <PanelLeftCloseIcon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Hide conversations</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// The collapsed rail: a slim bar (vertical on desktop, horizontal on mobile) that
// replaces the sidebar body and keeps the expand + new-conversation actions reachable.
export function CollapsedConversationsRail({
  onExpand,
  onNewSession,
  isInteractionDisabled,
}: {
  onExpand: () => void;
  onNewSession: () => void;
  isInteractionDisabled?: boolean;
}) {
  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex flex-row items-center gap-1 p-2 md:h-full md:flex-col">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={onExpand}
              aria-label="Show conversations"
              className="text-muted-foreground"
            >
              <PanelLeftOpenIcon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Show conversations</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon-sm"
              variant="secondary"
              onClick={onNewSession}
              disabled={isInteractionDisabled}
              aria-label="New conversation"
            >
              <PlusIcon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">New conversation</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

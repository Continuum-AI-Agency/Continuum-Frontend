'use client';

import { ChevronDownIcon, WrenchIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import * as React from 'react';
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
} from '@/components/ai-elements/chain-of-thought';
import { Badge } from '@/components/ui/badge';
import { CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { formatOrganicToolName } from './organicToolLabels';
import { ToolCallChip } from './ToolCallChip';
import type { ToolCallEvent } from './types';

type OrganicThinkingPanelProps = {
  toolCalls: ToolCallEvent[];
  isStreaming: boolean;
};

export function OrganicThinkingPanel({ toolCalls, isStreaming }: OrganicThinkingPanelProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  const hasRunning = isStreaming && toolCalls.some((tc) => tc.result === undefined);

  const activeToolName = React.useMemo(() => {
    if (!isStreaming) return null;
    for (let i = toolCalls.length - 1; i >= 0; i--) {
      if (toolCalls[i].result === undefined) return formatOrganicToolName(toolCalls[i].toolName);
    }
    return toolCalls.length > 0
      ? formatOrganicToolName(toolCalls[toolCalls.length - 1].toolName)
      : null;
  }, [toolCalls, isStreaming]);

  if (toolCalls.length === 0) return null;

  return (
    <ChainOfThought open={isOpen} onOpenChange={setIsOpen} className="space-y-0">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          {hasRunning ? (
            <span className="size-2 shrink-0 animate-pulse rounded-full bg-amber-400" />
          ) : (
            <WrenchIcon className="size-3.5 shrink-0 text-foreground/50" />
          )}
          <span className="flex-1 font-medium">
            {isStreaming ? 'Thinking...' : 'Actions taken'}
          </span>
          <Badge variant="secondary" className="px-1.5 text-2xs">
            {toolCalls.length} tool{toolCalls.length !== 1 ? 's' : ''}
          </Badge>
          <ChevronDownIcon
            className={cn(
              'size-4 shrink-0 transition-transform',
              isOpen ? 'rotate-180' : 'rotate-0',
            )}
          />
        </button>
      </CollapsibleTrigger>

      <AnimatePresence>
        {isStreaming && activeToolName && !isOpen && (
          <motion.p
            key={activeToolName}
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="line-clamp-1 px-3 pb-2 text-xs leading-relaxed text-muted-foreground/60"
          >
            {activeToolName}
          </motion.p>
        )}
      </AnimatePresence>

      <ChainOfThoughtContent className="space-y-1 px-2 pb-3">
        <ChainOfThoughtStep
          icon={WrenchIcon}
          label={`${toolCalls.length} tool call${toolCalls.length !== 1 ? 's' : ''}`}
          status={hasRunning ? 'active' : 'complete'}
        >
          <div className="space-y-1">
            {toolCalls.map((tc, i) => (
              <ToolCallChip key={tc.toolCallId ?? i} toolCall={tc} />
            ))}
          </div>
        </ChainOfThoughtStep>
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}

'use client';

import { WrenchIcon } from 'lucide-react';
import * as React from 'react';
import { ToolInput, ToolOutput } from '@/components/ai-elements/tool';
import { TraceStep, type TraceStepStatus } from '@/components/chat/TraceStep';
import { Trace } from '@/components/ui/trace';
import { formatOrganicToolName } from './organicToolLabels';
import type { ToolCallEvent } from './types';

type OrganicThinkingPanelProps = {
  toolCalls: ToolCallEvent[];
  isStreaming: boolean;
};

export function OrganicThinkingPanel({ toolCalls, isStreaming }: OrganicThinkingPanelProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  if (toolCalls.length === 0) return null;

  // The collapsed row names the tool in flight, shimmering, so there is no separate ticker.
  let activeCall: ToolCallEvent | undefined;
  if (isStreaming) {
    for (let i = toolCalls.length - 1; i >= 0; i--) {
      if (toolCalls[i].result === undefined) {
        activeCall = toolCalls[i];
        break;
      }
    }
  }

  return (
    <Trace className="px-3 py-1.5">
      <TraceStep
        status={activeCall ? 'running' : undefined}
        icon={<WrenchIcon />}
        title={activeCall ? formatOrganicToolName(activeCall.toolName) : 'Actions taken'}
        description={`${toolCalls.length} tool${toolCalls.length !== 1 ? 's' : ''}`}
        open={isOpen}
        onOpenChange={setIsOpen}
      >
        <Trace>
          {toolCalls.map((toolCall, i) => (
            <ToolCallStep
              key={toolCall.toolCallId ?? i}
              toolCall={toolCall}
              isStreaming={isStreaming}
            />
          ))}
        </Trace>
      </TraceStep>
    </Trace>
  );
}

function ToolCallStep({
  toolCall,
  isStreaming,
}: {
  toolCall: ToolCallEvent;
  isStreaming: boolean;
}) {
  const hasResult = toolCall.result !== undefined;
  const failed = toolCall.ok === false;
  // A call with no result after the stream ended never returned — dim it rather than spin forever.
  const status: TraceStepStatus | undefined = failed
    ? 'error'
    : hasResult
      ? undefined
      : isStreaming
        ? 'running'
        : 'pending';

  return (
    <TraceStep status={status} title={formatOrganicToolName(toolCall.toolName)}>
      <div className="space-y-3 text-xs">
        <ToolInput value={toolCall.args} />
        {failed && toolCall.reason ? <p className="text-destructive">{toolCall.reason}</p> : null}
        {hasResult ? <ToolOutput value={toolCall.result} /> : null}
      </div>
    </TraceStep>
  );
}

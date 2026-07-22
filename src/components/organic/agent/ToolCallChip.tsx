'use client';

import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from '@/components/ai-elements/tool';
import { formatOrganicToolName } from './organicToolLabels';
import type { ToolCallEvent } from './types';

type ToolCallChipProps = {
  toolCall: ToolCallEvent;
};

export function ToolCallChip({ toolCall }: ToolCallChipProps) {
  const hasResult = toolCall.result !== undefined;
  const failed = toolCall.ok === false;
  const state = failed ? 'error' : hasResult ? 'output-available' : 'running';

  return (
    <Tool type={toolCall.toolName} state={state}>
      <ToolHeader title={formatOrganicToolName(toolCall.toolName)} />
      <ToolContent>
        <ToolInput value={toolCall.args} />
        {failed && toolCall.reason && (
          <div className="px-3 py-2 text-xs text-destructive">{toolCall.reason}</div>
        )}
        {hasResult && <ToolOutput value={toolCall.result} />}
      </ToolContent>
    </Tool>
  );
}

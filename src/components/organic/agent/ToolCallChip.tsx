"use client";

import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import type { ToolCallEvent } from "./types";

type ToolCallChipProps = {
  toolCall: ToolCallEvent;
};

export function ToolCallChip({ toolCall }: ToolCallChipProps) {
  const hasResult = toolCall.result !== undefined;
  const state = hasResult ? "output-available" : "running";

  return (
    <Tool type={toolCall.toolName} state={state}>
      <ToolHeader />
      <ToolContent>
        <ToolInput value={toolCall.args} />
        {hasResult && <ToolOutput value={toolCall.result} />}
      </ToolContent>
    </Tool>
  );
}

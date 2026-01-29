"use client";

import { Badge, Box, Card, Flex, ScrollArea, Tabs, Text } from "@radix-ui/themes";
import { useMemo, type ReactNode } from "react";

import type { JainaProgressEntry } from "@/lib/jaina/stream";
import type { StateDeltaEventData, ToolCallEventData, ToolResultEventData } from "@/lib/jaina/schemas";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool";

type JainaTracePanelProps = {
  progress: JainaProgressEntry[];
  toolCalls: ToolCallEventData[];
  toolResults: ToolResultEventData[];
  stateDeltas: StateDeltaEventData[];
  isStreaming?: boolean;
};

export function JainaTracePanel({
  progress,
  toolCalls,
  toolResults,
  stateDeltas,
  isStreaming = false,
}: JainaTracePanelProps) {
  const toolEntries = useMemo(
    () => buildToolEntries(toolCalls, toolResults, isStreaming),
    [toolCalls, toolResults, isStreaming]
  );

  return (
    <Card className="h-full min-h-0 border border-subtle bg-surface">
      <Tabs.Root defaultValue="progress" className="h-full min-h-0">
        <Flex align="center" justify="between" p="3" className="border-b border-white/5">
          <Tabs.List>
            <Tabs.Trigger value="progress">Progress</Tabs.Trigger>
            <Tabs.Trigger value="tools">Tools</Tabs.Trigger>
            <Tabs.Trigger value="state">State</Tabs.Trigger>
          </Tabs.List>
        </Flex>

        <Tabs.Content value="progress" className="h-full min-h-0">
          <TraceList>
            <Reasoning defaultOpen isStreaming={isStreaming}>
              <ReasoningTrigger>Thoughts (status only)</ReasoningTrigger>
              <ReasoningContent>
                {progress.length === 0 ? (
                  <EmptyTrace label="No progress events yet." />
                ) : (
                  progress.map((entry, index) => (
                    <Flex key={`${entry.stage}-${entry.at}-${index}`} align="center" gap="2">
                      <Badge color="blue" variant="soft">{entry.stage}</Badge>
                      <Text size="2">{entry.detail ?? "Working…"}</Text>
                      <Text size="1" color="gray">{new Date(entry.at).toLocaleTimeString()}</Text>
                    </Flex>
                  ))
                )}
                <Text size="1" color="gray">
                  These updates summarize the execution stages, not internal chain-of-thought.
                </Text>
              </ReasoningContent>
            </Reasoning>
          </TraceList>
        </Tabs.Content>

        <Tabs.Content value="tools" className="h-full min-h-0">
          <TraceList>
            {toolEntries.length === 0 ? (
              <EmptyTrace label="No tool activity yet." />
            ) : (
              toolEntries.map((entry) => (
                <Tool
                  key={entry.id}
                  type={`tool-${entry.name}`}
                  state={entry.state}
                  defaultOpen={entry.state !== "input-available"}
                >
                  <ToolHeader title={formatToolLabel(entry.name)} />
                  <ToolContent>
                    <ToolInput value={{ args: entry.args, metadata: entry.metadata }} />
                    {entry.result ? (
                      <ToolOutput
                        value={
                          entry.result.ok
                            ? { output: entry.result.output, cached: entry.result.cached, shared: entry.result.shared }
                            : { error: entry.result.error }
                        }
                      />
                    ) : null}
                  </ToolContent>
                </Tool>
              ))
            )}
          </TraceList>
        </Tabs.Content>

        <Tabs.Content value="state" className="h-full min-h-0">
          <TraceList>
            {stateDeltas.length === 0 ? (
              <EmptyTrace label="No state updates yet." />
            ) : (
              stateDeltas.map((delta, index) => (
                <Card key={`${delta.source}-${index}`} className="border border-white/10 bg-default">
                  <Box p="3" className="space-y-2">
                    <Flex align="center" justify="between">
                      <Text weight="medium">{delta.source}</Text>
                      <Badge color="blue" variant="soft">delta</Badge>
                    </Flex>
                    <pre className="text-xs text-secondary whitespace-pre-wrap">{formatJsonPreview(delta.delta)}</pre>
                  </Box>
                </Card>
              ))
            )}
          </TraceList>
        </Tabs.Content>
      </Tabs.Root>
    </Card>
  );
}

function TraceList({ children }: { children: ReactNode }) {
  return (
    <ScrollArea type="always" scrollbars="vertical" className="h-[320px] lg:h-full min-h-0 px-4 pb-4">
      <Flex direction="column" gap="3" className="pt-3">
        {children}
      </Flex>
    </ScrollArea>
  );
}

function EmptyTrace({ label }: { label: string }) {
  return (
    <Flex align="center" justify="center" className="rounded-lg border border-dashed border-white/10 p-6 text-center">
      <Text size="2" color="gray">{label}</Text>
    </Flex>
  );
}

function formatJsonPreview(value: unknown): string {
  if (value === undefined) return "—";
  const json = JSON.stringify(value, null, 2) ?? "";
  if (json.length > 600) {
    return `${json.slice(0, 600)}…`;
  }
  return json;
}

function formatToolLabel(name: string) {
  return name.replace(/_/g, " ");
}

type ToolEntry = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  metadata: Record<string, unknown>;
  result?: ToolResultEventData;
  state: "input-available" | "output-available" | "error" | "running";
};

function buildToolEntries(
  calls: ToolCallEventData[],
  results: ToolResultEventData[],
  isStreaming: boolean
): ToolEntry[] {
  const resultsById = new Map(results.map((result) => [result.id, result]));

  const entries = calls.map((call) => {
    const result = resultsById.get(call.id);
    const state: ToolEntry["state"] = result
      ? result.ok
        ? "output-available"
        : "error"
      : isStreaming
        ? "running"
        : "input-available";
    return {
      id: call.id,
      name: call.name,
      args: call.args,
      metadata: call.metadata,
      result,
      state,
    };
  });

  const orphanResults = results.filter((result) => !calls.some((call) => call.id === result.id));
  orphanResults.forEach((result) => {
    entries.push({
      id: result.id,
      name: result.name,
      args: {},
      metadata: {},
      result,
      state: result.ok ? "output-available" : "error",
    });
  });

  return entries;
}

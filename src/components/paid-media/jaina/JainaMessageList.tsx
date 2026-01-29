"use client";

import { Badge, Card, Flex, ScrollArea, Text } from "@radix-ui/themes";
import { useMemo } from "react";

import { SafeMarkdown } from "@/components/ui/SafeMarkdown";
import { cn } from "@/lib/utils";

import type { JainaChatMessage } from "./types";

type JainaMessageListProps = {
  messages: JainaChatMessage[];
  isStreaming: boolean;
  progressLabel?: string | null;
};

export function JainaMessageList({ messages, isStreaming, progressLabel }: JainaMessageListProps) {
  const hasMessages = messages.length > 0;
  const lastAssistant = useMemo(
    () => messages.slice().reverse().find((message) => message.role === "assistant"),
    [messages]
  );

  return (
    <Card className="h-full min-h-0 bg-surface border border-subtle shadow-xl">
      <Flex direction="column" gap="3" className="h-full min-h-0" p="4">
        <Flex align="center" justify="between">
          <Text weight="medium">Jaina Analyst</Text>
          {isStreaming ? (
            <Badge color="blue" variant="soft">Streaming</Badge>
          ) : (
            <Badge color="gray" variant="soft">Idle</Badge>
          )}
        </Flex>

        <ScrollArea type="always" scrollbars="vertical" className="flex-1 min-h-0 pr-2">
          <Flex direction="column" gap="3">
            {!hasMessages ? (
              <EmptyChatHint />
            ) : (
              messages.map((message) => (
                <ChatBubble key={message.id} message={message} />
              ))
            )}
            {isStreaming && lastAssistant?.status === "streaming" ? (
              <StreamingStatus label={progressLabel ?? "Compiling report"} />
            ) : null}
          </Flex>
        </ScrollArea>
      </Flex>
    </Card>
  );
}

function ChatBubble({ message }: { message: JainaChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-lg border px-3 py-2 text-sm leading-relaxed shadow-sm",
          isUser
            ? "border-brand-primary/20 bg-brand-primary/15 text-primary"
            : "border-white/10 bg-default text-primary"
        )}
      >
        {message.title ? (
          <Text size="1" weight="medium" className="uppercase tracking-wide text-secondary">
            {message.title}
          </Text>
        ) : null}
        {isUser ? (
          <Text size="2">{message.content}</Text>
        ) : (
          <SafeMarkdown content={message.content} className="text-sm text-primary" mode="static" />
        )}
        <Text size="1" color="gray" className="mt-1">
          {new Date(message.createdAt).toLocaleTimeString()}
        </Text>
      </div>
    </div>
  );
}

function EmptyChatHint() {
  return (
    <Flex direction="column" gap="2" className="rounded-lg border border-dashed border-white/10 p-4 text-center">
      <Text weight="medium">Ask Jaina about paid performance</Text>
      <Text size="2" color="gray">
        Try: “Summarize last week’s creative performance and recommend next actions.”
      </Text>
    </Flex>
  );
}

function StreamingStatus({ label }: { label: string }) {
  return (
    <Flex align="center" gap="2" className="rounded-md border border-white/10 bg-muted/30 px-3 py-2">
      <span className="h-2 w-2 animate-pulse rounded-full bg-brand-primary" />
      <Text size="2">{label}</Text>
    </Flex>
  );
}

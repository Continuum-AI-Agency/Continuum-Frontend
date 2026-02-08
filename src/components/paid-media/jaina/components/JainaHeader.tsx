"use client";

import React from "react";
import { Badge, Button, Flex, Heading, Text } from "@radix-ui/themes";
import { Cross2Icon, ResetIcon } from "@radix-ui/react-icons";

type JainaHeaderProps = {
  brandName: string;
  campaignId?: string | null;
  onClearMemory: () => void;
  onClearConversation: () => void;
  onStop: () => void;
  isStreaming: boolean;
};

export function JainaHeader({
  brandName,
  campaignId,
  onClearMemory,
  onClearConversation,
  onStop,
  isStreaming,
}: JainaHeaderProps) {
  return (
    <header className="relative z-10 flex flex-wrap items-center justify-between gap-3 p-4 bg-white/5 backdrop-blur-md border-b border-white/10 shadow-sm transition-all duration-300">
      <div className="space-y-1">
        <Flex align="center" gap="2">
          <Heading size="4">Jaina Analyst</Heading>
          {campaignId && (
            <Badge variant="soft" color="blue">
              Campaign Context
            </Badge>
          )}
        </Flex>
        <Text size="2" className="text-secondary">
          Streaming performance intelligence for{" "}
          <span className="text-primary font-medium">{brandName}</span>
        </Text>
      </div>

      <Flex align="center" gap="2">
        <Button variant="soft" color="gray" size="1" onClick={onClearMemory}>
          <ResetIcon />
          Reset Memory
        </Button>
        <Button
          variant="soft"
          color="gray"
          size="1"
          onClick={onClearConversation}
        >
          <Cross2Icon />
          Clear
        </Button>
        {isStreaming && (
          <Button variant="solid" color="red" size="1" onClick={onStop}>
            Stop
          </Button>
        )}
      </Flex>
    </header>
  );
}

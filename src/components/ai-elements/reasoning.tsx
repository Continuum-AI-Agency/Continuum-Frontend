"use client";

import { Box, Flex, IconButton, Text } from "@radix-ui/themes";
import { ChevronDownIcon, ChevronRightIcon, InfoCircledIcon } from "@radix-ui/react-icons";
import * as Collapsible from "@radix-ui/react-collapsible";
import { useState, type ReactNode } from "react";

type ReasoningProps = {
  children: ReactNode;
  defaultOpen?: boolean;
  isStreaming?: boolean;
};

export function Reasoning({ children, defaultOpen = false, isStreaming = false }: ReasoningProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className="w-full">
      <Box className="rounded-lg border border-white/5 bg-white/5 overflow-hidden">
        {children}
      </Box>
    </Collapsible.Root>
  );
}

export function ReasoningTrigger({ children }: { children: ReactNode }) {
  return (
    <Collapsible.Trigger asChild>
      <Flex
        align="center"
        justify="between"
        p="2"
        className="cursor-pointer hover:bg-white/5 transition-colors"
      >
        <Flex align="center" gap="2">
          <InfoCircledIcon className="text-blue-400" />
          <Text size="2" weight="medium" className="text-secondary">
            {children}
          </Text>
        </Flex>
        <IconButton variant="ghost" size="1" color="gray">
          <ChevronDownIcon className="transition-transform duration-200" />
        </IconButton>
      </Flex>
    </Collapsible.Trigger>
  );
}

export function ReasoningContent({ children }: { children: ReactNode }) {
  return (
    <Collapsible.Content>
      <Box p="3" className="border-t border-white/5 space-y-2">
        {children}
      </Box>
    </Collapsible.Content>
  );
}

"use client";

import { Badge, Box, Flex, IconButton, Text } from "@radix-ui/themes";
import { ChevronDownIcon, CodeIcon } from "@radix-ui/react-icons";
import * as Collapsible from "@radix-ui/react-collapsible";
import { createContext, useContext, useState, type ReactNode } from "react";

type ToolContextType = {
  type: string;
  state: "input-available" | "output-available" | "error" | "running";
};

const ToolContext = createContext<ToolContextType | null>(null);

function useTool() {
  const context = useContext(ToolContext);
  if (!context) {
    throw new Error("Tool components must be used within a Tool provider");
  }
  return context;
}

type ToolProps = {
  children: ReactNode;
  type: string;
  state: "input-available" | "output-available" | "error" | "running";
  defaultOpen?: boolean;
};

export function Tool({ children, type, state, defaultOpen = false }: ToolProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <ToolContext.Provider value={{ type, state }}>
      <Collapsible.Root open={open} onOpenChange={setOpen} className="w-full">
        <Box className="rounded-lg border border-white/5 bg-white/5 overflow-hidden">
          {children}
        </Box>
      </Collapsible.Root>
    </ToolContext.Provider>
  );
}

export function ToolHeader({ title }: { title?: string }) {
  const { type } = useTool();
  const displayTitle = title || type.replace("tool-", "").replace(/_/g, " ");

  return (
    <Collapsible.Trigger asChild>
      <Flex
        align="center"
        justify="between"
        p="2"
        className="cursor-pointer hover:bg-white/5 transition-colors"
      >
        <Flex align="center" gap="2">
          <CodeIcon className="text-purple-400" />
          <Text size="2" weight="medium" className="text-secondary">
            {displayTitle}
          </Text>
        </Flex>
        <IconButton variant="ghost" size="1" color="gray">
          <ChevronDownIcon />
        </IconButton>
      </Flex>
    </Collapsible.Trigger>
  );
}

export function ToolContent({ children }: { children: ReactNode }) {
  return (
    <Collapsible.Content>
      <Box p="3" className="border-t border-white/5 space-y-4">
        {children}
      </Box>
    </Collapsible.Content>
  );
}

export function ToolInput({ value }: { value: unknown }) {
  return (
    <Box className="space-y-1">
      <Text size="1" color="gray" weight="bold" className="uppercase tracking-wider">
        Input
      </Text>
      <pre className="text-xs bg-black/20 p-2 rounded border border-white/5 overflow-x-auto text-secondary">
        {JSON.stringify(value, null, 2)}
      </pre>
    </Box>
  );
}

export function ToolOutput({ value }: { value: unknown }) {
  return (
    <Box className="space-y-1">
      <Text size="1" color="gray" weight="bold" className="uppercase tracking-wider">
        Output
      </Text>
      <pre className="text-xs bg-black/20 p-2 rounded border border-white/5 overflow-x-auto text-secondary">
        {JSON.stringify(value, null, 2)}
      </pre>
    </Box>
  );
}

"use client";

import { Badge, Box, Flex, IconButton, Text } from "@radix-ui/themes";
import { ChevronDownIcon, CodeIcon } from "@radix-ui/react-icons";
import * as Collapsible from "@radix-ui/react-collapsible";
import { createContext, useContext, useState, type ReactNode } from "react";
import { Spinner } from "@/components/ui/Loading";

export function getStatusBadge(state: string) {
  switch (state) {
    case "call":
    case "running":
    case "input-available":
      return (
        <Badge color="yellow" variant="soft">
          Running
        </Badge>
      );
    case "result":
    case "output-available":
      return (
        <Badge color="green" variant="soft">
          Success
        </Badge>
      );
    case "error":
      return (
        <Badge color="red" variant="soft">
          Error
        </Badge>
      );
    default:
      return null;
  }
}

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
  const { type, state } = useTool();
  const displayTitle = title || type.replace("tool-", "").replace(/_/g, " ");

  return (
    <Collapsible.Trigger asChild>
      <button
        type="button"
        className="flex w-full items-center justify-between p-2 cursor-pointer hover:bg-white/5 transition-colors rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Flex align="center" gap="2">
          <CodeIcon className="text-purple-400" />
          <Text size="2" weight="medium" className="text-secondary">
            {displayTitle}
          </Text>
          {state === "running" && <Spinner size={12} />}
        </Flex>
        <div className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400">
          <ChevronDownIcon />
        </div>
      </button>
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

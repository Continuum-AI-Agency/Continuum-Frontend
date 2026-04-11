"use client";

import React from "react";
import { BookOpen } from "lucide-react";
import { useReactFlow } from "@xyflow/react";
import type { Edge } from "@xyflow/react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/components/ui/ToastProvider";
import { useWorkflowLibrary } from "@/lib/ai-studio/useWorkflowLibrary";
import type { WorkflowLibraryItem } from "@/lib/schemas/workflowLibrary";
import { useStudioStore } from "@/StudioCanvas/stores/useStudioStore";
import type { StudioNode } from "@/StudioCanvas/types";
import { normalizeWorkflowSnapshot } from "@/StudioCanvas/utils/workflowSerialization";
import { rehydrateWorkflowMediaNodes } from "@/StudioCanvas/utils/rehydrateWorkflowMedia";

export function WorkflowLibrary() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const { items, isLoading, isError } = useWorkflowLibrary({ enabled: isOpen });
  const { setNodes, setEdges, takeSnapshot, defaultEdgeType } = useStudioStore();
  const { fitView } = useReactFlow();
  const { show } = useToast();

  const filtered = items.filter(
    (item) =>
      item.name.toLowerCase().includes(query.toLowerCase()) ||
      (item.description?.toLowerCase().includes(query.toLowerCase()) ?? false)
  );

  async function handleLoad(item: WorkflowLibraryItem) {
    const snapshot = normalizeWorkflowSnapshot(
      {
        nodes: item.content.nodes as unknown as StudioNode[],
        edges: item.content.edges as unknown as Edge[],
      },
      defaultEdgeType
    );
    const hydratedNodes = await rehydrateWorkflowMediaNodes(snapshot.nodes);

    takeSnapshot();
    setNodes(hydratedNodes);
    setEdges(snapshot.edges);
    requestAnimationFrame(() => {
      fitView({ padding: 0.2, duration: 300 });
    });

    show({ title: "Workflow loaded", description: item.name, variant: "success" });
    setIsOpen(false);
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <BookOpen className="mr-1.5 h-3.5 w-3.5" />
          Library
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-0" align="end">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search starter workflows…"
            value={query}
            onValueChange={setQuery}
            autoFocus
          />
          <CommandList className="max-h-[320px]">
            {isLoading && <CommandEmpty>Loading…</CommandEmpty>}
            {isError && <CommandEmpty>Could not load library.</CommandEmpty>}
            {!isLoading && !isError && filtered.length === 0 && (
              <CommandEmpty>No workflows found.</CommandEmpty>
            )}
            <CommandGroup>
              {filtered.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.id}
                  onSelect={() => {
                    void handleLoad(item);
                  }}
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">{item.name}</span>
                    {item.description && (
                      <span className="truncate text-xs text-muted-foreground">
                        {item.description}
                      </span>
                    )}
                  </div>
                  {item.tags.length > 0 && (
                    <span className="ml-auto shrink-0 rounded border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {item.tags[0]}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

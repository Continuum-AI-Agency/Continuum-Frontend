"use client";

import * as React from "react";
import { Flex, Text, Box } from "@radix-ui/themes";
import {
  CheckIcon,
  Cross2Icon,
  FileTextIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";
import { cn } from "@/lib/utils";
import type { StreamEvent } from "./types";
import type { CalendarGenerationEvent } from "@/lib/organic/calendar-generation";
import { PlacementNotificationCard } from "./PlacementNotificationCard";

interface StreamEventItemProps {
  event: StreamEvent;
  onPlacementSelect?: (placementId: string) => void;
}

const stageIcons: Record<string, React.ReactNode> = {
  analyzing: <ReloadIcon className="w-3.5 h-3.5" />,
  optimizing: <ReloadIcon className="w-3.5 h-3.5" />,
  drafting: <FileTextIcon className="w-3.5 h-3.5" />,
  matching: <ReloadIcon className="w-3.5 h-3.5" />,
  finalizing: <CheckIcon className="w-3.5 h-3.5" />,
};

const stageColors: Record<string, string> = {
  analyzing: "text-blue-500",
  optimizing: "text-amber-500",
  drafting: "text-violet-500",
  matching: "text-cyan-500",
  finalizing: "text-emerald-500",
};

function formatTimeLabel(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function StreamEventItem({ event, onPlacementSelect }: StreamEventItemProps) {
  const timeLabel = formatTimeLabel(event.timestamp);

  if (event.type === "placement") {
    const placementEvent = event.data as Extract<CalendarGenerationEvent, { type: "placement" }>;
    const placement = placementEvent.placement;
    return (
      <PlacementNotificationCard
        placement={placement}
        timestamp={event.timestamp}
        onSelect={onPlacementSelect}
      />
    );
  }

  if (event.type === "progress") {
    const progressData = event.data as Extract<CalendarGenerationEvent, { type: "progress" }>;
    const stage = progressData.stage || "processing";
    const icon = stageIcons[stage] || stageIcons.analyzing;
    const colorClass = stageColors[stage] || stageColors.analyzing;

    return (
      <Flex
        align="center"
        gap="3"
        className="py-2 px-3 rounded-md hover:bg-muted/50 transition-colors"
      >
        <Box className={cn("flex items-center justify-center", colorClass)}>
          {icon}
        </Box>
        <Flex direction="column" className="flex-1 min-w-0">
          <Text size="2" className="truncate">
            {progressData.message || "Processing..."}
          </Text>
          <Text size="1" color="gray">
            {progressData.completed}/{progressData.total} completed
          </Text>
        </Flex>
        <Text size="1" color="gray" className="tabular-nums">
          {timeLabel}
        </Text>
      </Flex>
    );
  }

  if (event.type === "error") {
    const errorData = event.data as Extract<CalendarGenerationEvent, { type: "error" }>;
    return (
      <Flex
        align="center"
        gap="3"
        className="py-2 px-3 rounded-md bg-red-50 border border-red-100"
        role="alert"
      >
        <Box className="flex items-center justify-center text-red-500">
          <Cross2Icon className="w-3.5 h-3.5" />
        </Box>
        <Flex direction="column" className="flex-1 min-w-0">
          <Text size="2" color="red" className="truncate">
            {errorData.message}
          </Text>
        </Flex>
        <Text size="1" color="gray" className="tabular-nums">
          {timeLabel}
        </Text>
      </Flex>
    );
  }

  if (event.type === "complete") {
    return (
      <Flex
        align="center"
        gap="3"
        className="py-2 px-3 rounded-md bg-emerald-50 border border-emerald-100"
      >
        <Box className="flex items-center justify-center text-emerald-500">
          <CheckIcon className="w-3.5 h-3.5" />
        </Box>
        <Flex direction="column" className="flex-1 min-w-0">
          <Text size="2" className="truncate">
            Generation complete
          </Text>
        </Flex>
        <Text size="1" color="gray" className="tabular-nums">
          {timeLabel}
        </Text>
      </Flex>
    );
  }

  return null;
}

"use client";

import * as React from "react";
import { Card, Flex, Text, Box, Button, Heading, ScrollArea } from "@radix-ui/themes";
import { Cross2Icon, ActivityLogIcon } from "@radix-ui/react-icons";
import { cn } from "@/lib/utils";
import type { StreamEvent } from "./types";
import { StreamEventItem } from "./StreamEventItem";

interface EventStreamPanelProps {
  events: StreamEvent[];
  onClear?: () => void;
  onPlacementSelect?: (placementId: string) => void;
  className?: string;
}

export function EventStreamPanel({
  events,
  onClear,
  onPlacementSelect,
  className,
}: EventStreamPanelProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = React.useState(true);

  const scrollToBottom = React.useCallback(() => {
    if (scrollRef.current && shouldAutoScroll) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [shouldAutoScroll]);

  React.useEffect(() => {
    scrollToBottom();
  }, [events, scrollToBottom]);

  const handleScroll = React.useCallback(() => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;
      setShouldAutoScroll(isNearBottom);
    }
  }, []);

  const hasEvents = events.length > 0;

  return (
    <Card
      data-testid="event-stream-panel"
      className={cn("overflow-hidden", className)}
    >
      <Flex direction="column">
        <Flex
          align="center"
          justify="between"
          className="px-4 py-3 border-b border-border"
        >
          <Flex align="center" gap="2">
            <ActivityLogIcon className="w-4 h-4 text-muted-foreground" />
            <Heading size="3">Generation Stream</Heading>
            {hasEvents && (
              <Text size="1" color="gray" className="tabular-nums">
                ({events.length})
              </Text>
            )}
          </Flex>

          {hasEvents && onClear && (
            <Button
              variant="ghost"
              size="1"
              onClick={onClear}
              className="text-muted-foreground hover:text-foreground"
            >
              <Cross2Icon className="w-3 h-3 mr-1" />
              Clear
            </Button>
          )}
        </Flex>

        <Box className="max-h-[400px]">
          {hasEvents ? (
            <ScrollArea
              ref={scrollRef}
              onScroll={handleScroll}
              className="h-full"
            >
              <Flex direction="column" className="p-2 gap-1">
                {events.map((event) => (
                  <StreamEventItem
                    key={event.id}
                    event={event}
                    onPlacementSelect={onPlacementSelect}
                  />
                ))}
              </Flex>
            </ScrollArea>
          ) : (
            <Flex
              direction="column"
              align="center"
              justify="center"
              className="py-12 px-4 text-center"
            >
              <ActivityLogIcon className="w-8 h-8 text-muted-foreground/50 mb-3" />
              <Text size="2" color="gray">
                Start generation to see events
              </Text>
              <Text size="1" color="gray" className="mt-1">
                Progress updates and placements will appear here
              </Text>
            </Flex>
          )}
        </Box>
      </Flex>
    </Card>
  );
}

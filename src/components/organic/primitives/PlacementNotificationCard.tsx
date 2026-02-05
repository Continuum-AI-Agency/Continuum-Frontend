"use client";

import * as React from "react";
import { Card, Flex, Text, Box, Badge } from "@radix-ui/themes";
import { InstagramLogoIcon, LinkedInLogoIcon } from "@radix-ui/react-icons";
import { cn } from "@/lib/utils";
import type { CalendarPlacement } from "@/lib/organic/calendar-generation";

interface PlacementNotificationCardProps {
  placement: CalendarPlacement;
  timestamp: string;
  onSelect?: (placementId: string) => void;
}

const platformIcons: Record<string, React.ReactNode> = {
  instagram: <InstagramLogoIcon className="w-3.5 h-3.5" />,
  linkedin: <LinkedInLogoIcon className="w-3.5 h-3.5" />,
};

const platformLabels: Record<string, string> = {
  instagram: "IG",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
};

function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);

  if (diffSecs < 10) return "just now";
  if (diffSecs < 60) return `${diffSecs}s ago`;
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
}

export function PlacementNotificationCard({
  placement,
  timestamp,
  onSelect,
}: PlacementNotificationCardProps) {
  const platform = placement.platform.name;
  const content = placement.content;
  const titleTopic = content?.titleTopic || "New placement";
  const format = content?.format || "Post";
  const timeLabel = formatRelativeTime(timestamp);

  return (
    <Card
      data-testid="placement-card"
      className={cn(
        "cursor-pointer transition-all duration-200",
        "hover:shadow-md hover:border-primary/50"
      )}
      onClick={() => onSelect?.(placement.placementId)}
    >
      <Box p="3">
        <Flex direction="column" gap="2">
          <Flex align="center" justify="between">
            <Flex align="center" gap="2">
              <Badge
                size="1"
                className={cn(
                  "flex items-center gap-1",
                  platform === "instagram" && "bg-fuchsia-100 text-fuchsia-700",
                  platform === "linkedin" && "bg-sky-100 text-sky-700"
                )}
              >
                {platformIcons[platform] || null}
                <span>{platformLabels[platform] || platform}</span>
              </Badge>
              <Text size="1" color="gray">
                {format}
              </Text>
            </Flex>
            <Text size="1" color="gray" className="tabular-nums">
              {timeLabel}
            </Text>
          </Flex>

          <Text size="2" weight="medium" className="line-clamp-2">
            {titleTopic}
          </Text>

          {placement.creative?.creativeIdea && (
            <Text size="1" color="gray" className="line-clamp-1">
              {placement.creative.creativeIdea}
            </Text>
          )}
        </Flex>
      </Box>
    </Card>
  );
}

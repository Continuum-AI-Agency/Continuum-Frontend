"use client";

import { ActivityLogIcon, OpenInNewWindowIcon, PinTopIcon } from "@radix-ui/react-icons";
import { Badge, Box, Flex, Heading, IconButton, Separator, Text } from "@radix-ui/themes";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export type AgenticActivityItem = {
  id: string;
  actorName: string;
  summary: string;
  timestamp: string;
  avatarUrl?: string;
  highlight?: string;
};

type AgenticActivityLogProps = {
  items: AgenticActivityItem[];
  emptyMessage?: string;
};

function initialsFromName(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function AgenticActivityLog({ items, emptyMessage }: AgenticActivityLogProps) {
  return (
    <Box>
      <Flex align="center" justify="between" gap="3" wrap="wrap">
        <Flex align="center" gap="2">
          <Badge color="gray" variant="soft" radius="full">
            <ActivityLogIcon />
          </Badge>
          <Box>
            <Heading size="4">Recent activity</Heading>
            <Text color="gray" size="2">
              Agentic DCO actions from the last 7 days.
            </Text>
          </Box>
        </Flex>
        <Flex gap="2">
          <IconButton variant="soft" color="gray" aria-label="Open activity log">
            <OpenInNewWindowIcon />
          </IconButton>
          <IconButton variant="soft" color="gray" aria-label="Pin activity log">
            <PinTopIcon />
          </IconButton>
        </Flex>
      </Flex>

      <Separator my="3" />

      {items.length === 0 ? (
        <Text color="gray" size="2">
          {emptyMessage ?? "No DCO activity yet. Automations will appear here as they run."}
        </Text>
      ) : (
        <Flex direction="column" gap="3">
          {items.map((item, index) => (
            <Box key={item.id}>
              <Flex align="center" justify="between" gap="3" wrap="wrap">
                <Flex align="center" gap="3">
                  <Avatar className="h-10 w-10">
                    {item.avatarUrl ? (
                      <AvatarImage src={item.avatarUrl} alt={item.actorName} />
                    ) : null}
                    <AvatarFallback className="text-xs font-semibold">
                      {initialsFromName(item.actorName)}
                    </AvatarFallback>
                  </Avatar>
                  <Box>
                    <Text weight="medium">{item.actorName}</Text>
                    <Text color="gray" size="2">
                      {item.summary}
                    </Text>
                  </Box>
                </Flex>
                <Flex align="center" gap="2">
                  {item.highlight ? (
                    <Badge color="violet" variant="soft">
                      {item.highlight}
                    </Badge>
                  ) : null}
                  <Text color="gray" size="2">
                    {item.timestamp}
                  </Text>
                </Flex>
              </Flex>
              {index < items.length - 1 ? <Separator my="3" /> : null}
            </Box>
          ))}
        </Flex>
      )}
    </Box>
  );
}

"use client";

import { Flex, Text, Badge } from "@radix-ui/themes";
import { GlassCard } from "./GlassCard";

export type KPICardProps = {
  label: string;
  value: string;
  delta?: string;
  deltaColor?: "green" | "red" | "blue" | "yellow" | "gray";
};

export function KPICard({ label, value, delta, deltaColor = "green" }: KPICardProps) {
  return (
    <GlassCard>
      <Flex direction="column" gap="2" p="4">
        <Text size="2" color="gray">
          {label}
        </Text>
        <Text size="7" weight="bold">
          {value}
        </Text>
        {delta ? (
          <Badge size="1" color={deltaColor} variant="soft">
            {delta}
          </Badge>
        ) : null}
      </Flex>
    </GlassCard>
  );
}

export default KPICard;

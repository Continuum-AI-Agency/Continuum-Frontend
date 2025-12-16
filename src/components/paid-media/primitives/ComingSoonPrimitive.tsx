"use client";

import { Card, Flex, Heading, Separator, Text } from "@radix-ui/themes";
import type { ReactElement } from "react";

type ComingSoonPrimitiveProps = {
  title: string;
  summary: string;
  icon: ReactElement;
};

export function ComingSoonPrimitive({ title, summary, icon }: ComingSoonPrimitiveProps) {
  return (
    <Card className="glass-panel">
      <Flex direction="column" gap="3">
        <Flex align="center" gap="2">
          {icon}
          <Heading size="4" className="text-white">
            {title}
          </Heading>
        </Flex>
        <Text color="gray">{summary}</Text>
        <Separator size="4" />
        <Text color="gray">Add requirements and sample assets here to keep the build aligned.</Text>
      </Flex>
    </Card>
  );
}


"use client";

import { Card, Flex, Heading, Text, Callout } from "@radix-ui/themes";
import { ExclamationTriangleIcon } from "@radix-ui/react-icons";

export default function PaidMediaPage() {
  return (
    <div className="w-full max-w-none px-3 sm:px-4 lg:px-6 py-8">
      <Flex direction="column" gap="4">
        <Heading size="6" className="text-white">Paid Media</Heading>
        <Text color="gray">Plan, launch, and optimize paid campaigns across ads platforms.</Text>
        <Card
          className="backdrop-blur-xl"
          style={{
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
            color: "var(--foreground)",
          }}
        >
          <Flex direction="column" gap="3" p="4">
            <Heading size="4" className="text-white">Coming soon</Heading>
            <Text color="gray">We’re building budgeting, targeting presets, and performance insights.</Text>
            <Callout.Root color="amber">
              <Callout.Icon>
                <ExclamationTriangleIcon />
              </Callout.Icon>
              <Callout.Text>
                Placeholder UI. Functionality will be added as features land.
              </Callout.Text>
            </Callout.Root>
          </Flex>
        </Card>
      </Flex>
    </div>
  );
}

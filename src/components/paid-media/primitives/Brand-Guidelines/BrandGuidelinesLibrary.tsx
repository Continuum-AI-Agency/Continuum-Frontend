"use client";

import { Badge, Box, Button, Card, Flex, Heading, Text } from "@radix-ui/themes";
import { PlusIcon } from "@radix-ui/react-icons";

import type { BrandGuidelineStatus, BrandGuidelineSummary } from "@/lib/schemas/brandGuidelines";

const STATUS_COLOR: Record<BrandGuidelineStatus, "gray" | "amber" | "green" | "red"> = {
  draft: "gray",
  review: "amber",
  approved: "green",
  archived: "red",
};

type BrandGuidelinesLibraryProps = {
  guidelines: BrandGuidelineSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreateNew: () => void;
  isLoading?: boolean;
};

export function BrandGuidelinesLibrary({
  guidelines,
  activeId,
  onSelect,
  onCreateNew,
  isLoading = false,
}: BrandGuidelinesLibraryProps) {
  return (
    <Card className="glass-panel h-full">
      <Flex direction="column" gap="3">
        <Flex align="center" justify="between" gap="2">
          <Heading size="4" className="text-white">
            Guidelines library
          </Heading>
          <Button size="1" onClick={onCreateNew}>
            <PlusIcon /> New
          </Button>
        </Flex>
        <Text color="gray" size="2">
          Purpose-driven brand guideline sets. Create one for each seasonal or campaign need.
        </Text>
        {isLoading ? (
          <Text size="2" color="gray">
            Loading guidelines...
          </Text>
        ) : guidelines.length === 0 ? (
          <Box className="rounded-md border border-dashed border-[var(--glass-border)] p-4">
            <Text size="2" color="gray">
              No guidelines yet. Create a new guideline to get started.
            </Text>
          </Box>
        ) : (
          <Flex direction="column" gap="2">
            {guidelines.map((guideline) => {
              const isActive = guideline.id === activeId;
              return (
                <button
                  key={guideline.id}
                  type="button"
                  onClick={() => onSelect(guideline.id)}
                  className={`w-full rounded-md border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary ${
                    isActive
                      ? "border-brand-primary/60 bg-brand-primary/10"
                      : "border-[var(--glass-border)] hover:border-brand-primary/40"
                  }`}
                >
                  <Flex align="center" justify="between">
                    <Text weight="medium" className="text-white">
                      {guideline.purpose}
                    </Text>
                    <Badge color={STATUS_COLOR[guideline.status]} radius="full" variant="surface">
                      {guideline.status}
                    </Badge>
                  </Flex>
                  <Flex align="center" justify="between">
                    <Text size="1" color="gray">
                      Version {guideline.version}
                    </Text>
                    <Text size="1" color="gray">
                      Updated {new Date(guideline.updatedAt).toLocaleDateString()}
                    </Text>
                  </Flex>
                </button>
              );
            })}
          </Flex>
        )}
      </Flex>
    </Card>
  );
}

"use client";

import { Text } from "@radix-ui/themes";
import type { CreativeArtifact } from "@/lib/jaina/schemas";
import { CreativeCard } from "./CreativeCard";

type CreativesSectionProps = {
  creatives: CreativeArtifact[];
};

export function CreativesSection({ creatives }: CreativesSectionProps) {
  if (creatives.length === 0) return null;

  return (
    <div className="mt-6 space-y-4">
      <Text size="3" className="font-semibold text-foreground/90">
        Creatives
      </Text>
      <div className="flex flex-wrap gap-4">
        {creatives.map((creative) => (
          <CreativeCard key={creative.id} creative={creative} />
        ))}
      </div>
    </div>
  );
}

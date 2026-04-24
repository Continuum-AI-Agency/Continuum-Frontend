"use client";

import type { CreativeArtifact } from "@/lib/jaina/schemas";
import { CreativeCard } from "./CreativeCard";

type CreativesSectionProps = {
  creatives: CreativeArtifact[];
};

export function CreativesSection({ creatives }: CreativesSectionProps) {
  if (creatives.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground">
        {creatives.length} creative{creatives.length !== 1 ? "s" : ""}
      </p>
      <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {creatives.map((creative, i) => (
          <CreativeCard key={creative.id} creative={creative} index={i} />
        ))}
      </div>
    </div>
  );
}

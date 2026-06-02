"use client";

import { PipelineCard } from "./PipelineCard";
import type { PipelineCardState } from "./types";

export function PipelinePlacementGrid({ cards }: { cards: PipelineCardState[] }) {
  if (cards.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {cards.map((card) => (
        <PipelineCard key={card.jobId} card={card} />
      ))}
    </div>
  );
}

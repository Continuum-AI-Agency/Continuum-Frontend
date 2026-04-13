"use client";

import { SafeMarkdown } from "@/components/ui/SafeMarkdownLazy";
import { cn } from "@/lib/utils";
import type { NarrativeBlockV2 } from "@/lib/jaina/schemas";
import { MediaText } from "./mediaText";

type NarrativeBlockProps = {
  block: NarrativeBlockV2;
  isStreaming: boolean;
};

const severityBorderClass: Record<string, string> = {
  positive: "border-emerald-500",
  watch: "border-amber-500",
  risk: "border-red-500",
  neutral: "border-border",
};

export default function NarrativeBlock({ block, isStreaming }: NarrativeBlockProps) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-foreground">{block.title}</h4>
      <SafeMarkdown
        content={block.body}
        mode={isStreaming ? "streaming" : "static"}
        className="text-sm leading-relaxed text-muted-foreground"
      />
      {block.highlights.length > 0 && (
        <ul className="space-y-2">
          {block.highlights.map((highlight, index) => (
            <li
              key={index}
              className={cn(
                "border-l-2 pl-3 py-1",
                severityBorderClass[highlight.severity ?? "neutral"] ?? "border-border"
              )}
            >
              {highlight.category && (
                <span className="inline-block text-xs font-medium text-muted-foreground bg-muted rounded px-1.5 py-0.5 mb-1">
                  {highlight.category}
                </span>
              )}
              <p className="text-sm text-foreground"><MediaText>{highlight.text}</MediaText></p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

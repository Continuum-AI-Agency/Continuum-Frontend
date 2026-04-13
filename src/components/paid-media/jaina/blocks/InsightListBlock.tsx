"use client";

import type { ComponentType } from "react";
import { EyeIcon, HelpCircleIcon, LightbulbIcon, ZapIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InsightListBlockV2 } from "@/lib/jaina/schemas";
import { MediaText } from "./mediaText";

type InsightListBlockProps = { block: InsightListBlockV2; isStreaming: boolean };

type ItemType = "recommendation" | "insight" | "action" | "question";
type Severity = "positive" | "neutral" | "watch" | "risk";
type IconComponent = ComponentType<{ className?: string }>;

const itemTypeIcon: Record<ItemType, IconComponent> = {
  recommendation: LightbulbIcon,
  insight: EyeIcon,
  action: ZapIcon,
  question: HelpCircleIcon,
};

const severityBorderClass: Record<Severity, string> = {
  positive: "border-l-emerald-500",
  watch: "border-l-amber-500",
  risk: "border-l-red-500",
  neutral: "border-l-border",
};

export default function InsightListBlock({ block }: InsightListBlockProps) {
  return (
    <div>
      {block.title && (
        <h4 className="mb-2 text-sm font-semibold text-foreground">{block.title}</h4>
      )}
      <div className="space-y-2">
        {block.items.map((item, index) => {
          const Icon: IconComponent =
            itemTypeIcon[item.item_type as ItemType] ?? LightbulbIcon;
          const borderClass =
            severityBorderClass[(item.severity as Severity) ?? "neutral"] ??
            "border-l-border";

          return (
            <div
              key={index}
              className={cn(
                "rounded-lg border border-border/60 border-l-2 bg-background/80 px-3 py-2.5",
                borderClass
              )}
            >
              <div className="flex items-center gap-1.5">
                <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">{item.title}</span>
                {item.priority && (
                  <span className="ml-auto text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-muted">
                    {item.priority}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground"><MediaText>{item.summary}</MediaText></p>
              {item.rationale && (
                <p className="mt-1 text-xs italic text-muted-foreground/70">
                  {item.rationale}
                </p>
              )}
              {item.impact && (
                <p className="mt-1 text-xs font-medium text-foreground/80">
                  Impact: {item.impact}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

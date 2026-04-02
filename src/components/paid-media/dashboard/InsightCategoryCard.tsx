"use client";

import type { LucideIcon } from "lucide-react";

import type {
  ComputedInsight,
  InsightSeverity,
} from "@/lib/paid-media/account-insights.types";
import { cn } from "@/lib/utils";

type InsightCategoryCardProps = {
  title: string;
  icon: LucideIcon;
  insights: ComputedInsight[];
  accentColor: string;
};

const severityClasses: Record<InsightSeverity, string> = {
  positive: "bg-emerald-500",
  negative: "bg-destructive",
  neutral: "bg-primary",
};

const severityTextClasses: Record<InsightSeverity, string> = {
  positive: "text-emerald-500",
  negative: "text-destructive",
  neutral: "text-primary",
};

export function InsightCategoryCard({
  title,
  icon: Icon,
  insights,
  accentColor,
}: InsightCategoryCardProps) {
  return (
    <div className="rounded-lg border border-border/70 bg-card p-3">
      <div className="mb-2.5 flex items-center gap-2">
        <div
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-md",
            accentColor
          )}
        >
          <Icon className="size-3.5 text-white" />
        </div>
        <span className="text-sm font-medium">{title}</span>
      </div>

      {insights.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Not enough data to surface insights
        </p>
      ) : (
        <ul className="space-y-2">
          {insights.map((insight, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span
                className={cn(
                  "mt-1.5 size-1.5 shrink-0 rounded-full",
                  severityClasses[insight.severity]
                )}
              />
              <span className="text-xs leading-relaxed text-muted-foreground">
                <InsightText text={insight.text} severity={insight.severity} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InsightText({
  text,
  severity,
}: {
  text: string;
  severity: InsightSeverity;
}) {
  const parts = text.split(/(\d+(?:\.\d+)?[%x]?)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^\d+(?:\.\d+)?[%x]?$/.test(part) ? (
          <span
            key={i}
            className={cn("font-semibold", severityTextClasses[severity])}
          >
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

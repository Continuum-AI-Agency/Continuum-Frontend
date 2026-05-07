"use client";

import { ExclamationTriangleIcon, LightningBoltIcon, TargetIcon } from "@radix-ui/react-icons";

import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { GeneratedCampaignInsight } from "@/lib/paid-media/insight-data-points";

type CampaignInsightEvidencePanelProps = {
  insights: GeneratedCampaignInsight[];
};

function severityIcon(severity: GeneratedCampaignInsight["severity"]) {
  if (severity === "opportunity") return <LightningBoltIcon className="h-3.5 w-3.5" />;
  if (severity === "critical" || severity === "warning") {
    return <ExclamationTriangleIcon className="h-3.5 w-3.5" />;
  }
  return <TargetIcon className="h-3.5 w-3.5" />;
}

export function CampaignInsightEvidencePanel({ insights }: CampaignInsightEvidencePanelProps) {
  return (
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border/70 bg-card">
      <div className="border-b border-border/70 bg-muted/20 px-3 py-2">
        <h3 className="text-sm font-semibold">Insight Evidence</h3>
        <p className="text-[11px] text-muted-foreground">Generated from normalized matrix and pacing data.</p>
      </div>

      {insights.length === 0 ? (
        <div className="grid min-h-[18rem] place-items-center p-6 text-center text-xs text-muted-foreground">
          Evidence will appear once campaigns have enough comparable metrics.
        </div>
      ) : (
        <ScrollArea className="h-[min(58svh,620px)]">
          <div className="space-y-2 p-2">
            {insights.map((insight) => (
              <article
                key={insight.id}
                className={cn(
                  "rounded-lg border border-border/70 bg-background p-2.5",
                  insight.severity === "opportunity" && "bg-emerald-500/[0.04]",
                  insight.severity === "critical" && "bg-destructive/[0.04]",
                  insight.severity === "warning" && "bg-amber-500/[0.05]"
                )}
              >
                <div className="flex items-start gap-2">
                  <span
                    className={cn(
                      "mt-0.5 rounded-md border border-border/70 bg-card p-1 text-muted-foreground",
                      insight.severity === "opportunity" && "text-emerald-700",
                      insight.severity === "critical" && "text-destructive",
                      insight.severity === "warning" && "text-amber-700"
                    )}
                  >
                    {severityIcon(insight.severity)}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold">{insight.title}</div>
                    <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{insight.summary}</p>
                  </div>
                </div>

                <div className="mt-2 space-y-1">
                  {insight.evidence.map((point) => (
                    <div
                      key={`${insight.id}:${point.metric}:${point.campaignId}`}
                      className="flex items-center justify-between gap-2 rounded-md bg-muted/35 px-2 py-1 text-[10px]"
                    >
                      <span className="truncate">{point.metric.toUpperCase()}</span>
                      <span className="font-medium">{Math.round(point.percentileRank * 100)}th pct</span>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </ScrollArea>
      )}
    </aside>
  );
}


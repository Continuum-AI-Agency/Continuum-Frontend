"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Text } from "@radix-ui/themes";
import type { BrandReportResult } from "@continuum/contracts";

import { recomputeReadiness } from "@/lib/api/brandBook.client";
import { useToast } from "@/components/ui/ToastProvider";

// Derives a human-readable severity label from a 0-100 score.
function scoreBadgeColor(score: number): "green" | "yellow" | "red" | "gray" {
  if (score >= 75) return "green";
  if (score >= 50) return "yellow";
  if (score >= 1) return "red";
  return "gray";
}

type Props = {
  result: BrandReportResult;
  // When provided, exposes a Recalculate action that re-scores the effective
  // brand.md via the Flash-Lite scorer, then refreshes the surface.
  brandId?: string;
};

// Inline read-only scorecard: overall readiness + per-dimension bars and the
// single strategy audit score. Derived entirely from the composite; no fetching.
export function BrandScorecard({ result, brandId }: Props) {
  const router = useRouter();
  const { show } = useToast();
  const [isRecalculating, startRecalculate] = useTransition();

  const onRecalculate = () => {
    if (!brandId) return;
    startRecalculate(async () => {
      try {
        await recomputeReadiness(brandId);
        show({ title: "Readiness recalculated", variant: "success" });
        router.refresh();
      } catch {
        show({ title: "Could not recalculate readiness", variant: "error" });
      }
    });
  };

  const readiness = result.readiness;
  if (!readiness) return null;

  const overall = readiness.overall_score;
  const dimensions = Object.entries(readiness.dimensions ?? {}) as [
    string,
    { score: number; rationale: string },
  ][];

  const strategyAudit = result.audits?.strategy;

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-4 space-y-4">
      <div className="flex items-center gap-3">
        <Text size="2" weight="medium" className="text-gray-200">
          Brand Readiness
        </Text>
        <Badge color={scoreBadgeColor(overall)} variant="soft" radius="full">
          {overall} / 100
        </Badge>
        {strategyAudit ? (
          <Badge color={scoreBadgeColor(strategyAudit.score)} variant="soft" radius="full">
            Strategy {strategyAudit.score}
          </Badge>
        ) : null}
        {brandId ? (
          <Button
            type="button"
            size="1"
            variant="soft"
            className="ml-auto"
            onClick={onRecalculate}
            disabled={isRecalculating}
          >
            {isRecalculating ? "Recalculating…" : "Recalculate"}
          </Button>
        ) : null}
      </div>

      {dimensions.length > 0 ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {dimensions.map(([key, dim]) => (
            <DimensionBar key={key} label={dimensionLabel(key)} score={dim.score} rationale={dim.rationale} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DimensionBar({
  label,
  score,
  rationale,
}: {
  label: string;
  score: number;
  rationale: string;
}) {
  const color = scoreBadgeColor(score);
  const barColor =
    color === "green"
      ? "bg-green-500"
      : color === "yellow"
        ? "bg-yellow-500"
        : color === "red"
          ? "bg-red-500"
          : "bg-gray-600";

  return (
    <div className="space-y-1" title={rationale}>
      <div className="flex items-center justify-between gap-2">
        <Text size="1" className="text-gray-400 truncate">
          {label}
        </Text>
        <Text size="1" weight="medium" className="text-gray-300 shrink-0">
          {score}
        </Text>
      </div>
      <div className="h-1 w-full rounded-full bg-white/10">
        <div
          className={`h-1 rounded-full ${barColor} transition-all`}
          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </div>
    </div>
  );
}

function dimensionLabel(key: string): string {
  const labels: Record<string, string> = {
    value_proposition: "Value prop",
    icp_clarity: "ICP clarity",
    customer_pains: "Customer pains",
    success_metrics: "Success metrics",
    positioning: "Positioning",
    messaging_coherence: "Messaging",
    brand_identity: "Identity",
  };
  return labels[key] ?? key.replace(/_/g, " ");
}

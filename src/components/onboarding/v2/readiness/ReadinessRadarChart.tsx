"use client";

import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart } from "recharts";
import type { BaseTickContentProps } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { BAND_STYLES, bandFor } from "./ScoreBadge";
import { DIMENSION_DISPLAY_ORDER, DIMENSION_LABELS } from "./utils";
import type { ReadinessAnalysis, ReadinessDimension } from "@/lib/onboarding/agentClient";

type Props = {
  readiness: ReadinessAnalysis;
};

type RadarDatum = {
  dimension: ReadinessDimension;
  label: string;
  score: number;
  rationale: string;
};

function renderDimensionTick(scoreByLabel: Map<string, number>) {
  return function DimensionTick({ x, y, textAnchor, payload }: BaseTickContentProps) {
    const label = String(payload.value);
    const score = scoreByLabel.get(label);
    return (
      <text x={x} y={y} textAnchor={textAnchor} dy={4} className="fill-muted-foreground text-[10px]">
        {label}
        {score != null ? ` · ${Math.round(score)}` : ""}
      </text>
    );
  };
}

export function ReadinessRadarChart({ readiness }: Props) {
  const radarData: RadarDatum[] = DIMENSION_DISPLAY_ORDER.map((dim) => {
    const d = readiness.dimensions[dim];
    return { dimension: dim, label: DIMENSION_LABELS[dim], score: d.score, rationale: d.rationale };
  });
  const scoreByLabel = new Map(radarData.map((d) => [d.label, d.score]));

  const overallScore = readiness.overall_score;
  const band = bandFor(overallScore);
  const seriesColor = BAND_STYLES[band].pip;

  const chartConfig: ChartConfig = {
    score: { label: "Score", color: seriesColor },
  };

  return (
    <ChartContainer config={chartConfig} className="h-[240px] w-full">
      <RadarChart data={radarData}>
        <PolarGrid />
        <PolarAngleAxis dataKey="label" tick={renderDimensionTick(scoreByLabel)} />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(value, tooltipPayload) => {
                const row = tooltipPayload?.[0]?.payload as RadarDatum | undefined;
                return (
                  <span className="flex flex-col gap-0.5">
                    <span className="font-medium text-foreground">{row?.label ?? value}</span>
                    {row?.rationale ? (
                      <span className="max-w-[220px] text-2xs font-normal text-muted-foreground">
                        {row.rationale}
                      </span>
                    ) : null}
                  </span>
                );
              }}
            />
          }
        />
        <Radar
          dataKey="score"
          stroke="var(--color-score)"
          strokeWidth={2}
          fill="var(--color-score)"
          fillOpacity={0.18}
          dot={{ r: 5, fill: "var(--color-score)", stroke: "var(--background)", strokeWidth: 2 }}
        />
      </RadarChart>
    </ChartContainer>
  );
}

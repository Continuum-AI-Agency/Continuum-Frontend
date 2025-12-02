 "use client";

import { z } from "zod";

import { http } from "@/lib/api/http";

const runRequestSchema = z.object({
  brandId: z.string().min(1, "brandId is required"),
});

const runResponseSchema = z
  .object({
    run_id: z.string().optional(),
    task_id: z.string().optional(),
    status: z.string().optional(),
  })
  .passthrough();

export type StrategicAnalysisRunResponse = {
  runId?: string;
  taskId?: string;
  status?: string;
};

export async function runStrategicAnalysis(brandId: string): Promise<StrategicAnalysisRunResponse> {
  const { brandId: parsedBrandId } = runRequestSchema.parse({ brandId });

  const response = await http.request({
    path: "/onboarding/strategic-analyses/run",
    method: "POST",
    body: { brand_id: parsedBrandId },
    cache: "no-store",
  });

  const parsed = runResponseSchema.optional().parse(response);
  return parsed
    ? {
        runId: parsed.run_id ?? undefined,
        taskId: parsed.task_id ?? undefined,
        status: parsed.status ?? undefined,
      }
    : {};
}

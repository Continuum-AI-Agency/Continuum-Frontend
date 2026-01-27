"use server";

import "server-only";
import { z } from "zod";
import { httpServer } from "@/lib/api/http.server";

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

export async function runStrategicAnalysisServer(brandId: string): Promise<StrategicAnalysisRunResponse> {
  const { brandId: parsedBrandId } = runRequestSchema.parse({ brandId });

  const response = await httpServer.request({
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

'use server';

import 'server-only';
import { z } from 'zod';
import { httpServer } from '@/lib/api/http.server';
import { readinessFindingSchema } from '@/lib/onboarding/agentClient';

const runRequestSchema = z.object({
  brandId: z.string().min(1, 'brandId is required'),
  readinessScore: z.number().min(0).max(100).nullable().optional(),
  readinessFindings: z.array(readinessFindingSchema).nullable().optional(),
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

export type StrategicAnalysisRunInput = z.input<typeof runRequestSchema>;

export async function runStrategicAnalysisServer(
  input: StrategicAnalysisRunInput,
): Promise<StrategicAnalysisRunResponse> {
  const parsedInput = runRequestSchema.parse(input);

  const response = await httpServer.request({
    path: '/onboarding/strategic-analyses/run',
    method: 'POST',
    body: {
      brand_id: parsedInput.brandId,
      readiness_score: parsedInput.readinessScore ?? null,
      readiness_findings: parsedInput.readinessFindings ?? null,
    },
    cache: 'no-store',
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

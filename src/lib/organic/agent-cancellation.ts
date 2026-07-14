import { z } from 'zod';
import { getApiBaseUrl } from '@/lib/api/config';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';

const CancelledRunSchema = z.object({
  runId: z.string().min(1),
  status: z.literal('cancelled'),
});

const CancelledJobSchema = z.object({
  job: z.discriminatedUnion('status', [
    z.object({
      jobId: z.string().min(1),
      status: z.literal('cancelled'),
      cancelRequested: z.boolean().optional(),
    }),
    z.object({
      jobId: z.string().min(1),
      status: z.literal('running'),
      cancelRequested: z.literal(true),
    }),
  ]),
});

type CancellationRequestDependencies = {
  apiBaseUrl: string;
  fetchImpl: typeof fetch;
  getAccessToken: () => Promise<string | null>;
};

const defaultDependencies = (): CancellationRequestDependencies => ({
  apiBaseUrl: getApiBaseUrl(),
  fetchImpl: fetch,
  getAccessToken: getBrowserAccessToken,
});

async function authenticatedCancellationRequest(
  path: string,
  message: string,
  init: RequestInit,
  dependencies: CancellationRequestDependencies,
): Promise<unknown> {
  const token = await dependencies.getAccessToken();
  if (!token) throw new Error(message);

  const response = await dependencies.fetchImpl(`${dependencies.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) throw new Error(message);

  try {
    return await response.json();
  } catch {
    throw new Error(message);
  }
}

export async function requestOrganicRunCancellation(
  runId: string,
  dependencies: CancellationRequestDependencies = defaultDependencies(),
): Promise<z.infer<typeof CancelledRunSchema>> {
  const message = 'Could not stop the active run.';
  const payload = await authenticatedCancellationRequest(
    `/api/organic/agent/runs/${encodeURIComponent(runId)}/cancel`,
    message,
    { method: 'POST' },
    dependencies,
  );
  const parsed = CancelledRunSchema.safeParse(payload);
  if (!parsed.success || parsed.data.runId !== runId) throw new Error(message);
  return parsed.data;
}

export async function requestOrganicJobCancellation(
  input: { jobId: string; brandId: string },
  dependencies: CancellationRequestDependencies = defaultDependencies(),
): Promise<z.infer<typeof CancelledJobSchema>['job']> {
  const message = 'Could not cancel the queued generation.';
  const payload = await authenticatedCancellationRequest(
    `/api/organic/agent/jobs/${encodeURIComponent(input.jobId)}/cancel`,
    message,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandId: input.brandId }),
    },
    dependencies,
  );
  const parsed = CancelledJobSchema.safeParse(payload);
  if (!parsed.success || parsed.data.job.jobId !== input.jobId) throw new Error(message);
  return parsed.data.job;
}

export async function confirmOrganicRunCancellation(input: {
  runId: string;
  request?: (runId: string) => Promise<unknown>;
  acknowledge: (runId: string) => void | Promise<void>;
  isCurrent: (runId: string) => boolean;
  reconcileCurrent: () => void | Promise<void>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await (input.request ?? requestOrganicRunCancellation)(input.runId);
    await input.acknowledge(input.runId);
    if (input.isCurrent(input.runId)) {
      await input.reconcileCurrent();
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Could not stop the active run.',
    };
  }
}

export async function cancelOrganicJobOptimistically<
  TJob extends { jobId: string; brandId: string },
>(input: {
  job: TJob;
  remove: (jobId: string) => void;
  restore: (job: TJob) => void;
  confirm: (jobId: string) => void;
  notifyFailure: (message: string) => void;
  request?: (job: TJob) => Promise<unknown>;
}): Promise<boolean> {
  input.remove(input.job.jobId);
  try {
    await (input.request ?? requestOrganicJobCancellation)(input.job);
    input.confirm(input.job.jobId);
    return true;
  } catch (error) {
    input.restore(input.job);
    input.notifyFailure(
      error instanceof Error ? error.message : 'Could not cancel the queued generation.',
    );
    return false;
  }
}

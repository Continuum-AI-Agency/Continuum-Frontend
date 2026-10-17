import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { ApiError } from '@/lib/api/errors';

// PP-L1-report-delivery-404-on-open-report: a report whose run the Backend no longer has (swept,
// or written by another Backend) answers its delivery acknowledgement with 404. That is "no
// delivery to record" — the report still renders, nothing is surfaced, and the same run is
// never asked again, so re-renders and re-opens stop adding a failed request each time.
const requests: string[] = [];
let answer: () => Promise<unknown> = async () => ({ ok: true });

mock.module('@/lib/api/http', () => ({
  http: {
    request: async ({ path }: { path: string }) => {
      requests.push(path);
      return answer();
    },
  },
}));

const { acknowledgeReportDelivery, resetReportDeliveryMemory } = await import('./reportDelivery');

describe('acknowledgeReportDelivery', () => {
  beforeEach(() => {
    requests.length = 0;
    resetReportDeliveryMemory();
    answer = async () => ({ ok: true });
  });

  it('posts the acknowledgement for a run the Backend has', async () => {
    await acknowledgeReportDelivery('run_a', 'live_render', 'success');
    expect(requests).toEqual(['/api/agents/jaina/chat/runs/run_a/delivery']);
  });

  it('reads a 404 as no delivery, quietly, and never asks for that run again', async () => {
    answer = async () => {
      throw new ApiError('Run not found', 404);
    };
    await expect(acknowledgeReportDelivery('run_gone', 'hydration_replay', 'success')).resolves.toBe(
      'no_run',
    );
    await acknowledgeReportDelivery('run_gone', 'pdf', 'success');
    expect(requests).toEqual(['/api/agents/jaina/chat/runs/run_gone/delivery']);
  });

  it('swallows any other failure without remembering it: the next open may succeed', async () => {
    answer = async () => {
      throw new ApiError('Upstream down', 503);
    };
    await expect(acknowledgeReportDelivery('run_b', 'live_render', 'success')).resolves.toBe(
      'failed',
    );
    await acknowledgeReportDelivery('run_b', 'live_render', 'success');
    expect(requests).toHaveLength(2);
  });

  it('asks nothing without a run id', async () => {
    await expect(acknowledgeReportDelivery(undefined, 'live_render', 'success')).resolves.toBe(
      'no_run',
    );
    expect(requests).toHaveLength(0);
  });
});

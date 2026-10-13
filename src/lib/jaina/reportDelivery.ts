// The delivery acknowledgement a rendered Jaina report sends back to its run (live render,
// hydration replay or PDF), which the Backend folds into the run's quality outcome.
//
// A 404 is an answer, not a failure: the Backend no longer has the run (swept, or written by
// another Backend), so there is no delivery to record. The report still renders and nothing is
// surfaced (PP-L1-report-delivery-404-on-open-report). The run is remembered for the life of the
// page so a re-render, a re-open or a PDF export never asks for it again — before this every
// open of an old report added a failed request to the console.

import { ApiError } from '@/lib/api/errors';
import { http } from '@/lib/api/http';

export type ReportDeliveryKind = 'live_render' | 'hydration_replay' | 'pdf';
export type ReportDeliveryStatus = 'success' | 'fallback';
export type ReportDeliveryOutcome = 'recorded' | 'no_run' | 'failed';

const runsWithoutDelivery = new Set<string>();

export async function acknowledgeReportDelivery(
  runId: string | undefined,
  kind: ReportDeliveryKind,
  status: ReportDeliveryStatus,
): Promise<ReportDeliveryOutcome> {
  if (!runId || runsWithoutDelivery.has(runId)) return 'no_run';
  try {
    await http.request({
      path: `/api/agents/jaina/chat/runs/${encodeURIComponent(runId)}/delivery`,
      method: 'POST',
      body: { kind, status, report_id: `${runId}:checkpoint_report` },
    });
    return 'recorded';
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      runsWithoutDelivery.add(runId);
      return 'no_run';
    }
    // Telemetry, not the answer: a failed acknowledgement must never touch the report.
    return 'failed';
  }
}

/** Test seam: forget which runs had no delivery. */
export function resetReportDeliveryMemory(): void {
  runsWithoutDelivery.clear();
}

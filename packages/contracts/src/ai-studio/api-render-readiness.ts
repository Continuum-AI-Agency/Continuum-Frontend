import { type ApiRenderFitReport, REPAIRABLE_FIT_REASONS } from './api-render-fit';
import type { ApiRenderBatchReadiness, ApiRenderPreflightResponse } from './api-renders';

/** The readiness codes Forge emits beside the guardrails' own. `code` is a free string on the wire. */
export const READINESS_CODE = {
  assetClipped: 'ASSET_CLIPPED',
  /** A slot with no measured placement or size: a re-parse of the template makes it checkable. */
  fitUnknown: 'ASSET_FIT_UNKNOWN',
  /** Placed by a rig, or text with no live layout: only the finished frame answers it, and does. */
  checkedAfterRender: 'FIT_CHECKED_AFTER_RENDER',
} as const;

export type ApiRenderReadinessFinding = Omit<
  ApiRenderBatchReadiness['findings'][number],
  'rowIndexes'
>;

/**
 * What one row's preflight could not settle, and how. A slot nobody chose an asset for is not a
 * finding: the authored picture renders. A rig-placed slot or a text the Live kit cannot lay out is
 * judged on the finished frame — said, but not "incomplete", because nothing anyone does before the
 * render can answer it. Only what someone could make checkable leaves the check incomplete.
 */
export function readinessFindings(preflight: {
  guardrails?: ApiRenderPreflightResponse['guardrails'];
  fit: Pick<ApiRenderFitReport, 'slots'> | null | undefined;
}): ApiRenderReadinessFinding[] {
  const findings: ApiRenderReadinessFinding[] = [...(preflight.guardrails ?? [])];
  for (const slot of preflight.fit?.slots ?? []) {
    if (slot.state === 'ok' || slot.unknownReason === 'unpinned') continue;
    findings.push({
      code:
        slot.state === 'clipped'
          ? READINESS_CODE.assetClipped
          : slot.unknownReason && REPAIRABLE_FIT_REASONS.includes(slot.unknownReason)
            ? READINESS_CODE.fitUnknown
            : READINESS_CODE.checkedAfterRender,
      severity: slot.state === 'clipped' ? 'warn' : 'unknown',
      message: slot.why,
      variableKey: slot.key,
    });
  }
  return findings;
}

/** Whether a finding leaves its row's check incomplete — something someone could make checkable. */
export const leavesCheckIncomplete = (
  finding: Pick<ApiRenderReadinessFinding, 'code' | 'severity'>,
) => finding.severity === 'unknown' && finding.code !== READINESS_CODE.checkedAfterRender;

/** A batch's readiness from each row's findings, in row order. */
export function readinessOf(rows: readonly ApiRenderReadinessFinding[][]): ApiRenderBatchReadiness {
  const unknownRows = rows.filter((row) => row.some(leavesCheckIncomplete)).length;
  return {
    state: unknownRows > 0 ? 'INCOMPLETE' : 'READY',
    totalRows: rows.length,
    readyRows: rows.length - unknownRows,
    // Blocks never get here: a blocking guardrail refuses the whole batch with a 422.
    blockedRows: 0,
    unknownRows,
    findings: rows.flatMap((row, rowIndex) =>
      row.map((finding) => ({ ...finding, rowIndexes: [rowIndex] })),
    ),
  };
}

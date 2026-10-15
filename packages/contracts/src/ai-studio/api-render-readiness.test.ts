import { describe, expect, test } from 'bun:test';
import type { ApiRenderFitUnknownReason } from './api-render-fit';
import {
  leavesCheckIncomplete,
  READINESS_CODE,
  readinessFindings,
  readinessOf,
} from './api-render-readiness';

const slot = (state: 'ok' | 'clipped' | 'unknown', unknownReason?: ApiRenderFitUnknownReason) => ({
  key: 'hero',
  state,
  unknownReason: unknownReason ?? null,
  why: `${state} ${unknownReason ?? ''}`.trim(),
});
const row = (...slots: ReturnType<typeof slot>[]) =>
  readinessFindings({ fit: { slots } as never, guardrails: [] });

describe('which findings leave a check incomplete', () => {
  test('a slot nobody chose an asset for is no finding at all: the design renders as authored', () => {
    expect(row(slot('unknown', 'unpinned'))).toEqual([]);
  });

  test('a rig or an unlaid text is checked after render, and never makes the batch incomplete', () => {
    const findings = [...row(slot('unknown', 'rigged')), ...row(slot('unknown', 'unlaid'))];
    expect(findings.map((finding) => finding.code)).toEqual([
      READINESS_CODE.checkedAfterRender,
      READINESS_CODE.checkedAfterRender,
    ]);
    expect(findings.some(leavesCheckIncomplete)).toBe(false);
    expect(readinessOf([findings])).toMatchObject({ state: 'READY', unknownRows: 0, readyRows: 1 });
  });

  test('a slot a re-parse would make measurable leaves the row incomplete', () => {
    for (const reason of ['unplaced', 'unsized'] as const) {
      const [finding] = row(slot('unknown', reason));
      expect(finding).toMatchObject({ code: READINESS_CODE.fitUnknown, variableKey: 'hero' });
      expect(readinessOf([[finding!], []])).toMatchObject({
        state: 'INCOMPLETE',
        totalRows: 2,
        readyRows: 1,
        unknownRows: 1,
      });
    }
  });

  test('a brand palette that cannot be checked leaves the row incomplete; clipping only warns', () => {
    const palette = readinessFindings({
      fit: null,
      guardrails: [
        {
          code: 'BRAND_PALETTE_UNKNOWN',
          severity: 'unknown',
          message: 'no palette',
          variableKey: 'bg',
        },
      ],
    });
    expect(palette.some(leavesCheckIncomplete)).toBe(true);
    const clipped = row(slot('clipped'));
    expect(clipped).toMatchObject([{ code: READINESS_CODE.assetClipped, severity: 'warn' }]);
    expect(readinessOf([clipped])).toMatchObject({ state: 'READY' });
  });

  test('each finding names its row', () => {
    const readiness = readinessOf([[], row(slot('unknown', 'unplaced'))]);
    expect(readiness.findings.map((finding) => finding.rowIndexes)).toEqual([[1]]);
  });
});

// Pure frame reducer for the one-click competitor scan stream. Extracted from
// useCompetitorScan so frame handling is testable without DOM or React.

import type { CompetitorScanStage, CompetitorSpyStreamFrame } from '@continuum/contracts';

export type ScanStageState = {
  status: 'started' | 'completed' | 'skipped';
  counts?: Record<string, number>;
};

export type ScanCompetitorRow = {
  competitorId: string;
  competitorName: string;
  fetched: number;
  inserted: number;
  updated: number;
  skippedReason: string | null;
};

export type ScanAnalyzedCreative = {
  snapshotId: string;
  hookArchetype: string | null;
  primaryTheme: string | null;
};

export type ScanGapSummary = {
  status: 'ready' | 'empty';
  gaps: number;
  absent: number;
  losing: number;
  battlegrounds: number;
  edges: number;
};

export type CompetitorScanState = {
  running: boolean;
  stages: Partial<Record<CompetitorScanStage, ScanStageState>>;
  competitors: ScanCompetitorRow[];
  analyzedCreatives: ScanAnalyzedCreative[];
  gapSummary: ScanGapSummary | null;
  error: string | null;
};

export const INITIAL_SCAN_STATE: CompetitorScanState = {
  running: false,
  stages: {},
  competitors: [],
  analyzedCreatives: [],
  gapSummary: null,
  error: null,
};

const ANALYZED_CREATIVES_CAP = 12;

function upsertCompetitor(
  competitors: ScanCompetitorRow[],
  competitorId: string,
  mutate: (row: ScanCompetitorRow) => ScanCompetitorRow,
): ScanCompetitorRow[] {
  const existing = competitors.find((row) => row.competitorId === competitorId);
  const base: ScanCompetitorRow = existing ?? {
    competitorId,
    competitorName: '',
    fetched: 0,
    inserted: 0,
    updated: 0,
    skippedReason: null,
  };
  const next = mutate(base);
  return existing
    ? competitors.map((row) => (row.competitorId === competitorId ? next : row))
    : [...competitors, next];
}

export function reduceScanFrame(
  state: CompetitorScanState,
  frame: CompetitorSpyStreamFrame,
): CompetitorScanState {
  switch (frame.type) {
    case 'scan_stage': {
      const { stage, status, counts } = frame.data;
      return {
        ...state,
        stages: { ...state.stages, [stage]: { status, ...(counts ? { counts } : {}) } },
      };
    }
    case 'competitor_started':
      return {
        ...state,
        competitors: upsertCompetitor(state.competitors, frame.data.competitorId, (row) => ({
          ...row,
          competitorName: frame.data.competitorName,
        })),
      };
    case 'paid_page_resolved':
      return {
        ...state,
        competitors: upsertCompetitor(state.competitors, frame.data.competitorId, (row) => ({
          ...row,
          competitorName: row.competitorName || frame.data.competitorName,
        })),
      };
    case 'snapshot_diff':
      return {
        ...state,
        competitors: upsertCompetitor(state.competitors, frame.data.competitorId, (row) => ({
          ...row,
          fetched: frame.data.fetched,
          inserted: frame.data.inserted,
          updated: frame.data.updated,
        })),
      };
    case 'competitor_skipped':
      return {
        ...state,
        competitors: upsertCompetitor(state.competitors, frame.data.competitorId, (row) => ({
          ...row,
          competitorName: row.competitorName || frame.data.competitorName,
          skippedReason: frame.data.reason,
        })),
      };
    case 'creative_analyzed':
      return {
        ...state,
        analyzedCreatives: [
          ...state.analyzedCreatives,
          {
            snapshotId: frame.data.snapshotId,
            hookArchetype: frame.data.hookArchetype,
            primaryTheme: frame.data.primaryTheme,
          },
        ].slice(-ANALYZED_CREATIVES_CAP),
      };
    case 'gap_report_ready':
      return { ...state, gapSummary: frame.data };
    case 'run_error':
      return { ...state, error: frame.data.message };
    default:
      return state;
  }
}

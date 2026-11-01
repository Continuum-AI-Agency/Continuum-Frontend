import type { TemplateAuthoringCommand, TemplateLayerEdit } from '@continuum/contracts';

export type LayerDraftSnapshot = {
  /** Native source edits are keyed by compId:layerId because layer IDs repeat across comps. */
  edits: Record<string, TemplateLayerEdit>;
  orders: Record<number, number[]>;
  /** Full stack order when authored nodes use stable draft UUID identities. */
  nodeOrders: Record<number, string[]>;
  exposures: Record<string, boolean>;
  /** Authored create/duplicate/delete and draft-node edit commands in their replay order. */
  operations: TemplateAuthoringCommand[];
};

export type LayerHistory<Snapshot = LayerDraftSnapshot> = {
  past: Snapshot[];
  present: Snapshot;
  future: Snapshot[];
  baseline: Snapshot;
  group: string | null;
};

const copy = <T>(value: T): T => structuredClone(value);
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function createLayerHistory<Snapshot>(snapshot: Snapshot): LayerHistory<Snapshot> {
  const initial = copy(snapshot);
  return { past: [], present: initial, future: [], baseline: copy(initial), group: null };
}

export function updateLayerHistory<Snapshot>(
  history: LayerHistory<Snapshot>,
  snapshot: Snapshot,
  group: string | null = null,
): LayerHistory<Snapshot> {
  const next = copy(snapshot);
  if (equal(next, history.present)) return history;
  if (group && group === history.group) {
    return { ...history, present: next, future: [], group };
  }
  return { ...history, past: [...history.past, history.present], present: next, future: [], group };
}

export function endLayerHistoryGroup<Snapshot>(history: LayerHistory<Snapshot>): LayerHistory<Snapshot> {
  return history.group ? { ...history, group: null } : history;
}

export function undoLayerHistory<Snapshot>(history: LayerHistory<Snapshot>): LayerHistory<Snapshot> {
  if (!history.past.length) return history;
  const present = history.past.at(-1)!;
  return {
    ...history,
    past: history.past.slice(0, -1),
    present,
    future: [history.present, ...history.future],
    group: null,
  };
}

export function redoLayerHistory<Snapshot>(history: LayerHistory<Snapshot>): LayerHistory<Snapshot> {
  if (!history.future.length) return history;
  const [present, ...future] = history.future;
  return {
    ...history,
    past: [...history.past, history.present],
    present,
    future,
    group: null,
  };
}

/** Make a successful save the new dirty baseline while retaining edits made during the request. */
export function markLayerHistorySaved<Snapshot>(
  history: LayerHistory<Snapshot>,
  saved: Snapshot,
): LayerHistory<Snapshot> {
  const baseline = copy(saved);
  if (equal(history.present, saved))
    return { past: [], present: baseline, future: [], baseline: copy(baseline), group: null };
  return {
    past: [baseline],
    present: history.present,
    future: [],
    baseline: copy(baseline),
    group: null,
  };
}

export function isLayerHistoryDirty<Snapshot>(history: LayerHistory<Snapshot>): boolean {
  return !equal(history.present, history.baseline);
}

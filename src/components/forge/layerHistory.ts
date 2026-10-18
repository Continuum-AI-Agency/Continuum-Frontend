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

export type LayerHistory = {
  past: LayerDraftSnapshot[];
  present: LayerDraftSnapshot;
  future: LayerDraftSnapshot[];
  baseline: LayerDraftSnapshot;
  group: string | null;
};

const copy = <T>(value: T): T => structuredClone(value);
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function createLayerHistory(snapshot: LayerDraftSnapshot): LayerHistory {
  const initial = copy(snapshot);
  return { past: [], present: initial, future: [], baseline: copy(initial), group: null };
}

export function updateLayerHistory(
  history: LayerHistory,
  snapshot: LayerDraftSnapshot,
  group: string | null = null,
): LayerHistory {
  const next = copy(snapshot);
  if (equal(next, history.present)) return history;
  if (group && group === history.group) {
    return { ...history, present: next, future: [], group };
  }
  return { ...history, past: [...history.past, history.present], present: next, future: [], group };
}

export function endLayerHistoryGroup(history: LayerHistory): LayerHistory {
  return history.group ? { ...history, group: null } : history;
}

export function undoLayerHistory(history: LayerHistory): LayerHistory {
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

export function redoLayerHistory(history: LayerHistory): LayerHistory {
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
export function markLayerHistorySaved(
  history: LayerHistory,
  saved: LayerDraftSnapshot,
): LayerHistory {
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

export function isLayerHistoryDirty(history: LayerHistory): boolean {
  return !equal(history.present, history.baseline);
}

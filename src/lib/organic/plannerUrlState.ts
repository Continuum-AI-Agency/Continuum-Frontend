// The single writer for the planner's URL state.
//
// Two writers used to disagree. The toolbar wrote the view mode through
// `router.replace`, which is a Next transition: the server re-renders, the route
// Suspense boundary takes over, and the STALE tree stays on screen until the new one
// resolves — a view swap that visibly does nothing for seconds. The workspace tabs
// wrote their own param through `history.replaceState` precisely to dodge that.
//
// `history.replaceState` is the correct mechanism for both: planner URL state is a
// deep-link record of what the client is already showing, never an instruction to the
// server. So there is one merge function, and one writer built on it.

export type PlannerUrlState = {
  view?: 'week' | 'month' | 'list';
  tab?: 'planner' | 'metrics' | 'agent';
  /** null REMOVES the param — a dismissed preview panel must not leave a deep link behind. */
  draftId?: string | null;
  edit?: string | null;
};

const PLANNER_PARAM_KEYS = ['view', 'tab', 'draftId', 'edit'] as const;

/**
 * Merge `next` onto an existing search string. Params the planner does not own survive
 * untouched, and so does their order.
 *
 * Accepts a search string with or without its leading `?`. Returns the merged query
 * string WITHOUT a leading `?` (empty when no params remain), the same shape
 * `URLSearchParams.toString()` produces.
 */
export function buildPlannerSearch(currentSearch: string, next: PlannerUrlState): string {
  const params = new URLSearchParams(
    currentSearch.startsWith('?') ? currentSearch.slice(1) : currentSearch,
  );

  for (const key of PLANNER_PARAM_KEYS) {
    const value = next[key];
    // `undefined` means "not part of this patch"; only an explicit null removes.
    if (value === undefined) continue;
    if (value === null) {
      params.delete(key);
      continue;
    }
    params.set(key, value);
  }

  return params.toString();
}

/** Records `next` in the address bar without a Next.js transition. No-op without a `window`. */
export function writePlannerUrlState(next: PlannerUrlState): void {
  if (typeof window === 'undefined') return;

  const search = buildPlannerSearch(window.location.search, next);
  const url = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
  window.history.replaceState(null, '', url);
}

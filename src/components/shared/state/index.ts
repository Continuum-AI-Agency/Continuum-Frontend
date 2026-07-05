// Shared State Kit — data-agnostic presentational primitives for the empty,
// disabled, loading, error, and sample-behind-CTA surfaces across modules
// (IMP-008 + base for BUG-013/014/015). Apply lanes compose these; the
// primitives never fetch data.

export { EmptyState } from "./EmptyState"
export { DisabledReason } from "./DisabledReason"
export { LoadingState } from "./LoadingState"
export { ErrorRetryState } from "./ErrorRetryState"
export { SamplePreview } from "./SamplePreview"
export { DataState, type DataStateStatus } from "./DataState"

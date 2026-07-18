// Shared State Kit — data-agnostic presentational primitives for the empty,
// disabled, loading, error, and sample-behind-CTA surfaces across modules
// (IMP-008 + base for BUG-013/014/015). Apply lanes compose these; the
// primitives never fetch data.

export { DataState, type DataStateStatus } from './DataState';
export { DisabledReason } from './DisabledReason';
export { EmptyState } from './EmptyState';
export { ErrorRetryState } from './ErrorRetryState';
export {
  FreshnessBadge,
  type FreshnessPresentation,
  freshnessBadgePresentation,
} from './FreshnessBadge';
export { LoadingState } from './LoadingState';
export { SamplePreview } from './SamplePreview';

// Explicit skeleton-vs-empty-vs-error switch. The caller passes the resolved
// status, so a skeleton is rendered because the module is loading — never as a
// guess that reads as broken (IMP-031). Data-agnostic: it renders the slot for
// the given status and does no fetching itself.

import type { ReactNode } from 'react';

export type DataStateStatus = 'loading' | 'error' | 'empty' | 'ready';

type DataStateProps = {
  status: DataStateStatus;
  loading?: ReactNode;
  error?: ReactNode;
  empty?: ReactNode;
  children?: ReactNode;
};

export function DataState({ status, loading, error, empty, children }: DataStateProps) {
  switch (status) {
    case 'loading':
      return <>{loading}</>;
    case 'error':
      return <>{error}</>;
    case 'empty':
      return <>{empty}</>;
    case 'ready':
      return <>{children}</>;
  }
}

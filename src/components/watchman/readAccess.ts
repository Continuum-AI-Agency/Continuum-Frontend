import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { ApiError, isFetchFailure } from '@/lib/api/errors';
import { isRequestTimeout } from '@/lib/api/timeout';

export const watchmanAccessDenied = (error: unknown) =>
  error instanceof ApiError && (error.status === 401 || error.status === 403);

export const watchmanReadIsTransient = (error: unknown) =>
  isFetchFailure(error) ||
  isRequestTimeout(error) ||
  (error instanceof ApiError &&
    (error.status === 408 || error.status === 429 || error.status >= 500));

export function clearWatchmanReadData(client: QueryClient, key: QueryKey) {
  // Keep the denial/error state so clearing an active query cannot start a refetch loop.
  for (const query of client.getQueryCache().findAll({ queryKey: key })) {
    query.setState({ data: undefined, dataUpdatedAt: 0 });
  }
}

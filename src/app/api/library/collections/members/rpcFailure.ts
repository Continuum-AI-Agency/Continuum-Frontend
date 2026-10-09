import { NextResponse } from 'next/server';

/** A collection write's RPC error as the route's HTTP answer. */
export function rpcFailure(error: { code?: string; message: string }): Response {
  const status =
    error.code === '42501'
      ? 403
      : error.code === 'P0002'
        ? 404
        : error.code === '22023'
          ? 422
          : error.code === '0A000'
            ? 409
            : 500;
  if (status === 500) console.error('[library/collections/members] write failed', error);
  const message =
    status === 403
      ? 'Only a brand owner, admin or the collection manager can change access'
      : status === 404
        ? 'Collection not found'
        : status === 422
          ? 'That person is not a member of this brand'
          : status === 409
            ? 'Restricting a collection to its members is turned off for now'
            : 'Could not change access';
  return NextResponse.json({ error: message }, { status });
}

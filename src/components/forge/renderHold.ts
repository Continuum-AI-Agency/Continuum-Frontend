// A held batch. When createBatch fails, whatever the status, the client cannot know which rows the
// backend made: it makes rows 1..k-1 and then throws on row k, a pre-insert 409 included. So the
// set holds the batch. While it does, Render opens the held batch, read-only, never a new review:
// its token can be re-sent (each row dedupes on request_id, so a re-send never makes a row twice),
// and Open Render ledger is how the hold is let go. Nothing in it can be edited, so nothing has to
// be compared with the grid.
//
// The token, the request it signed and its expiry live in this module's memory for the page
// session only, so a grid unmount keeps them and nothing stored can be replayed. localStorage keeps
// { batchId, heldAt }, so a reload still stops a second Render. Known residual: the hold is per
// browser. Another browser does not see it; the shared Render ledger is the cross-browser check.

import type { ApiRenderBatchPreflightRequest } from '@continuum/contracts';
import { useSyncExternalStore } from 'react';
import { ApiError, hasBackendError } from '@/lib/api/errors';
import { describeRenderDiscoveryFailure } from '@/StudioCanvas/nodes/api-render/renderDiscoveryCopy';

export type HoldScope = { userId: string; brandId: string; setId: string; templateKey: string };

/** What createBatch was sent: kept so a retry is the identical batch, and the view can say it. */
export type SignedBatch = {
  token: string;
  request: ApiRenderBatchPreflightRequest;
  expiresAt: string;
  batchId: string;
};

export type HoldReason = { kind: 'no-answer' } | { kind: 'refused'; message: string };

export type HeldBatch = {
  batchId: string | null;
  heldAt: number;
  /** Null after a reload, or once the server no longer takes the token. */
  signed: SignedBatch | null;
  /** Why it is held; null after a reload, when only the hold itself is known. */
  reason: HoldReason | null;
};

const keyOf = ({ userId, brandId, setId, templateKey }: HoldScope) =>
  `forge:held-render:${userId}:${brandId}:${setId}:${templateKey}`;

const session = new Map<string, HeldBatch>();
const listeners = new Set<() => void>();
let version = 0;
const changed = () => {
  version += 1;
  for (const listener of listeners) listener();
};

export function readHold(scope: HoldScope): HeldBatch | null {
  const key = keyOf(scope);
  const live = session.get(key);
  if (live) return live;
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? 'null') as {
      batchId?: string | null;
      heldAt?: number;
    } | null;
    if (stored && typeof stored.heldAt === 'number')
      return { batchId: stored.batchId ?? null, heldAt: stored.heldAt, signed: null, reason: null };
  } catch {
    // Unreadable or storage off: nothing is known to be held.
  }
  return null;
}

export function holdBatch(scope: HoldScope, held: Omit<HeldBatch, 'heldAt'>): void {
  const key = keyOf(scope);
  const heldAt = session.get(key)?.heldAt ?? Date.now();
  session.set(key, { ...held, heldAt });
  try {
    localStorage.setItem(key, JSON.stringify({ batchId: held.batchId, heldAt }));
  } catch {
    // Storage full or off: the hold still lasts this page session.
  }
  changed();
}

export function clearHold(scope: HoldScope): void {
  const key = keyOf(scope);
  session.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing stored to remove.
  }
  changed();
}

/** Retry is the identical batch: only while its token is in memory and has not expired. */
export const canRetry = (held: HeldBatch, now = Date.now()): boolean =>
  held.signed !== null && Date.parse(held.signed.expiresAt) > now;

/** The server no longer takes this token: retrying it can only be refused again. */
const TOKEN_GONE = new Set(['expired_confirmation', 'invalid_confirmation']);
export const tokenGone = (error: unknown): boolean =>
  error instanceof ApiError &&
  typeof error.payload?.error === 'string' &&
  TOKEN_GONE.has(error.payload.error);

/** An answer with a reason (a 4xx, or a 5xx that names a code) stopped it; anything else was none. */
export function holdReasonOf(error: unknown): HoldReason {
  const answered =
    error instanceof ApiError &&
    ((error.status < 500 && error.status !== 429) || hasBackendError(error));
  return answered
    ? { kind: 'refused', message: describeRenderDiscoveryFailure(error) }
    : { kind: 'no-answer' };
}

const sentence = (text: string) => text.trim().replace(/[.\s]+$/, '');

export function heldCopy(held: HeldBatch, now = Date.now()): string {
  return [
    held.reason?.kind === 'refused'
      ? `The render service stopped this batch: ${sentence(held.reason.message)}. Rows before it may already be rendering.`
      : held.reason?.kind === 'no-answer'
        ? 'Couldn’t confirm with the render service. Some or all rows may already be rendering.'
        : null,
    canRetry(held, now) ? null : 'Retry isn’t available any more.',
    'Open Render ledger to check before rendering again.',
  ]
    .filter(Boolean)
    .join(' ');
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The set's held batch, kept current across every grid and tray that reads it. */
export function useRenderHold(scope: HoldScope | null): HeldBatch | null {
  useSyncExternalStore(
    subscribe,
    () => version,
    () => version,
  );
  return scope ? readHold(scope) : null;
}

/** What a reload does to this module: its memory is gone, localStorage is not. For tests. */
export function forgetPageSession(): void {
  session.clear();
  changed();
}

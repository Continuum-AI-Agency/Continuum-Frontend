// A held batch. When createBatch fails, whatever the status, the client cannot know which rows the
// backend made: it makes rows 1..k-1 and then throws on row k, a pre-insert 409 included. So the
// template holds the batch. While it does, every surface that renders the template (any Forge set,
// the canvas block, another tab) opens the hold instead of signing a new batch: its token can be
// re-sent (each row dedupes on request_id, so a re-send never makes a row twice), and Open Render
// ledger is how the hold is let go. Nothing in it can be edited, so nothing is compared.
//
// The hold is keyed by user, brand, workspace binding and template, and written to localStorage
// BEFORE createBatch is called, so a reload or a closed tab mid-call leaves it in place. Storage
// keeps { batchId, heldAt, inflight }; the token, the request it signed and its expiry live in this
// module's memory for the page session only, so nothing stored can be replayed. Every mint reads
// storage fresh, and a `storage` listener updates other tabs. Known residual: the hold is per
// browser; another browser does not see it, and the shared Render ledger is the cross-browser check.

import type { ApiRenderBatchPreflightRequest } from '@continuum/contracts';
import { useSyncExternalStore } from 'react';
import { ApiError, hasBackendError } from '@/lib/api/errors';
import { describeRenderDiscoveryFailure } from '@/StudioCanvas/nodes/api-render/renderDiscoveryCopy';

export type HoldScope = {
  userId: string;
  brandId: string;
  /** The workspace binding the template lives in; null for the brand's default. */
  bindingId: string | null;
  templateKey: string;
};

/** What createBatch was sent: kept so a retry is the identical batch, and the view can say it. */
export type SignedBatch = {
  token: string;
  request: ApiRenderBatchPreflightRequest;
  expiresAt: string;
  batchId: string;
};

/**
 * Why a batch is held. `no-answer` (network, timeout, no body, a code-less 5xx or 429) and a 5xx
 * that names its reason can be retried with the same token; a 4xx refusal cannot, because the
 * token is refused the same way and Render's review re-checks what changed.
 */
export type HoldReason =
  | { kind: 'no-answer' }
  | { kind: 'stopped'; message: string; retryable: boolean };

export type HeldBatch = {
  batchId: string | null;
  heldAt: number;
  /** In this page's memory only: null after a reload, in another tab, or once the token is gone. */
  signed: SignedBatch | null;
  /** Why it is held; null when only the stored hold is known. */
  reason: HoldReason | null;
};

/** A user with no id holds nothing and renders nothing: fail closed, never share a key. */
export const SIGNED_OUT = 'Sign in again to render';

/** Thrown at a mint point when a hold exists: the surface opens the hold instead. */
export class RenderHeldError extends Error {
  constructor() {
    super('This template holds an unconfirmed Render.');
    this.name = 'RenderHeldError';
  }
}

type Stored = { batchId: string | null; heldAt: number; inflight?: true };

export const holdKeyOf = ({ userId, brandId, bindingId, templateKey }: HoldScope) =>
  `forge:held-render:${userId}:${brandId}:${bindingId ?? 'default'}:${templateKey}`;

const session = new Map<string, HeldBatch>();
/** Keys this page is confirming right now: written ahead, but not yet held from its own view. */
const confirming = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;
const changed = () => {
  version += 1;
  for (const listener of listeners) listener();
};

function readStored(key: string): Stored | null {
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? 'null') as Stored | null;
    return stored && typeof stored.heldAt === 'number' ? stored : null;
  } catch {
    return null;
  }
}

function write(key: string, stored: Stored | null) {
  try {
    if (stored) localStorage.setItem(key, JSON.stringify(stored));
    else localStorage.removeItem(key);
  } catch {
    // Storage full or off: the hold still lasts this page session.
  }
}

/** Read fresh from storage at every mint: another tab or surface may have written it since. */
export function isHeld(scope: HoldScope): boolean {
  const key = holdKeyOf(scope);
  return session.has(key) || readStored(key) !== null;
}

/** The hold as a surface shows it. A confirm this page has in flight is not held to itself. */
export function readHold(scope: HoldScope): HeldBatch | null {
  const key = holdKeyOf(scope);
  const live = session.get(key);
  if (live) return live;
  if (confirming.has(key)) return null;
  const stored = readStored(key);
  return stored
    ? { batchId: stored.batchId, heldAt: stored.heldAt, signed: null, reason: null }
    : null;
}

export function holdBatch(scope: HoldScope, held: Omit<HeldBatch, 'heldAt'>): void {
  const key = holdKeyOf(scope);
  const heldAt = session.get(key)?.heldAt ?? readStored(key)?.heldAt ?? Date.now();
  session.set(key, { ...held, heldAt });
  write(key, { batchId: held.batchId, heldAt });
  changed();
}

export function clearHold(scope: HoldScope): void {
  const key = holdKeyOf(scope);
  session.delete(key);
  write(key, null);
  changed();
}

/** The server no longer takes this token: retrying it can only be refused again. */
const TOKEN_GONE = new Set(['expired_confirmation', 'invalid_confirmation']);
const tokenGone = (error: unknown): boolean =>
  error instanceof ApiError &&
  typeof error.payload?.error === 'string' &&
  TOKEN_GONE.has(error.payload.error);

/**
 * What stopped it, in the words Forge has for the code, else the backend's own `detail`. First
 * sentence only: a second one is a next step ("Pick the ad again") this view does not offer.
 */
const reasonOf = (error: ApiError) =>
  describeRenderDiscoveryFailure(error)
    .split(/(?<=[.!?])\s+/)[0]!
    .replace(/[.\s]+$/, '');

export function holdReasonOf(error: unknown): HoldReason {
  if (!(error instanceof ApiError)) return { kind: 'no-answer' };
  const refused = error.status >= 400 && error.status < 500 && error.status !== 429;
  if (!refused && !hasBackendError(error)) return { kind: 'no-answer' };
  return { kind: 'stopped', message: reasonOf(error), retryable: !refused };
}

/**
 * createBatch under the hold, for every surface: refused while one exists; written ahead, so a
 * reload mid-call stays held; cleared only on success; on any failure, held with its token.
 */
export async function confirmUnderHold<T>(
  scope: HoldScope,
  signed: SignedBatch,
  send: () => Promise<T>,
): Promise<T> {
  if (isHeld(scope)) throw new RenderHeldError();
  const key = holdKeyOf(scope);
  confirming.add(key);
  write(key, { batchId: signed.batchId, heldAt: Date.now(), inflight: true });
  try {
    const result = await send();
    confirming.delete(key);
    clearHold(scope);
    return result;
  } catch (error) {
    confirming.delete(key);
    holdBatch(scope, { batchId: signed.batchId, signed, reason: holdReasonOf(error) });
    throw error;
  }
}

/** The held batch again, with its own token. Still held on any failure; cleared on success. */
export async function retryHeld<T>(
  scope: HoldScope,
  held: HeldBatch,
  send: (token: string) => Promise<T>,
): Promise<T> {
  if (!held.signed) throw new RenderHeldError();
  try {
    const result = await send(held.signed.token);
    clearHold(scope);
    return result;
  } catch (error) {
    holdBatch(scope, {
      batchId: held.batchId,
      signed: tokenGone(error) ? null : held.signed,
      reason: holdReasonOf(error),
    });
    throw error;
  }
}

/** A held one-row confirm (preflight then createJob) is told apart by its id, not its shape. */
const ONE_JOB = 'job:';
export const oneJobId = (confirmationHash: string) => `${ONE_JOB}${confirmationHash}`;

/** Re-sends a held token the way it was first sent: one job, or a batch. */
export function resendHeld<J>(
  held: HeldBatch,
  token: string,
  api: {
    createBatch(input: { confirmationToken: string }): Promise<{ jobs: J[] }>;
    createJob(input: { confirmationToken: string }): Promise<J>;
  },
): Promise<{ jobs: J[] }> {
  return held.batchId?.startsWith(ONE_JOB)
    ? api.createJob({ confirmationToken: token }).then((job) => ({ jobs: [job] }))
    : api.createBatch({ confirmationToken: token });
}

/** Retry is the identical batch: only while its token is in memory, unexpired, and could land. */
export const canRetry = (held: HeldBatch, now = Date.now()): boolean =>
  held.signed !== null &&
  Date.parse(held.signed.expiresAt) > now &&
  !(held.reason?.kind === 'stopped' && !held.reason.retryable);

export function heldCopy(held: HeldBatch, now = Date.now()): string {
  const { reason } = held;
  if (!reason)
    return 'Retry isn’t available after a reload. Some or all rows may already be rendering. Open Render ledger to check before rendering again.';
  if (reason.kind === 'stopped' && !reason.retryable)
    return `The render service stopped this batch: ${reason.message}. Some rows may already be rendering. Open Render ledger to check, then Render to review again.`;
  return [
    reason.kind === 'stopped'
      ? `The render service stopped this batch: ${reason.message}. Some rows may already be rendering.`
      : 'Couldn’t confirm with the render service. Some or all rows may already be rendering.',
    canRetry(held, now) ? null : 'Retry isn’t available any more.',
    'Open Render ledger to check before rendering again.',
  ]
    .filter(Boolean)
    .join(' ');
}

// Another tab's write arrives as a `storage` event: re-read, so its hold shows here too.
const onStorage = (event: Event) => {
  const { key } = event as StorageEvent;
  if (!key || key.startsWith('forge:held-render:')) changed();
};

const subscribe = (listener: () => void) => {
  if (listeners.size === 0 && typeof window !== 'undefined')
    window.addEventListener('storage', onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== 'undefined')
      window.removeEventListener('storage', onStorage);
  };
};

/** The template's held batch, current across every surface and tab that reads it. */
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
  confirming.clear();
  changed();
}

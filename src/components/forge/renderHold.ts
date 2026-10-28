// A held batch. When createBatch fails, whatever the status, the client cannot know which rows the
// backend made: it makes rows 1..k-1 and then throws on row k, a pre-insert 409 included. So the
// template holds the batch. While it does, every surface that renders the template (any Forge set,
// the canvas node, another tab) opens the hold instead of sending a new batch: its token can be
// re-sent (each row dedupes on request_id, so a re-send never makes a row twice), and Open Render
// ledger is how the hold is let go. Nothing in it can be edited, so nothing is compared.
//
// Two stores. localStorage says whether a hold exists, and only it: a hold exists while its key
// does, keyed by user, brand, workspace binding and template, holding { batchId, heldAt, inflight }.
// It is written BEFORE createBatch is called, so a reload or a closed tab mid-call stays held, and
// a send that cannot write it is not made. This page's memory keeps the token (with the request it
// signed and its expiry) by batchId, usable only while storage still names that batch; nothing
// stored can be replayed. Known residual: the hold is per browser; another browser does not see
// it, and the shared Render ledger is the cross-browser check.

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
  /** The grid's review signature of the rows sent (reviewSignature), to tell later edits apart. */
  rows?: string;
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
  /** Written ahead and not yet answered: a send may still be on its way. */
  inflight: boolean;
  /** This page's token for the batch: null after a reload or in another tab. */
  signed: SignedBatch | null;
  /** Why it is held; null when only the stored hold is known. */
  reason: HoldReason | null;
};

/** A user with no id holds nothing and renders nothing: fail closed, never share a key. */
export const SIGNED_OUT = 'Sign in again to render';
export const STORAGE_OFF =
  'Your browser isn’t saving data for this site, so Forge can’t protect this render from being sent twice. Free up site storage or allow it, then try again.';
export const SESSION_EXPIRED = 'Your session expired. Sign in again, then Render.';
/** How long a send written ahead in another tab, or before a reload, may still be on its way. */
export const SENDING_MS = 150_000;

/** Thrown at a send when a hold exists, or the hold could not be written: nothing was sent. */
export class RenderHeldError extends Error {
  constructor(message = 'This template holds an unconfirmed Render.') {
    super(message);
    this.name = 'RenderHeldError';
  }
}

/** 401 and 403 come before anything is created: not held, but the person must sign in again. */
export const isSessionRefusal = (error: unknown): boolean =>
  error instanceof ApiError && (error.status === 401 || error.status === 403);

type Stored = { batchId: string | null; heldAt: number; inflight?: true };
type Token = { signed: SignedBatch; reason: HoldReason | null; sending?: true };

export const holdKeyOf = ({ userId, brandId, bindingId, templateKey }: HoldScope) =>
  `forge:held-render:${userId}:${brandId}:${bindingId ?? 'default'}:${templateKey}`;

const tokens = new Map<string, Token>();
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

/** False when the browser would not keep it: then nothing that relies on it may be sent. */
function write(key: string, stored: Stored | null): boolean {
  try {
    if (stored) localStorage.setItem(key, JSON.stringify(stored));
    else localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/** Storage, read fresh: another tab or surface may have written or cleared it since. */
export const isHeld = (scope: HoldScope): boolean => readStored(holdKeyOf(scope)) !== null;

/** The hold as a surface shows it. A send this page has in flight is not held to itself. */
export function readHold(scope: HoldScope): HeldBatch | null {
  const stored = readStored(holdKeyOf(scope));
  if (!stored) return null;
  const token = stored.batchId ? tokens.get(stored.batchId) : undefined;
  if (token?.sending) return null;
  return {
    batchId: stored.batchId,
    heldAt: stored.heldAt,
    inflight: stored.inflight === true,
    signed: token?.signed ?? null,
    reason: token?.reason ?? null,
  };
}

export function clearHold(scope: HoldScope): void {
  const key = holdKeyOf(scope);
  const stored = readStored(key);
  if (stored?.batchId) tokens.delete(stored.batchId);
  write(key, null);
  changed();
}

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

/** Held after a send failed: the stored hold loses `inflight`, the token keeps its reason. */
function heldAfter(key: string, batchId: string, heldAt: number, token: Token) {
  tokens.set(batchId, token);
  write(key, { batchId, heldAt });
  changed();
}

/**
 * createBatch (or a one-row createJob) under the hold, for every surface: refused while a hold
 * exists or while one cannot be written; written ahead, so a reload mid-call stays held; cleared
 * only on success; on any failure but a 401/403, held with its token.
 */
export async function confirmUnderHold<T>(
  scope: HoldScope,
  signed: SignedBatch,
  send: () => Promise<T>,
): Promise<T> {
  const key = holdKeyOf(scope);
  if (isHeld(scope)) throw new RenderHeldError();
  const heldAt = Date.now();
  if (!write(key, { batchId: signed.batchId, heldAt, inflight: true }))
    throw new RenderHeldError(STORAGE_OFF);
  tokens.set(signed.batchId, { signed, reason: null, sending: true });
  try {
    const result = await send();
    clearHold(scope);
    return result;
  } catch (error) {
    if (isSessionRefusal(error)) clearHold(scope);
    else heldAfter(key, signed.batchId, heldAt, { signed, reason: holdReasonOf(error) });
    throw error;
  }
}

/** Retry is the identical batch: only while its token is in memory, unexpired, and could land. */
export const canRetry = (held: HeldBatch, now = Date.now()): boolean =>
  held.signed !== null &&
  !sendingElsewhere(held, now) &&
  Date.parse(held.signed.expiresAt) > now &&
  !(held.reason?.kind === 'stopped' && !held.reason.retryable);

/**
 * The held batch again, with its own token, read fresh: nothing is sent once another tab has let
 * the hold go, or the token has expired. Still held on any failure; cleared on success.
 */
export async function retryHeld<T>(
  scope: HoldScope,
  send: (token: string, held: HeldBatch) => Promise<T>,
): Promise<T> {
  const key = holdKeyOf(scope);
  const held = readHold(scope);
  if (!held?.signed || !held.batchId || !canRetry(held)) throw new RenderHeldError();
  const { signed } = held;
  tokens.set(held.batchId, { signed, reason: held.reason, sending: true });
  try {
    const result = await send(signed.token, held);
    clearHold(scope);
    return result;
  } catch (error) {
    // A 4xx (an expired or no-longer-matching token included) cannot land: its reason says so.
    heldAfter(key, held.batchId, held.heldAt, { signed, reason: holdReasonOf(error) });
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

/** Written ahead by another tab, or before a reload, and young enough to still be on its way. */
export const sendingElsewhere = (held: HeldBatch, now = Date.now()): boolean =>
  held.inflight && held.signed === null && now - held.heldAt < SENDING_MS;

export function heldCopy(held: HeldBatch, now = Date.now()): string {
  const { reason } = held;
  if (sendingElsewhere(held, now))
    return 'A Render of this template is still being sent. Wait a moment, then check the Render ledger.';
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

// Another tab's write or clear arrives as a `storage` event: a cleared key takes this page's token
// for that batch with it, and every surface re-reads.
const onStorage = (event: Event) => {
  const { key, oldValue, newValue } = event as StorageEvent;
  if (key && !key.startsWith('forge:held-render:')) return;
  if (oldValue) {
    try {
      const before = (JSON.parse(oldValue) as Stored).batchId;
      const after = newValue ? (JSON.parse(newValue) as Stored).batchId : null;
      if (before && before !== after) tokens.delete(before);
    } catch {
      // Not a hold record: nothing of ours to drop.
    }
  }
  changed();
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
  tokens.clear();
  changed();
}

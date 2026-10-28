// A held batch. When createBatch fails, whatever the status, the client cannot know which rows the
// backend made: it makes rows 1..k-1 and then throws on row k, a pre-insert 409 included. So the
// render set holds the batch. While it does, the set (in any tab) opens the hold instead of sending
// a new batch: its token can be re-sent (each row dedupes on request_id, so a re-send never makes a
// row twice), and Open Render ledger is how the hold is let go. Nothing in it can be edited.
//
// Two stores. localStorage says whether a hold exists: a hold exists while its key does, keyed by
// user, brand, workspace binding, template and render set, holding { batchId, heldAt, inflight }.
// It is written BEFORE each send (the first createBatch and every retry) and beats every BEAT_MS
// while the call is outstanding, so a reload or a closed tab mid-call stays held and a live send
// in another tab is never let go. A browser that will not save it still sends, held in this page's
// memory only, and says so. This page's memory keeps the token (with the request it signed and
// its expiry) by batchId, usable only while the hold still names that batch; nothing stored can
// be replayed.
//
// ponytail: residuals, by design. The hold is per browser; another browser does not see it, and
// the shared Render ledger is the cross-browser check. One key holds one batch: two tabs whose
// first sends race past the read-back both send, and the later failure is the hold left.

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
  /** The Forge render set that sent it; null for the canvas node, which holds its own. */
  renderSetId: string | null;
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
  /** False when the browser would not save it: a reload forgets it, so the ledger is the check. */
  saved: boolean;
  /** This page's token for the batch: null after a reload or in another tab. */
  signed: SignedBatch | null;
  /** Why it is held; null when only the stored hold is known. */
  reason: HoldReason | null;
  /** This page is re-sending it now: the view stays, Retry waits. */
  sending: boolean;
};

/** A user with no id holds nothing and renders nothing: fail closed, never share a key. */
export const SIGNED_OUT = 'Sign in again to render';
export const NOT_SAVED =
  'Your browser isn’t saving data for this site, so a reload won’t remember this send. If it doesn’t confirm, check the Render ledger before rendering again.';
export const SESSION_EXPIRED = 'Your session expired. Sign in again, then Render.';
/** How often an outstanding send says it is still on its way, and how long its silence means not. */
export const BEAT_MS = 30_000;
export const STALE_MS = 60_000;

/** Thrown at a send when a hold exists, or another tab's write won the key: nothing was sent. */
export class RenderHeldError extends Error {
  constructor(message = 'This template holds an unconfirmed Render.') {
    super(message);
    this.name = 'RenderHeldError';
  }
}

/**
 * 401 and 403 come before anything is created: not held, but the person must sign in again. The
 * backend authenticates before the loop (Continuum-Backend App/ai-studio/api-renders/routes.ts,
 * POST /api/ai-studio/renders/batches: `authenticated(request)` before `service.createBatch`), and
 * createBatch's per-row createJob raises no 401 or 403 (checked 2026-10-28 at 8900795ad).
 */
export const isSessionRefusal = (error: unknown): boolean =>
  error instanceof ApiError && (error.status === 401 || error.status === 403);

type Stored = { batchId: string | null; heldAt: number; inflight?: true };
type Token = { signed: SignedBatch; reason: HoldReason | null; sending?: 'first' | 'retry' };

export const holdKeyOf = ({ userId, brandId, bindingId, templateKey, renderSetId }: HoldScope) =>
  `forge:held-render:${userId}:${brandId}:${bindingId ?? 'default'}:${templateKey}:${renderSetId ?? 'canvas'}`;

const tokens = new Map<string, Token>();
/** Holds the browser would not save, by key: this page's memory is all there is of them. */
const unsaved = new Map<string, Stored>();
const listeners = new Set<() => void>();
let version = 0;
const changed = () => {
  version += 1;
  for (const listener of listeners) listener();
};

function readStored(key: string): Stored | null {
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? 'null') as Stored | null;
    if (stored && typeof stored.heldAt === 'number') return stored;
  } catch {
    // Unreadable or blocked: what this page holds in memory, if anything.
  }
  return unsaved.get(key) ?? null;
}

/** Always recorded; false when only this page's memory has it, because the browser would not save it. */
function write(key: string, stored: Stored | null): boolean {
  if (stored) unsaved.set(key, stored);
  else unsaved.delete(key);
  try {
    if (stored) localStorage.setItem(key, JSON.stringify(stored));
    else localStorage.removeItem(key);
    unsaved.delete(key);
    return true;
  } catch {
    return false;
  }
}

/** Read fresh: another tab may have written or cleared it since. */
export const isHeld = (scope: HoldScope): boolean => readStored(holdKeyOf(scope)) !== null;

/** The hold as a surface shows it. A first send this page has in flight is not held to itself. */
export function readHold(scope: HoldScope): HeldBatch | null {
  const stored = readStored(holdKeyOf(scope));
  if (!stored) return null;
  const token = stored.batchId ? tokens.get(stored.batchId) : undefined;
  if (token?.sending === 'first') return null;
  return {
    batchId: stored.batchId,
    heldAt: stored.heldAt,
    inflight: stored.inflight === true,
    saved: !unsaved.has(holdKeyOf(scope)),
    signed: token?.signed ?? null,
    reason: token?.reason ?? null,
    sending: token?.sending === 'retry',
  };
}

/** Lets go of this batch's hold, and only of it: a send that finished never clears a newer one. */
export function clearHold(scope: HoldScope, batchId: string | null): void {
  const key = holdKeyOf(scope);
  if (batchId) tokens.delete(batchId);
  if (readStored(key)?.batchId === batchId) write(key, null);
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
 * One send under the hold: written ahead with `inflight`, read back (another tab that wrote between
 * our read and our write has the key, and opens it instead), beating every BEAT_MS until it is
 * answered. Cleared on success, for this batch only; on failure, held with its token, except a
 * first send's 401/403, which made nothing.
 */
async function sendUnderHold<T>(
  scope: HoldScope,
  signed: SignedBatch,
  {
    heldAt,
    reason,
    first,
    onNotSaved,
  }: {
    heldAt: number;
    reason: HoldReason | null;
    first: boolean;
    onNotSaved?: () => void;
  },
  send: () => Promise<T>,
): Promise<T> {
  const key = holdKeyOf(scope);
  const { batchId } = signed;
  const beat = () => write(key, { batchId, heldAt: Date.now(), inflight: true });
  if (!beat()) onNotSaved?.();
  if (readStored(key)?.batchId !== batchId) {
    changed();
    throw new RenderHeldError();
  }
  tokens.set(batchId, { signed, reason, sending: first ? 'first' : 'retry' });
  // A retry is shown while it runs: every reader re-reads, and sees it sending.
  if (!first) changed();
  const timer = setInterval(() => {
    if (readStored(key)?.batchId === batchId) beat();
  }, BEAT_MS);
  try {
    const result = await send();
    clearHold(scope, batchId);
    return result;
  } catch (error) {
    if (first && isSessionRefusal(error)) clearHold(scope, batchId);
    else heldAfter(key, batchId, heldAt, { signed, reason: holdReasonOf(error) });
    throw error;
  } finally {
    clearInterval(timer);
  }
}

/**
 * createBatch (or a one-row createJob) under the hold: refused while a hold exists; otherwise
 * sent, even when the browser will not save the hold (`onNotSaved` says so).
 */
export async function confirmUnderHold<T>(
  scope: HoldScope,
  signed: SignedBatch,
  send: () => Promise<T>,
  { onNotSaved }: { onNotSaved?: () => void } = {},
): Promise<T> {
  if (isHeld(scope)) throw new RenderHeldError();
  return sendUnderHold(
    scope,
    signed,
    { heldAt: Date.now(), reason: null, first: true, onNotSaved },
    send,
  );
}

/** Retry is the identical batch: only while its token is in memory, unexpired, and could land. */
export const canRetry = (held: HeldBatch, now = Date.now()): boolean =>
  held.signed !== null &&
  !held.sending &&
  !sendingElsewhere(held, now) &&
  Date.parse(held.signed.expiresAt) > now &&
  !(held.reason?.kind === 'stopped' && !held.reason.retryable);

/**
 * The held batch again, with its own token, read fresh: nothing is sent once another tab has let
 * the hold go, or the token has expired. Beats like the first send; still held on any failure.
 */
export async function retryHeld<T>(
  scope: HoldScope,
  send: (token: string, held: HeldBatch) => Promise<T>,
): Promise<T> {
  const held = readHold(scope);
  if (!held?.signed || !held.batchId || !canRetry(held)) throw new RenderHeldError();
  const { signed } = held;
  return sendUnderHold(
    scope,
    signed,
    { heldAt: held.heldAt, reason: held.reason, first: false },
    () => send(signed.token, held),
  );
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

/** Another tab's send, still beating: on its way however long its retries run, never let go. */
export const sendingElsewhere = (held: HeldBatch, now = Date.now()): boolean =>
  held.inflight && held.signed === null && now - held.heldAt < STALE_MS;

export function heldCopy(held: HeldBatch, now = Date.now()): string {
  const { reason } = held;
  if (sendingElsewhere(held, now))
    return 'A Render of this set is still being sent. Wait a moment, then check the Render ledger.';
  // No token here: this page reloaded, or another tab sent it. The stored record does not say which,
  // so the copy is the same for both.
  if (!reason)
    return [
      'Retry isn’t available on this page. Some or all rows may already be rendering. Open Render ledger to check before rendering again.',
      // Its tab is gone mid-send: the server may still be making rows it was sent.
      held.inflight
        ? 'Rows can keep appearing in the Render ledger for a few minutes after a send stops; check again before rendering any that are missing.'
        : null,
    ]
      .filter(Boolean)
      .join(' ');
  // A reason that already names the render service is said as it is, not after a second prefix.
  const stopped = (message: string) =>
    message.startsWith('The render service')
      ? `${message}.`
      : `The render service stopped this batch: ${message}.`;
  if (reason.kind === 'stopped' && !reason.retryable)
    return `${stopped(reason.message)} Some rows may already be rendering. Open Render ledger to check, then Render to review again.`;
  return [
    reason.kind === 'stopped'
      ? `${stopped(reason.message)} Some rows may already be rendering.`
      : 'Couldn’t confirm with the render service. Some or all rows may already be rendering.',
    canRetry(held, now) || held.sending ? null : 'Retry isn’t available any more.',
    'Open Render ledger to check before rendering again.',
  ]
    .filter(Boolean)
    .join(' ');
}

// Another tab's write or clear arrives as a `storage` event: a cleared key takes this page's token
// for that batch with it, and every reader re-reads.
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

/** The set's held batch (the canvas node's, for null), current in every tab that reads it. */
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
  unsaved.clear();
  changed();
}

// A held batch. When createBatch fails, whatever the status, the client cannot know which rows the
// backend made (it makes rows 1..k-1, then throws on row k), so the render set holds the batch: in
// any tab its Render opens the hold, whose token can be re-sent (rows dedupe on request_id), and
// Open Render ledger lets it go. localStorage says a hold exists ({ batchId, heldAt, inflight } per
// user, brand, binding, template and set), written before each send and beating while it is out.
// This page's memory, by the same key, keeps the token (never stored) and, when the browser will
// not save, the hold itself.
// ponytail: per browser (the shared Render ledger is the cross-browser check), and one key holds
// one batch: two tabs whose first sends race past the read-back both send.

import type { ApiRenderBatchPreflightRequest } from '@continuum/contracts';
import { useSyncExternalStore } from 'react';
import { ApiError, hasBackendError } from '@/lib/api/errors';
import { describeRenderDiscoveryFailure } from '@/StudioCanvas/nodes/api-render/renderDiscoveryCopy';

export type HoldScope = {
  userId: string;
  brandId: string;
  bindingId: string | null;
  templateKey: string;
  renderSetId: string;
};

/** What createBatch was sent: kept so a retry is the identical batch, and the view can say it. */
export type SignedBatch = {
  token: string;
  request: ApiRenderBatchPreflightRequest;
  expiresAt: string;
  batchId: string;
  rows?: string; // rowsOfSignature of what was sent, to tell later edits apart
};

/** Why a batch is held, as data; heldCopy says it. `detail` is the service's words, when it had some. */
export type HoldReason = {
  kind: 'no_answer' | 'busy' | 'refused' | 'session' | 'permission' | 'set_changed';
  detail?: string;
};

/** `signed` and `reason` are this page's (null after a reload or in another tab); `sending` is its retry. */
export type HeldBatch = {
  batchId: string | null;
  heldAt: number;
  inflight: boolean;
  saved: boolean;
  signed: SignedBatch | null;
  reason: HoldReason | null;
  sending: boolean;
};

/** A user with no id holds nothing and renders nothing: fail closed, never share a key. */
export const SIGNED_OUT = 'Sign in again to render';
export const NOT_SAVED =
  'Your browser isn’t saving data for this site, so a reload won’t remember this send. If it doesn’t confirm, check the Render ledger before rendering again.';
export const SESSION_EXPIRED = 'Your session expired. Sign in again, then Render.';
export const SESSION_RETRY = 'Your session expired. Sign in again, then Retry.';
export const SESSION_CHECK = 'Your session expired. Sign in again, then Check again.';
export const SET_CHANGED = 'This set changed somewhere else. Reload it, then Render.';
/** Why a held set's rows cannot be copied, deleted, re-pinned or replaced. */
export const HELD_SET = 'Check the Render ledger first';
/** How often an outstanding send says it is still on its way, and how long its silence means not. */
export const BEAT_MS = 30_000;
export const STALE_MS = 60_000;

/** Thrown at a send when a hold exists, or another tab's write won the key: nothing was sent. */
export class RenderHeldError extends Error {
  override name = 'RenderHeldError';
}

// A first send's 401/403 or moved set made nothing, so it is not held. Continuum-Backend routes.ts
// authenticates before service.createBatch, whose loop raises no 401/403 and no set or revision
// code, only the binding's (checked 2026-10-28 at 8900795ad and 0825783d3).
export const isSessionRefusal = (error: unknown): boolean =>
  error instanceof ApiError && (error.status === 401 || error.status === 403);

const codeOf = (error: ApiError) =>
  error.code ?? (typeof error.payload?.error === 'string' ? error.payload.error : error.message);
export const isSetChanged = (error: unknown): boolean =>
  error instanceof ApiError && error.status < 500 && /render_set|revision/.test(codeOf(error));

/**
 * The service's reason only, its first sentence: its own next step ("Review the rows again, then
 * render.") is not one the held view offers, so heldCopy adds the one it does. Cut once, here,
 * where the answer becomes data; a review refusal outside the hold keeps the whole message.
 */
const reasonOf = (error: ApiError) =>
  describeRenderDiscoveryFailure(error).match(/^.+?[.!?](?=\s|$)/)?.[0] ??
  describeRenderDiscoveryFailure(error);

export function holdReasonOf(error: unknown): HoldReason {
  if (!(error instanceof ApiError)) return { kind: 'no_answer' };
  if (error.status === 401) return { kind: 'session' };
  if (error.status === 403) return { kind: 'permission' };
  if (isSetChanged(error)) return { kind: 'set_changed' };
  if (error.status >= 500 || error.status === 429)
    return { kind: 'busy', detail: hasBackendError(error) ? reasonOf(error) : undefined };
  return { kind: 'refused', detail: reasonOf(error) };
}

type Stored = { batchId: string | null; heldAt: number; inflight?: true };
type Memory = {
  signed?: SignedBatch;
  reason?: HoldReason;
  sending?: 'first' | 'retry';
  unsaved?: Stored;
};

export const holdKeyOf = ({ userId, brandId, bindingId, templateKey, renderSetId }: HoldScope) =>
  `${PREFIX}${userId}:${brandId}:${bindingId ?? 'default'}:${templateKey}:${renderSetId}`;

const PREFIX = 'forge:held-render:';
const memory = new Map<string, Memory>();
const listeners = new Set<() => void>();
let version = 0;
/** The one notification path: every reader re-reads. */
const changed = () => {
  version += 1;
  for (const listener of listeners) listener();
};
const getVersion = () => version;
const remember = (key: string, patch: Memory) => memory.set(key, { ...memory.get(key), ...patch });

function readStored(key: string): Stored | null {
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? 'null') as Stored | null;
    if (stored && typeof stored.heldAt === 'number') return stored;
  } catch {
    // Unreadable or blocked: what this page holds in memory, if anything.
  }
  return memory.get(key)?.unsaved ?? null;
}

/** Always recorded; false when only this page's memory has it. */
function write(key: string, stored: Stored | null): boolean {
  remember(key, { unsaved: stored ?? undefined });
  try {
    if (stored) localStorage.setItem(key, JSON.stringify(stored));
    else localStorage.removeItem(key);
  } catch {
    return false;
  }
  remember(key, { unsaved: undefined });
  return true;
}

export const isHeld = (scope: HoldScope): boolean => readStored(holdKeyOf(scope)) !== null;

/** The hold as the view shows it. A first send this page has in flight is not held to itself. */
export function readHold(scope: HoldScope): HeldBatch | null {
  const key = holdKeyOf(scope);
  const stored = readStored(key);
  if (!stored) return null;
  const entry = memory.get(key);
  const mine = entry?.signed?.batchId === stored.batchId ? entry : undefined;
  if (mine?.sending === 'first') return null;
  return {
    batchId: stored.batchId,
    heldAt: stored.heldAt,
    inflight: stored.inflight === true,
    saved: !entry?.unsaved,
    signed: mine?.signed ?? null,
    reason: mine?.reason ?? null,
    sending: mine?.sending === 'retry',
  };
}

/** Lets go of this batch's hold, and only of it: a send that finished never clears a newer one. */
export function clearHold(scope: HoldScope, batchId: string | null): void {
  const key = holdKeyOf(scope);
  if (readStored(key)?.batchId === batchId) write(key, null);
  if (!readStored(key) || memory.get(key)?.signed?.batchId === batchId) memory.delete(key);
  changed();
}

// One send, the first or a retry: written ahead and read back (another tab's batch there means
// not ours to send), beating until answered. Success clears this batch only; a failure holds it,
// with why, while the key still names it. A first send is refused while a hold exists, and still
// sent when the browser won't save (`onNotSaved`).
export async function confirmUnderHold<T>(
  scope: HoldScope,
  signed: SignedBatch,
  send: () => Promise<T>,
  { onNotSaved, retryOf }: { onNotSaved?: () => void; retryOf?: HeldBatch } = {},
): Promise<T> {
  const key = holdKeyOf(scope);
  const { batchId } = signed;
  const heldAt = retryOf?.heldAt ?? Date.now();
  if (!retryOf && isHeld(scope)) throw new RenderHeldError();
  const beat = () => write(key, { batchId, heldAt: Date.now(), inflight: true });
  if (!beat()) onNotSaved?.();
  if (readStored(key)?.batchId !== batchId) {
    changed();
    throw new RenderHeldError();
  }
  remember(key, { signed, sending: retryOf ? 'retry' : 'first' });
  // A retry is shown while it runs: every reader re-reads, and sees it sending.
  if (retryOf) changed();
  const timer = setInterval(() => {
    if (readStored(key)?.batchId === batchId) beat();
  }, BEAT_MS);
  try {
    const result = await send();
    clearHold(scope, batchId);
    return result;
  } catch (error) {
    if (!retryOf && (isSessionRefusal(error) || isSetChanged(error))) clearHold(scope, batchId);
    else if (readStored(key)?.batchId === batchId) {
      remember(key, { reason: holdReasonOf(error), sending: undefined });
      write(key, { batchId, heldAt });
    } else memory.delete(key);
    changed();
    throw error;
  } finally {
    clearInterval(timer);
  }
}

/** Retry is the identical batch: its token in memory, unexpired, and a reason it could land. */
export const canRetry = (held: HeldBatch, now = Date.now()): boolean =>
  held.signed !== null &&
  !held.sending &&
  !sendingElsewhere(held, now) &&
  Date.parse(held.signed.expiresAt) > now &&
  ['no_answer', 'busy', 'session'].includes(held.reason?.kind ?? '');

/** The held batch again, with its own token, read fresh. Beats like the first send. */
export function retryHeld<T>(scope: HoldScope, send: (token: string) => Promise<T>): Promise<T> {
  const held = readHold(scope);
  if (!held?.signed || !canRetry(held)) return Promise.reject(new RenderHeldError());
  const { signed } = held;
  return confirmUnderHold(scope, signed, () => send(signed.token), { retryOf: held });
}

/** Another tab's send, still beating: on its way however long its retries run, never let go. */
export const sendingElsewhere = (held: HeldBatch, now = Date.now()): boolean =>
  held.inflight && held.signed === null && now - held.heldAt < STALE_MS;

/** The held view's one line: built from the reason, never from other copy. */
export function heldCopy(held: HeldBatch, now = Date.now()): string {
  const { reason } = held;
  if (sendingElsewhere(held, now))
    return 'A Render of this set is still being sent. Wait a moment, then check the Render ledger.';
  // No token here: this page reloaded, or another tab sent it, and storage does not say which. An
  // orphaned send (its tab gone) may still be making rows.
  if (!reason)
    return `Retry isn’t available on this page. Some or all rows may already be rendering. Open Render ledger to check before rendering again.${
      held.inflight
        ? ' Rows can keep appearing in the Render ledger for a few minutes after a send stops; check again before rendering any that are missing.'
        : ''
    }`;
  switch (reason.kind) {
    case 'session':
      return SESSION_RETRY;
    case 'permission':
      return 'You don’t have permission to render here any more. Open Render ledger to check what was sent.';
    case 'set_changed':
      return 'This set changed somewhere else while sending. Some rows may already be rendering. Open Render ledger to check, then reload the set.';
    case 'refused':
      return `${reason.detail} Some rows may already be rendering. Open Render ledger to check, then Render to review again.`;
    default:
      return `${
        reason.detail
          ? `${reason.detail} Some rows may already be rendering.`
          : 'Couldn’t confirm with the render service. Some or all rows may already be rendering.'
      }${canRetry(held, now) || held.sending ? '' : ' Retry isn’t available any more.'} Open Render ledger to check before rendering again.`;
  }
}

// Another tab's write or clear arrives as a `storage` event: a cleared key takes this page's token
// for it, and every reader re-reads.
const onStorage = ({ key, newValue }: StorageEvent) => {
  if (key?.startsWith(PREFIX) && newValue === null) memory.delete(key);
  if (!key || key.startsWith(PREFIX)) changed();
};
if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The set's held batch, current in every tab that reads it. */
export function useRenderHold(scope: HoldScope | null): HeldBatch | null {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return scope ? readHold(scope) : null;
}

/** What a reload does to this module: its memory is gone, localStorage is not. For tests. */
export function forgetPageSession(): void {
  memory.clear();
  changed();
}

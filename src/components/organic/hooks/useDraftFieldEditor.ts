'use client';

import {
  formatPlannerTimeOfDay,
  type PlannerDraftFieldPatch,
  parsePlannerTimeOfDay,
  plannerDraftFieldPatchSchema,
} from '@continuum/contracts';
import * as React from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
import { useToast } from '@/components/ui/ToastProvider';
import { ApiError } from '@/lib/api/errors';
import { request } from '@/lib/api/http';
import { type DraftEditField, useCalendarStore } from '@/lib/organic/store';

/**
 * The ONE write path for a planner draft's editable fields.
 *
 * Every field edit in the preview panel and on the calendar card used to be a
 * store-only mutation. The only writer was the debounced browser autosave, and it
 * (a) accepted `origin === 'manual'` drafts only, so nothing the agent produced was
 * ever saved, and (b) omitted `format`, `hashtags` and `creativeDirectionPrompt`
 * from its change signature, so even a manual draft short-circuited before
 * attempting a write. The next refetch then replaced `days` wholesale and the edit
 * was gone — silently, with no error and no save indicator.
 *
 * This hook owns BOTH halves — the optimistic store write and the persist — so a
 * store-only edit cannot be introduced by accident. It targets the brand-scoped
 * field-edit route rather than the owner-scoped generic PATCH, which is what makes
 * an agent- or teammate-created draft editable at all.
 */

/** Text edits coalesce; discrete edits do not. Long enough to batch a burst of
 * keystrokes, short enough that a user who edits and immediately navigates is
 * covered by the blur/unmount flush rather than by luck. */
const TEXT_EDIT_COALESCE_MS = 700;

export type DraftFieldPersistResult =
  | { ok: true; updatedAt: string | null }
  | { ok: false; stale: boolean; message: string };

/** The subset of a draft the persist step needs. Keeps callers from passing the world. */
type PersistTarget = Pick<OrganicCalendarDraft, 'id' | 'backendDraftId' | 'updatedAt'>;

function messageForError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 422) return 'This post can no longer be edited.';
    if (error.status === 403) return 'You do not have access to this post.';
    if (error.status === 404) return 'This post no longer exists.';
  }
  return 'Your change could not be saved.';
}

// One save at a time per row. The route's concurrency token is the row's updated_at, so two
// saves sent together carry the same token and the second is refused as stale: the user's own
// edit, reported as "changed elsewhere". Each save waits for the one before it on the same row
// (the panel's fields, its media, a move) and sends the token that save came back with.
type RowSaves = { tail: Promise<void>; token: string | null; pending: number };
const savesByRow = new Map<string, RowSaves>();

async function saveInTurn(
  rowId: string,
  save: (token: string | null) => Promise<DraftFieldPersistResult>,
  token: string | null,
): Promise<DraftFieldPersistResult> {
  const busy = savesByRow.get(rowId);
  const saves = busy ?? { tail: Promise.resolve(), token, pending: 0 };
  savesByRow.set(rowId, saves);
  saves.pending += 1;
  // An idle row saves at once, so the request is on the wire when the caller returns.
  const result = busy ? saves.tail.then(() => save(saves.token)) : save(token);
  saves.tail = result.then((settled) => {
    if (settled.ok && settled.updatedAt) saves.token = settled.updatedAt;
  });
  try {
    return await result;
  } finally {
    saves.pending -= 1;
    if (saves.pending === 0) savesByRow.delete(rowId);
  }
}

export function useDraftFieldPersistence() {
  const persistDraftFields = React.useCallback(
    async (
      target: PersistTarget,
      patch: PlannerDraftFieldPatch,
    ): Promise<DraftFieldPersistResult> => {
      // A draft with no server row yet is inserted by the autosave, which replays its
      // content through this route once the row exists (`newDraftFieldPatch`) — there is
      // nothing to PATCH yet, and reporting a failure here would be a lie.
      const rowId = target.backendDraftId;
      if (!rowId) return { ok: true, updatedAt: null };

      return saveInTurn(
        rowId,
        async (token) => {
          const parsed = plannerDraftFieldPatchSchema.safeParse({
            ...patch,
            expected_updated_at: token,
          });
          if (!parsed.success) {
            return { ok: false, stale: false, message: 'That value is not valid.' };
          }
          try {
            const response = await request<{ updated_at?: string | null }>({
              path: `/api/organic/calendar/drafts/${rowId}/fields`,
              method: 'PATCH',
              body: parsed.data,
            });
            return { ok: true, updatedAt: response?.updated_at ?? null };
          } catch (error) {
            const stale = error instanceof ApiError && error.status === 409;
            return { ok: false, stale, message: messageForError(error) };
          }
        },
        patch.expected_updated_at ?? target.updatedAt ?? null,
      );
    },
    [],
  );

  return { persistDraftFields };
}

export type UseDraftFieldEditorResult = {
  /**
   * A discrete edit (format, time, hashtag add/remove, media, platforms): write the
   * store, then await the PATCH. A rejection restores the pre-edit value and raises
   * a toast — the user is never left believing a lost change was saved.
   */
  editField: (
    patch: PlannerDraftFieldPatch,
    fields: readonly DraftEditField[],
    localPatch?: Partial<OrganicCalendarDraft>,
  ) => Promise<boolean>;
  /**
   * A text edit (caption, creative direction): shown at once through `draft`, written to the
   * store and PATCHed once per coalesced burst.
   */
  queueFieldEdit: (
    patch: PlannerDraftFieldPatch,
    fields: readonly DraftEditField[],
    localPatch?: Partial<OrganicCalendarDraft>,
  ) => void;
  /**
   * Send any coalesced edit immediately and wait for every save already on the wire. Call on
   * blur and before navigating away. False when one of them failed to save, so approve and
   * publish can stop instead of sending the old copy.
   */
  flush: () => Promise<boolean>;
  /** The draft with any typing that has not reached the store yet. Render THIS one. */
  draft: OrganicCalendarDraft;
  isSaving: boolean;
  savingFields: ReadonlySet<DraftEditField>;
  saveError: string | null;
  clearSaveError: () => void;
};

type QueuedEdit = {
  /** The draft typed into, so a burst still lands on it if the panel moves to another. */
  target: PersistTarget;
  patch: PlannerDraftFieldPatch;
  fields: DraftEditField[];
  /** What the burst changes locally; it reaches the store once, with the PATCH result. */
  localPatch?: Partial<OrganicCalendarDraft>;
};

type Typed = { draftId: string; patch: Partial<OrganicCalendarDraft> };

/**
 * `localPatch` exists because the store's draft shape is not the wire patch: a
 * caption is `captionPreview` locally and `copy.caption` on the wire. Callers pass
 * both rather than this hook guessing a mapping that already lives in contracts.
 */
export function useDraftFieldEditor(draft: OrganicCalendarDraft): UseDraftFieldEditorResult {
  const { show } = useToast();
  const { persistDraftFields } = useDraftFieldPersistence();
  const { updateDraft, markDraftEditPending, clearDraftEditPending, requestCalendarRefetch } =
    useCalendarStore(
      useShallow((state) => ({
        updateDraft: state.updateDraft,
        markDraftEditPending: state.markDraftEditPending,
        clearDraftEditPending: state.clearDraftEditPending,
        requestCalendarRefetch: state.requestCalendarRefetch,
      })),
    );

  const [savingFields, setSavingFields] = React.useState<ReadonlySet<DraftEditField>>(
    () => new Set(),
  );
  const [saveError, setSaveError] = React.useState<string | null>(null);
  // Typing lives here until its burst is sent. Written to the store per keystroke, every
  // memoised calendar cell holding the draft re-rendered on each one, then again for the
  // PATCH's updated_at.
  const [typed, setTyped] = React.useState<Typed | null>(null);

  // The draft as it is RIGHT NOW, read at send time rather than captured at call
  // time: a coalesced caption edit must send the latest keystroke, not the first.
  const draftRef = React.useRef(draft);
  draftRef.current = draft;

  const queuedRef = React.useRef<QueuedEdit | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = React.useRef(new Set<Promise<boolean>>());

  const send = React.useCallback(
    async (
      target: PersistTarget,
      patch: PlannerDraftFieldPatch,
      fields: readonly DraftEditField[],
      snapshot: Partial<OrganicCalendarDraft> | null,
      localPatch?: Partial<OrganicCalendarDraft>,
    ): Promise<boolean> => {
      const draftId = target.id;
      markDraftEditPending(draftId, fields);
      // Lets flush() wait for this save. Never rejects: persistDraftFields catches.
      let settle: (saved: boolean) => void = () => {};
      const tracked = new Promise<boolean>((resolve) => {
        settle = resolve;
      });
      inFlightRef.current.add(tracked);
      const finish = (saved: boolean) => {
        inFlightRef.current.delete(tracked);
        settle(saved);
        return saved;
      };
      setSavingFields((current) => new Set([...current, ...fields]));

      // The freshest CAS token: an edit that settled while this one waited moved it on.
      const result = await persistDraftFields(
        draftRef.current.id === draftId ? draftRef.current : target,
        patch,
      );

      clearDraftEditPending(draftId, fields);
      setSavingFields((current) => {
        const next = new Set(current);
        for (const field of fields) next.delete(field);
        return next;
      });

      // Typing still queued behind this send stays on screen; the rest is in the store now.
      const settleTyped = () =>
        setTyped(() => {
          const queued = queuedRef.current;
          return queued?.localPatch
            ? { draftId: queued.target.id, patch: queued.localPatch }
            : null;
        });

      if (result.ok) {
        // ONE store write per burst: its text and the server's updated_at together.
        if (localPatch || result.updatedAt) {
          updateDraft(draftId, (current) => ({
            ...current,
            ...localPatch,
            ...(result.updatedAt ? { updatedAt: result.updatedAt } : {}),
          }));
        }
        settleTyped();
        setSaveError(null);
        return finish(true);
      }

      if (result.stale) {
        // Someone else moved this draft on. Rolling back would replace their change
        // with an even older value, so reconcile from the server instead.
        show({
          title: 'This post changed elsewhere',
          description: 'Reloading the latest version.',
          variant: 'error',
        });
        requestCalendarRefetch();
        settleTyped();
        return finish(false);
      }

      if (snapshot) updateDraft(draftId, (current) => ({ ...current, ...snapshot }));
      // Unsaved typing stays on screen, as the toast's "not saved" refers to it.
      if (localPatch) updateDraft(draftId, (current) => ({ ...current, ...localPatch }));
      settleTyped();
      setSaveError(result.message);
      show({ title: 'Change not saved', description: result.message, variant: 'error' });
      return finish(false);
    },
    [
      persistDraftFields,
      markDraftEditPending,
      clearDraftEditPending,
      updateDraft,
      requestCalendarRefetch,
      show,
    ],
  );

  const snapshotFor = React.useCallback(
    (
      localPatch: Partial<OrganicCalendarDraft> | undefined,
    ): Partial<OrganicCalendarDraft> | null => {
      if (!localPatch) return null;
      const current = draftRef.current as Record<string, unknown>;
      const snapshot: Record<string, unknown> = {};
      for (const key of Object.keys(localPatch)) snapshot[key] = current[key];
      return snapshot as Partial<OrganicCalendarDraft>;
    },
    [],
  );

  const editField = React.useCallback(
    async (
      patch: PlannerDraftFieldPatch,
      fields: readonly DraftEditField[],
      localPatch?: Partial<OrganicCalendarDraft>,
    ): Promise<boolean> => {
      const snapshot = snapshotFor(localPatch);
      if (localPatch) {
        updateDraft(draftRef.current.id, (current) => ({ ...current, ...localPatch }));
      }
      return send(draftRef.current, patch, fields, snapshot);
    },
    [send, snapshotFor, updateDraft],
  );

  const flush = React.useCallback(async (): Promise<boolean> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const queued = queuedRef.current;
    queuedRef.current = null;
    if (queued) void send(queued.target, queued.patch, queued.fields, null, queued.localPatch);
    // A burst whose timer already fired, and a format or time picked a moment ago, are on the
    // wire, not queued: approving without them sends what the row held before.
    const saved = await Promise.all(inFlightRef.current);
    return saved.every(Boolean);
  }, [send]);

  const queueFieldEdit = React.useCallback(
    (
      patch: PlannerDraftFieldPatch,
      fields: readonly DraftEditField[],
      localPatch?: Partial<OrganicCalendarDraft>,
    ): void => {
      const target = draftRef.current;
      const previous = queuedRef.current;
      // A burst belongs to one draft: typing into another one sends the first burst now.
      if (previous && previous.target.id !== target.id) void flush();
      const carried = queuedRef.current;
      const queuedLocal =
        localPatch || carried?.localPatch ? { ...carried?.localPatch, ...localPatch } : undefined;
      queuedRef.current = {
        target,
        patch: { ...carried?.patch, ...patch },
        fields: [...new Set([...(carried?.fields ?? []), ...fields])],
        localPatch: queuedLocal,
      };
      if (queuedLocal) setTyped({ draftId: target.id, patch: queuedLocal });
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void flush();
      }, TEXT_EDIT_COALESCE_MS);
    },
    [flush],
  );

  const shownDraft = React.useMemo(
    () => (typed?.draftId === draft.id ? { ...draft, ...typed.patch } : draft),
    [draft, typed],
  );

  // An unmount mid-burst must not drop the pending keystrokes. The timer is cleared
  // by flush(); firing it here is what makes closing the panel a save point.
  React.useEffect(
    () => () => {
      if (queuedRef.current) void flush();
    },
    [flush],
  );

  return {
    editField,
    queueFieldEdit,
    flush,
    draft: shownDraft,
    isSaving: savingFields.size > 0,
    savingFields,
    saveError,
    clearSaveError: React.useCallback(() => setSaveError(null), []),
  };
}

/** The wire patch a chip-label time change means. Exported for the card's quick edit. */
export function scheduleFieldPatch(
  dayId: string,
  timeLabel: string,
): PlannerDraftFieldPatch | null {
  const clock = parsePlannerTimeOfDay(timeLabel);
  if (!clock) return null;
  return { dayId, timeOfDay: formatPlannerTimeOfDay(clock) };
}

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

export function useDraftFieldPersistence() {
  const persistDraftFields = React.useCallback(
    async (
      target: PersistTarget,
      patch: PlannerDraftFieldPatch,
    ): Promise<DraftFieldPersistResult> => {
      // A draft with no server row yet is inserted by the autosave, which carries the
      // local snapshot with it — there is nothing to PATCH, and reporting a failure
      // here would be a lie.
      if (!target.backendDraftId) return { ok: true, updatedAt: null };

      const parsed = plannerDraftFieldPatchSchema.safeParse({
        ...patch,
        expected_updated_at: patch.expected_updated_at ?? target.updatedAt ?? null,
      });
      if (!parsed.success) {
        return { ok: false, stale: false, message: 'That value is not valid.' };
      }

      try {
        const response = await request<{ updated_at?: string | null }>({
          path: `/api/organic/calendar/drafts/${target.backendDraftId}/fields`,
          method: 'PATCH',
          body: parsed.data,
        });
        return { ok: true, updatedAt: response?.updated_at ?? null };
      } catch (error) {
        const stale = error instanceof ApiError && error.status === 409;
        return { ok: false, stale, message: messageForError(error) };
      }
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
  /** A text edit (caption, creative direction): store now, PATCH coalesced. */
  queueFieldEdit: (
    patch: PlannerDraftFieldPatch,
    fields: readonly DraftEditField[],
    localPatch?: Partial<OrganicCalendarDraft>,
  ) => void;
  /** Send any coalesced edit immediately. Call on blur and before navigating away. */
  flush: () => Promise<void>;
  isSaving: boolean;
  savingFields: ReadonlySet<DraftEditField>;
  saveError: string | null;
  clearSaveError: () => void;
};

type QueuedEdit = {
  patch: PlannerDraftFieldPatch;
  fields: DraftEditField[];
};

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

  // The draft as it is RIGHT NOW, read at send time rather than captured at call
  // time: a coalesced caption edit must send the latest keystroke, not the first.
  const draftRef = React.useRef(draft);
  draftRef.current = draft;

  const queuedRef = React.useRef<QueuedEdit | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const send = React.useCallback(
    async (
      patch: PlannerDraftFieldPatch,
      fields: readonly DraftEditField[],
      snapshot: Partial<OrganicCalendarDraft> | null,
    ): Promise<boolean> => {
      const draftId = draftRef.current.id;
      markDraftEditPending(draftId, fields);
      setSavingFields((current) => new Set([...current, ...fields]));

      const result = await persistDraftFields(draftRef.current, patch);

      clearDraftEditPending(draftId, fields);
      setSavingFields((current) => {
        const next = new Set(current);
        for (const field of fields) next.delete(field);
        return next;
      });

      if (result.ok) {
        if (result.updatedAt) {
          updateDraft(draftId, (current) => ({ ...current, updatedAt: result.updatedAt }));
        }
        setSaveError(null);
        return true;
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
        return false;
      }

      if (snapshot) updateDraft(draftId, (current) => ({ ...current, ...snapshot }));
      setSaveError(result.message);
      show({ title: 'Change not saved', description: result.message, variant: 'error' });
      return false;
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
      return send(patch, fields, snapshot);
    },
    [send, snapshotFor, updateDraft],
  );

  const flush = React.useCallback(async (): Promise<void> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const queued = queuedRef.current;
    if (!queued) return;
    queuedRef.current = null;
    await send(queued.patch, queued.fields, null);
  }, [send]);

  const queueFieldEdit = React.useCallback(
    (
      patch: PlannerDraftFieldPatch,
      fields: readonly DraftEditField[],
      localPatch?: Partial<OrganicCalendarDraft>,
    ): void => {
      if (localPatch) {
        updateDraft(draftRef.current.id, (current) => ({ ...current, ...localPatch }));
      }
      const previous = queuedRef.current;
      queuedRef.current = {
        patch: { ...previous?.patch, ...patch },
        fields: [...new Set([...(previous?.fields ?? []), ...fields])],
      };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void flush();
      }, TEXT_EDIT_COALESCE_MS);
    },
    [flush, updateDraft],
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

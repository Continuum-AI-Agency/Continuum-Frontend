// The planner's draft as publish-plan input, read the way the backend reads it: the row,
// through the contracts' `publishPlanDraftFromRow`, so what the panel shows and what goes
// out are one decision. The store's draft is a display model with legacy fallbacks
// (snapshot caption and media) the publisher never reads; mapping it field by field let the
// preview call a draft ready that approve then refused.
//
// The only thing taken from the store is what the user changed since the row was read, and
// it reaches the row through the contracts' `plannerFieldPatchToContentJson` — the same
// fragment the field route writes — so an unsaved edit previews exactly as it will be stored.

import {
  type PlannerDraftFieldPatch,
  type PublishPlanDraft,
  plannerFieldPatchToContentJson,
  publishPlanDraftFromRow,
} from '@continuum/contracts';
import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';

type DraftRow = { id: string; content_json: unknown; slot_data: unknown };

/** The editable values as one key each, so "changed since read" is a comparison. */
type EditableKeys = Record<'caption' | 'hashtags' | 'format' | 'media' | 'publishOptions', string>;

/** The row a draft was read from, and its editable values at that moment. */
export type PublishPlanSource = { row: DraftRow; read: EditableKeys };

function editableKeys(draft: OrganicCalendarDraft): EditableKeys {
  const tags = draft.hashtags;
  return {
    caption: draft.captionPreview,
    hashtags: JSON.stringify([tags?.high ?? [], tags?.medium ?? [], tags?.low ?? []]),
    format: draft.format,
    // Identity and order only: a preview re-signing a URL is not an edit.
    media: JSON.stringify(
      (draft.publishingAssets ?? []).map((asset) => [
        asset.role,
        asset.kind,
        asset.slideIndex ?? null,
        asset.storagePath || asset.storageUrl,
      ]),
    ),
    publishOptions: JSON.stringify(draft.publishOptions ?? null),
  };
}

export function publishPlanSource(row: DraftRow, draft: OrganicCalendarDraft): PublishPlanSource {
  return { row, read: editableKeys(draft) };
}

/** The field patch for everything changed since the row was read; all of it for a new draft. */
function unsavedEdits(
  draft: OrganicCalendarDraft,
  read: EditableKeys | null,
): PlannerDraftFieldPatch {
  const now = editableKeys(draft);
  const changed = (key: keyof EditableKeys) => now[key] !== read?.[key];
  return {
    ...(changed('caption') ? { caption: draft.captionPreview } : {}),
    ...(changed('hashtags')
      ? {
          hashtags: {
            high: draft.hashtags?.high ?? [],
            medium: draft.hashtags?.medium ?? [],
            low: draft.hashtags?.low ?? [],
          },
        }
      : {}),
    ...(changed('format') ? { format: draft.format } : {}),
    ...(changed('media')
      ? {
          media: {
            publishingAssets: draft.publishingAssets ?? [],
            ...(draft.mediaSuggestion ? { mediaSuggestion: draft.mediaSuggestion } : {}),
          },
        }
      : {}),
    ...(changed('publishOptions') && draft.publishOptions
      ? { publishOptions: draft.publishOptions }
      : {}),
  };
}

/**
 * Everything a draft with no row yet carries, as one field-route patch: the content its
 * preview already shows as stored. An empty format is left out, since the route refuses it.
 */
export function newDraftFieldPatch(draft: OrganicCalendarDraft): PlannerDraftFieldPatch {
  const { format, ...rest } = unsavedEdits(draft, null);
  return format ? { ...rest, format } : rest;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// The field route's merge: containers merge one level (and the media suggestion inside
// `creative`), everything else is replaced.
function mergeFragment(base: unknown, fragment: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(isObject(base) ? base : {}) };
  for (const [key, value] of Object.entries(fragment)) {
    const current = merged[key];
    if (!isObject(current) || !isObject(value)) {
      merged[key] = value;
      continue;
    }
    merged[key] =
      key === 'creative' && isObject(current.mediaSuggestion) && isObject(value.mediaSuggestion)
        ? {
            ...current,
            ...value,
            mediaSuggestion: { ...current.mediaSuggestion, ...value.mediaSuggestion },
          }
        : { ...current, ...value };
  }
  return merged;
}

export function publishPlanDraftFromCalendarDraft(draft: OrganicCalendarDraft): PublishPlanDraft {
  const source = draft.planSource;
  const row = source?.row ?? {
    id: draft.backendDraftId ?? draft.id,
    content_json: null,
    slot_data: null,
  };
  const edits = unsavedEdits(draft, source?.read ?? null);
  const planned = publishPlanDraftFromRow({
    ...row,
    content_json: mergeFragment(row.content_json, plannerFieldPatchToContentJson(edits)),
  });
  // A format edit outranks every stored candidate: the field route rewrites the snapshot's
  // format with it, and the snapshot is the first candidate the contract reads.
  return edits.format ? { ...planned, formats: [edits.format, ...planned.formats] } : planned;
}

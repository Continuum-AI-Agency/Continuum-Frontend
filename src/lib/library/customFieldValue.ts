// Presentation logic for custom-field values: read a stored value under its
// field's declared type, format it for display, and shape a validation failure
// into something an editor can show.
//
// The RULES (what a value of each type may be, how an empty value normalizes)
// live once in `customFields.ts` — `validateFieldValue` there is the same
// predicate the PUT route runs, so the editor and the server can never disagree
// about what is valid. This module never re-states them; it adapts them.
//
// Selects store option IDS, never labels: renaming a label must not orphan the
// assets holding that option. The inverse case — an option DELETED while assets
// still hold its id — is expected (the contract keeps those ids valid until the
// asset is re-saved), so a value whose option no longer exists renders as
// ORPHANED_OPTION_LABEL rather than disappearing or crashing.

import type {
  AssetFieldValue,
  CustomField,
  CustomFieldOption,
  CustomFieldValue,
} from '@continuum/contracts';
import { isEmptyFieldValue, validateFieldValue } from './customFields';

export const ORPHANED_OPTION_LABEL = 'Removed option';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type ValueValidation = { ok: true; value: CustomFieldValue } | { ok: false; error: string };

/** Index an asset's stored values by field id. A later row for the same field wins. */
export function valuesByFieldId(values: readonly AssetFieldValue[]): Map<string, CustomFieldValue> {
  const byField = new Map<string, CustomFieldValue>();
  for (const entry of values) byField.set(entry.fieldId, entry.value);
  return byField;
}

export function findOption(field: CustomField, optionId: string): CustomFieldOption | null {
  return field.options.find((option) => option.id === optionId) ?? null;
}

/** The option id a single_select holds, or null when unset or shape-mismatched. */
export function singleSelectOptionId(value: CustomFieldValue): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** The option ids a multi_select holds. A bare string is read as a one-option value. */
export function multiSelectOptionIds(value: CustomFieldValue): string[] {
  if (typeof value === 'string') return value.length > 0 ? [value] : [];
  if (Array.isArray(value)) return value.filter((id) => typeof id === 'string' && id.length > 0);
  return [];
}

/** The literal a text/date field holds, or '' when unset or shape-mismatched. */
export function literalValue(value: CustomFieldValue): string {
  return typeof value === 'string' ? value : '';
}

export function isValueEmpty(value: CustomFieldValue): boolean {
  return isEmptyFieldValue(value);
}

function optionLabel(field: CustomField, optionId: string): string {
  return findOption(field, optionId)?.label ?? ORPHANED_OPTION_LABEL;
}

// Dates are stored as a calendar day (yyyy-mm-dd), which carries no time zone.
// Both the parse and the format are pinned to UTC so a viewer west of Greenwich
// is never shown the day before the one that was picked. The locale is pinned
// for the same reason the zone is: the day must read the same everywhere it
// appears (sidebar, filter chip, board lane).
export function formatDateValue(iso: string): string {
  if (!ISO_DATE.test(iso)) return iso;
  const parsed = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Display string for a stored value. Unset reads as '' — the caller renders the placeholder. */
export function formatCustomFieldValue(field: CustomField, value: CustomFieldValue): string {
  if (value === null || value === undefined) return '';
  switch (field.type) {
    case 'single_select': {
      const optionId = singleSelectOptionId(value);
      return optionId ? optionLabel(field, optionId) : '';
    }
    case 'multi_select': {
      // Stored order, not field order: it is the order the editor showed the
      // person who set it, and re-ordering a field's options later must not
      // silently re-order an asset's answer.
      return multiSelectOptionIds(value)
        .map((id) => optionLabel(field, id))
        .join(', ');
    }
    case 'date': {
      const iso = literalValue(value).trim();
      return iso ? formatDateValue(iso) : '';
    }
    default:
      return literalValue(value).trim();
  }
}

/**
 * Editor-facing gate before PUT /api/library/asset-fields: the shared rule set,
 * with the failure named after the field the person was editing (the panel shows
 * several fields at once, so "not an option on this field" alone is ambiguous).
 * The value it returns is normalized for storage — an empty edit of any shape
 * comes back as null, so "cleared" has exactly one representation.
 */
export function validateCustomFieldValue(
  field: CustomField,
  value: CustomFieldValue,
): ValueValidation {
  const checked = validateFieldValue(field, value);
  return checked.ok
    ? { ok: true, value: checked.value }
    : { ok: false, error: `${field.name} · ${checked.reason}` };
}

/** Only a single_select can drive a board's lanes: an asset must sit in exactly one. */
export function isGroupableField(field: CustomField): boolean {
  return field.type === 'single_select';
}

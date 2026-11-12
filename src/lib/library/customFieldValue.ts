import type { useTranslations } from 'next-intl';
import type { UiLocale } from '@/i18n/config';
export type CustomFieldDisplay = {
  locale: UiLocale;
  translate: ReturnType<typeof useTranslations<'library'>>;
};

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

import {
  type AssetFieldValue,
  type CustomField,
  type CustomFieldOption,
  type CustomFieldValue,
  customFieldChoiceOptions,
  MAX_CUSTOM_FIELD_LONG_TEXT_LENGTH,
  MAX_CUSTOM_FIELD_TEXT_LENGTH,
  MAX_CUSTOM_FIELD_URL_LENGTH,
  MAX_CUSTOM_FIELD_USERS,
} from '@continuum/contracts';
import { isEmptyFieldValue, ratingMax, validateFieldValue } from './customFields';

export const ORPHANED_OPTION_LABEL = 'Removed option';
export const ORPHANED_USER_LABEL = 'Former member';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type ValueValidation =
  | { ok: true; value: CustomFieldValue }
  | { ok: false; error: string; diagnosticReason?: string };

/** Index an asset's stored values by field id. A later row for the same field wins. */
export function valuesByFieldId(values: readonly AssetFieldValue[]): Map<string, CustomFieldValue> {
  const byField = new Map<string, CustomFieldValue>();
  for (const entry of values) byField.set(entry.fieldId, entry.value);
  return byField;
}

export function findOption(field: CustomField, optionId: string): CustomFieldOption | null {
  return customFieldChoiceOptions(field).find((option) => option.id === optionId) ?? null;
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
// Parse and format in UTC so a viewer west of Greenwich sees the stored calendar day.
// The display language follows the active UI locale.
export function formatDateValue(iso: string, locale: UiLocale = 'en'): string {
  if (!ISO_DATE.test(iso)) return iso;
  const parsed = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Display string for a stored value. Unset reads as '' — the caller renders the
 * placeholder. A user value is an id; `userLabel` names it when the caller has the
 * member list, and an unknown id reads as ORPHANED_USER_LABEL rather than a uuid.
 */
export function formatCustomFieldValue(
  field: CustomField,
  value: CustomFieldValue,
  userLabel?: (userId: string) => string | undefined,
  display?: CustomFieldDisplay,
): string {
  if (value === null || value === undefined) return '';
  const displayOption = (id: string) =>
    findOption(field, id)?.label ??
    display?.translate('fieldRemovedOption') ??
    ORPHANED_OPTION_LABEL;
  switch (field.type) {
    case 'single_select':
    case 'status': {
      const optionId = singleSelectOptionId(value);
      return optionId ? displayOption(optionId) : '';
    }
    case 'multi_select': {
      // Stored order, not field order: it is the order the editor showed the
      // person who set it, and re-ordering a field's options later must not
      // silently re-order an asset's answer.
      return multiSelectOptionIds(value)
        .map((id) => displayOption(id))
        .join(', ');
    }
    case 'date': {
      const iso = literalValue(value).trim();
      return iso ? formatDateValue(iso, display?.locale) : '';
    }
    case 'number':
      return typeof value === 'number' ? value.toLocaleString(display?.locale ?? 'en-US') : '';
    case 'checkbox':
      return value === true
        ? (display?.translate('fieldFilterYes') ?? 'Yes')
        : value === false
          ? (display?.translate('fieldFilterNo') ?? 'No')
          : '';
    case 'rating':
      return typeof value === 'number' ? `${'★'.repeat(value)} ${value}/${ratingMax(field)}` : '';
    case 'user': {
      const userId = literalValue(value);
      return userId
        ? (userLabel?.(userId) ?? display?.translate('fieldFormerMember') ?? ORPHANED_USER_LABEL)
        : '';
    }
    case 'user_multi':
      return multiSelectOptionIds(value)
        .map(
          (userId) =>
            userLabel?.(userId) ?? display?.translate('fieldFormerMember') ?? ORPHANED_USER_LABEL,
        )
        .join(', ');
    default:
      return literalValue(value).trim();
  }
}

/** The colour of a status option, or null for an unset/removed one. */
export function statusColor(field: CustomField, value: CustomFieldValue): string | null {
  const optionId = singleSelectOptionId(value);
  return optionId ? (findOption(field, optionId)?.color ?? null) : null;
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
  display?: CustomFieldDisplay,
): ValueValidation {
  const checked = validateFieldValue(field, value);
  if (checked.ok) return { ok: true, value: checked.value };
  if (!display) return { ok: false, error: `${field.name} · ${checked.reason}` };
  const key = FIELD_VALIDATION_KEYS[field.type] ?? 'fieldInvalidValue';
  const max =
    field.type === 'rating'
      ? ratingMax(field)
      : field.type === 'text'
        ? MAX_CUSTOM_FIELD_TEXT_LENGTH
        : field.type === 'long_text'
          ? MAX_CUSTOM_FIELD_LONG_TEXT_LENGTH
          : field.type === 'user_multi'
            ? MAX_CUSTOM_FIELD_USERS
            : MAX_CUSTOM_FIELD_URL_LENGTH;
  return {
    ok: false,
    error: display.translate(key, { field: field.name, max }),
    diagnosticReason: checked.reason,
  };
}

const FIELD_VALIDATION_KEYS = {
  single_select: 'fieldInvalidChoice',
  multi_select: 'fieldInvalidChoices',
  status: 'fieldInvalidChoice',
  text: 'fieldInvalidText',
  long_text: 'fieldInvalidText',
  date: 'fieldInvalidDate',
  number: 'fieldInvalidNumber',
  checkbox: 'fieldInvalidCheckbox',
  rating: 'fieldInvalidRating',
  user: 'fieldInvalidMember',
  user_multi: 'fieldInvalidMembers',
  url: 'fieldInvalidUrl',
} as const satisfies Record<CustomField['type'], string>;

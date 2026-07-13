// Pure mutation of the active custom-field filter set (the chips in the library
// filter bar, and the same shape a smart collection persists in smart_query).
//
// One filter per field, never two: the three operators are mutually exclusive
// answers to the same question ("which values of THIS field do I want?"), so
// picking an option while "is empty" is on must replace it, not stack with it.
// Every helper returns a new array — the caller holds it in React state.

import type { CustomField, CustomFieldFilter } from '@continuum/contracts';
import { formatCustomFieldValue, formatDateValue } from './customFieldValue';

export function activeFilterFor(
  filters: readonly CustomFieldFilter[],
  fieldId: string,
): CustomFieldFilter | null {
  return filters.find((filter) => filter.fieldId === fieldId) ?? null;
}

function withoutField(filters: readonly CustomFieldFilter[], fieldId: string): CustomFieldFilter[] {
  return filters.filter((filter) => filter.fieldId !== fieldId);
}

function replaceField(
  filters: readonly CustomFieldFilter[],
  next: CustomFieldFilter,
): CustomFieldFilter[] {
  const existing = filters.some((filter) => filter.fieldId === next.fieldId);
  // Replace in place so a chip does not jump to the end of the row when its
  // selection changes.
  return existing
    ? filters.map((filter) => (filter.fieldId === next.fieldId ? next : filter))
    : [...filters, next];
}

/** Toggle one option id inside a select field's `any_of` filter. Emptying it drops the filter. */
export function toggleSelectFilterValue(
  filters: readonly CustomFieldFilter[],
  fieldId: string,
  optionId: string,
): CustomFieldFilter[] {
  const active = activeFilterFor(filters, fieldId);
  const current = active?.operator === 'any_of' ? active.values : [];
  const values = current.includes(optionId)
    ? current.filter((id) => id !== optionId)
    : [...current, optionId];
  if (values.length === 0) return withoutField(filters, fieldId);
  return replaceField(filters, { fieldId, operator: 'any_of', values });
}

/** Set a text/date field's exact-match filter. A blank literal drops the filter. */
export function setLiteralFilter(
  filters: readonly CustomFieldFilter[],
  fieldId: string,
  literal: string | null,
): CustomFieldFilter[] {
  const value = (literal ?? '').trim();
  if (!value) return withoutField(filters, fieldId);
  return replaceField(filters, { fieldId, operator: 'is', values: [value] });
}

/** Turn "is empty" on (replacing whatever else that field held) or off. */
export function toggleEmptyFilter(
  filters: readonly CustomFieldFilter[],
  fieldId: string,
): CustomFieldFilter[] {
  const active = activeFilterFor(filters, fieldId);
  if (active?.operator === 'is_empty') return withoutField(filters, fieldId);
  return replaceField(filters, { fieldId, operator: 'is_empty', values: [] });
}

export function clearFieldFilter(
  filters: readonly CustomFieldFilter[],
  fieldId: string,
): CustomFieldFilter[] {
  return withoutField(filters, fieldId);
}

/** Chip label for a field's active filter — '' when the field is unfiltered. */
export function fieldFilterSummary(field: CustomField, filter: CustomFieldFilter | null): string {
  if (!filter) return '';
  if (filter.operator === 'is_empty') return 'Empty';
  if (filter.operator === 'is') {
    const literal = filter.values[0] ?? '';
    return field.type === 'date' ? formatDateValue(literal) : literal;
  }
  if (filter.values.length === 0) return '';
  if (filter.values.length === 1) {
    return formatCustomFieldValue(field, filter.values[0] ?? null);
  }
  return `${filter.values.length} selected`;
}

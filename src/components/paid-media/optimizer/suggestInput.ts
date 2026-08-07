// Tab accepts the suggested value in an optimizer number field.
//
// The suggestions themselves are not new — adviseSetup() and the manage-panel chips already
// compute them deterministically from the current selection. What was missing is a keyboard
// path to take one: the affordance was a mouse-only "Use" button next to the field.
//
// The rule is deliberately narrow: Tab completes ONLY an empty field. Once the field has a
// value (including the one just accepted), Tab is focus navigation again, so a second Tab
// always leaves. Shift+Tab is never intercepted. That keeps the accelerator reversible and
// keeps the visible button as the accessible control rather than replacing it.

import type * as React from 'react';

export function acceptSuggestionOnTab(
  suggested: string | number | null | undefined,
  accept: (value: string) => void,
) {
  return (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Tab' || event.shiftKey || suggested == null) return;
    if (event.currentTarget.value.trim() !== '') return;
    event.preventDefault();
    accept(String(suggested));
  };
}

/** The suggested value as a placeholder, so the field shows what Tab would accept. */
export function suggestionPlaceholder(
  suggested: string | number | null | undefined,
  fallback: string,
): string {
  return suggested == null ? fallback : String(suggested);
}

/** Escape text at the HTML boundary; message arguments remain plain source data. */
export function escapePopupHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ??
      character,
  );
}

/** Inline JSON must not be able to end its enclosing script element. */
export function popupScriptJson(value: unknown): string {
  return (JSON.stringify(value) ?? 'null').replace(
    /[<>\u2028\u2029]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

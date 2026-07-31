// The count is part of the returned string on purpose: every caller renders the
// number next to the noun ("3 trends", "1 scheduling channel"), and keeping them
// together is what stops a caller from agreeing the noun but not the number.

/**
 * `"3 trends"` / `"1 trend"`. Pass `plural` for nouns English does not simply
 * suffix with `s` (`pluralize(2, 'entry', 'entries')`).
 */
export function pluralize(count: number, singular: string, plural?: string): string {
  const noun = count === 1 ? singular : (plural ?? `${singular}s`);
  return `${count} ${noun}`;
}

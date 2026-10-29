export const SOURCE_UNREACHABLE_MESSAGE =
  'We couldn’t read that link. Check the address and try again, or describe your business instead.';
export const SOURCE_TIMEOUT_MESSAGE =
  'Reading that link took too long. Try again, or describe your business instead.';

// Network failures surface as a bare TypeError ("Failed to fetch", "Load failed"); Backend reasons
// that are codes ("all_scrapers_failed") are not sentences. Neither belongs in front of a user.
export function sourceFailureMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'TimeoutError') return SOURCE_TIMEOUT_MESSAGE;
  if (error instanceof TypeError) return SOURCE_UNREACHABLE_MESSAGE;
  const message = error instanceof Error ? error.message : '';
  return !message || /^[a-z0-9_]+$/.test(message) ? SOURCE_UNREACHABLE_MESSAGE : message;
}

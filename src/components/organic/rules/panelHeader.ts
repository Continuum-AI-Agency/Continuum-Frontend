// The rules list and the rule editor sit side by side, and the lines under their
// titles have to meet as one. Each header used to take its height from whatever
// was inside it — a 28px button on the list, an 18px switch on the editor — so
// the editor's line sat 8px higher and its title out of step with the list's.
//
// One definition for both, so they cannot drift apart again. The height is a
// floor rather than a fixed value: the list header wraps on a narrow panel and
// has to be allowed to grow when it does.

/** Height, padding and the line underneath, shared by both panel headers. */
export const PANEL_HEADER_FRAME = 'min-h-12 border-b px-4 py-2.5';

/** The panel title, set the same way on both sides so the two read as one row. */
export const PANEL_TITLE = 'text-sm font-semibold leading-none';

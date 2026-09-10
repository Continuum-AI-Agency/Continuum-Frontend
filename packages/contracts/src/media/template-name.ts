// What a template may be CALLED, and why the answer is not "whatever the file was called".
//
// A forge run derives the template's root table from its name: `tpl_<key>_root`, where the key is
// `slugify(name)` and must match /^[a-z0-9_]{1,40}$/ — NEVER truncated, because a silently
// shortened key is two templates sharing one root table, and the render queue resolves the
// template FROM the table, so the second one becomes unreachable. That rule lives in the fleet
// (`template-forge/src/persist/naming.js` TEMPLATE_KEY_RE + templateKeyFor) and is mirrored here
// so a browser can say "too long" while the person is still typing, instead of the forge
// answering NAMING_NO_TEMPLATE_KEY three states into a run that already uploaded 200 MB.
//
// This is also why the Forge UI ASKS. Deriving the name from the upload looked free — "the file
// name is what the designer named it" — but a Library filename is a uuid plus an extension, which
// blows the 40-character limit on every single real upload.

/** The fleet's own rule, verbatim: `template-forge/src/persist/naming.js:34`. */
export const TEMPLATE_KEY_PATTERN = /^[a-z0-9_]{1,40}$/;
export const TEMPLATE_KEY_MAX = 40;

/** `renderContract.slugify`, verbatim — the same collapse the forge applies to the name. */
export function templateKeySlug(name: string): string {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** The key this name would produce, or `null` if the forge would refuse it. */
export function templateKeyFromName(name: string | null | undefined): string | null {
  const key = templateKeySlug(name ?? '');
  return TEMPLATE_KEY_PATTERN.test(key) ? key : null;
}

/**
 * Why a name is unusable, in words a person can act on — or `null` when it is fine.
 * Both the form and the API route render this, so the browser and the server agree.
 */
export function templateNameProblem(name: string | null | undefined): string | null {
  const raw = String(name ?? '').trim();
  if (!raw) return 'give this template a name';
  const key = templateKeySlug(raw);
  if (!key) return 'a name needs at least one letter or number';
  if (key.length > TEMPLATE_KEY_MAX) {
    return `too long — "${key}" is ${key.length} characters and the render table name allows ${TEMPLATE_KEY_MAX}`;
  }
  return null;
}

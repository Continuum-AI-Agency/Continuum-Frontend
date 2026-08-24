// Pure text operations behind the `text.*` action ops. No DOM, no canvas, no node
// shape — a string in, a string out — so the runner can call them anywhere and the
// tests need no environment.

/**
 * Escapes every RegExp metacharacter so a user's search term matches literally.
 * Without this, a `find` of `a.c` would match `abc`: the user typed three
 * characters and got a wildcard.
 */
const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface FindReplaceConfig {
  readonly find: string;
  readonly replace: string;
  readonly caseSensitive: boolean;
}

/** Replaces every occurrence of `find` with `replace`. */
export function findReplace(input: string, config: FindReplaceConfig): string {
  const { find, replace, caseSensitive } = config;

  // A global empty-string replace inserts the replacement between every character.
  // Nobody has ever meant that, and an empty `find` is the schema default — so the
  // node would mangle its input the moment it was wired up.
  if (find === '') return input;

  // split/join needs neither escaping nor replacement-pattern handling, so the
  // common path never constructs a RegExp at all.
  if (caseSensitive) return input.split(find).join(replace);

  // The replacer FUNCTION is what keeps `$&`, `$1` and `$'` literal. Handing the
  // replacement string straight to String.replace would expand them — the classic
  // footgun that turns a user's "$&" into the matched text.
  return input.replace(new RegExp(escapeRegExp(find), 'gi'), () => replace);
}

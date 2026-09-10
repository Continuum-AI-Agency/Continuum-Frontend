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

/**
 * THE KEY IS TENANT-SCOPED, and that is not cosmetic.
 *
 * A workspace is shared — 332 brands sit on one NocoBase sub-app today — and the key names a real
 * table in it. Derived from the name alone, two brands that both say "Summer Sale" both want
 * `tpl_summer_sale_root`, and the second is refused by the first brand's choice of words. The
 * brand's `client_key` (its identity inside that workspace) goes in front, so the table reads as
 * `tpl_starcraft_summer_sale_root` and neither brand can block the other.
 *
 * The prefix spends the same 40 characters the name does, which is why every function here takes
 * it: a budget computed in two places is a budget that will disagree with itself.
 */
export function templateKeyFor(
  name: string | null | undefined,
  clientKey?: string | null,
): string | null {
  const prefix = templateKeySlug(clientKey ?? '');
  const body = templateKeySlug(name ?? '');
  if (!body) return null;
  const key = prefix ? `${prefix}_${body}` : body;
  return TEMPLATE_KEY_PATTERN.test(key) ? key : null;
}

/** How many characters of NAME are left once the tenant prefix has taken its share. */
export function templateNameBudget(clientKey?: string | null): number {
  const prefix = templateKeySlug(clientKey ?? '');
  return prefix ? TEMPLATE_KEY_MAX - prefix.length - 1 : TEMPLATE_KEY_MAX;
}

/** The key this name would produce, or `null` if the forge would refuse it. */
export function templateKeyFromName(name: string | null | undefined): string | null {
  return templateKeyFor(name, null);
}

/**
 * Why a name is unusable, in words a person can act on — or `null` when it is fine.
 * Both the form and the API route render this, so the browser and the server agree.
 */
export function templateNameProblem(
  name: string | null | undefined,
  clientKey?: string | null,
): string | null {
  const raw = String(name ?? '').trim();
  if (!raw) return 'give this template a name';
  const body = templateKeySlug(raw);
  if (!body) return 'a name needs at least one letter or number';
  const budget = templateNameBudget(clientKey);
  if (body.length > budget) {
    return `too long — "${body}" is ${body.length} characters and the render table name allows ${budget}`;
  }
  return null;
}

/**
 * The brand's identity INSIDE a shared render workspace.
 *
 * Every derived key must be unique across brands, not merely per brand: the database's uniqueness
 * is `(brand_id, picinst, environment_key, client_key)`, so two brands could hold the same
 * client_key without violating anything — and then their templates would collide on one root
 * table again, which is the exact bug the prefix exists to stop. The brand id supplies that
 * uniqueness; the name supplies the readability, because `tpl_starcraft_b17d81_summer_sale_root`
 * is what someone will be looking at in a collection list.
 *
 * Truncation cuts at a word boundary when one is near, so "StarCraft: Remastered" becomes
 * `starcraft`, not `starcraft_re`. It spends characters the template name then cannot have
 * (`templateNameBudget`), which is why it is capped rather than merely slugified.
 */
const CLIENT_KEY_NAME_MAX = 12;

export function renderClientKeyFor(brandName: string | null | undefined, brandId: string): string {
  const uniq = String(brandId).replace(/[^0-9a-f]/gi, '').slice(0, 6).toLowerCase();
  let stem = templateKeySlug(brandName ?? '').slice(0, CLIENT_KEY_NAME_MAX);
  // A cut that landed mid-word reads as a typo; fall back to the last whole word it kept.
  if (templateKeySlug(brandName ?? '').length > CLIENT_KEY_NAME_MAX && stem.includes('_')) {
    stem = stem.slice(0, stem.lastIndexOf('_'));
  }
  stem = stem.replace(/_+$/, '');
  return stem ? `${stem}_${uniq}` : `brand_${uniq}`;
}

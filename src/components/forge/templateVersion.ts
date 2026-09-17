import type { ApiRenderJob } from '@continuum/contracts';

/**
 * How a template VERSION reads, everywhere in the Forge.
 *
 * A version is the exact template bytes a render used — not the source file someone uploaded
 * (that is a source revision) and not the contract hash (that is the field vocabulary). See
 * template-forge `docs/TEMPLATE_IDENTITY.md`.
 *
 * There is deliberately no `v3`-style ordinal yet: an ordinal is a position on the template's
 * published chain, which lives in the forge's version tree, and inventing one from a job row
 * would put a number on screen that means nothing. The digest is the identity; the ordinal
 * arrives with the version-tree mirror.
 */

/** A sha256 as people read it aloud. Matches LineagePanel's own elision. */
export function shortSha(sha: string | null | undefined): string {
  if (!sha) return '—';
  return `${sha.slice(0, 10)}…`;
}

export type TemplateVersionView =
  | { state: 'pinned'; sha: string; short: string; assetId: string; versionId: string }
  // A render that recorded no source can never be traced back to the bytes it used. That is a
  // permanent gap in the record, not a pending one, so it is named rather than blanked.
  | { state: 'unrecorded' };

export function templateVersionOf(job: Pick<ApiRenderJob, 'templateSource'>): TemplateVersionView {
  const source = job.templateSource;
  if (!source?.sha256) return { state: 'unrecorded' };
  return {
    state: 'pinned',
    sha: source.sha256,
    short: shortSha(source.sha256),
    assetId: source.assetId,
    versionId: source.versionId,
  };
}

/** The one-line explanation the column's tooltip carries. */
export function templateVersionTitle(view: TemplateVersionView): string {
  if (view.state === 'unrecorded') {
    return 'No template version was recorded for this render — the exact bytes it used cannot be established.';
  }
  return `Template version ${view.sha}`;
}

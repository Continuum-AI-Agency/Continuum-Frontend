import type { ApiRenderJob } from '@continuum/contracts';

/**
 * How a template VERSION reads, everywhere in the Forge.
 *
 * A version is the exact template bytes a render used — not the contract hash (that is the field
 * vocabulary). See template-forge `docs/TEMPLATE_IDENTITY.md`.
 *
 * People read it as "Rev 2 · Sep 10": the source revision's own number
 * (`media.asset_versions.version_number`, on the wire as `templateSource.versionNumber`) and the
 * day the render ran. The digest stays the identity and rides in the tooltip. A job whose revision
 * number was not read back (older rows, or a server before the field) falls back to the short
 * digest — never a number invented from the job row.
 */

/** A sha256 as people read it aloud. Matches LineagePanel's own elision. */
export function shortSha(sha: string | null | undefined): string {
  if (!sha) return '—';
  return `${sha.slice(0, 10)}…`;
}

/** "Rev 2 · Sep 10" — a source revision and the day it was used. */
export function revisionLabel(versionNumber: number, at: string): string {
  const day = new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `Rev ${versionNumber} · ${day}`;
}

export type TemplateVersionView =
  | {
      state: 'pinned';
      sha: string;
      short: string;
      /** "Rev 2 · Sep 10", else the short digest. */
      label: string;
      assetId: string;
      versionId: string;
    }
  // A render that recorded no source can never be traced back to the bytes it used. That is a
  // permanent gap in the record, not a pending one, so it is named rather than blanked.
  | { state: 'unrecorded' };

export function templateVersionOf(
  job: Pick<ApiRenderJob, 'templateSource' | 'createdAt'>,
): TemplateVersionView {
  const source = job.templateSource;
  if (!source?.sha256) return { state: 'unrecorded' };
  const short = shortSha(source.sha256);
  return {
    state: 'pinned',
    sha: source.sha256,
    short,
    label: source.versionNumber ? revisionLabel(source.versionNumber, job.createdAt) : short,
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

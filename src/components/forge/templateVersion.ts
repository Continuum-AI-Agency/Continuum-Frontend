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

/**
 * `inyogo/9:16/base` reads as `9:16/base`; `232/story/tall@accepted` keeps its state.
 *
 * Lives beside the version helpers rather than in the Variants panel, because the ledger names a
 * render's variant too and a pure helper must not drag a client component into its importers.
 */
export function variantLabel(ref: string): string {
  const cut = ref.indexOf('/');
  return cut === -1 ? ref : ref.slice(cut + 1);
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
      /**
       * Which sibling version of the design those bytes are — `9:16/base`, `es/legal-wrap`.
       *
       * Null is UNCHECKED, never "there is only one": an operator-granted template has no store
       * commit by construction, and a forge that could not be reached leaves the pin unnamed.
       */
      variant: string | null;
    }
  // A render that recorded no source can never be traced back to the bytes it used. That is a
  // permanent gap in the record, not a pending one, so it is named rather than blanked.
  | { state: 'unrecorded' };

export function templateVersionOf(
  job: Pick<ApiRenderJob, 'templateSource' | 'templateVariant' | 'createdAt'>,
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
    // A commit with no ref is an unnamed head — real, but not a name anyone can read, so the
    // ledger shows nothing rather than a bare sha pretending to be a variant.
    variant: job.templateVariant?.ref ? variantLabel(job.templateVariant.ref) : null,
  };
}

/** The one-line explanation the column's tooltip carries. */
export function templateVersionTitle(view: TemplateVersionView): string {
  if (view.state === 'unrecorded') {
    return 'No template version was recorded for this render — the exact bytes it used cannot be established.';
  }
  if (view.variant) return `Template version ${view.sha} — variant ${view.variant}`;
  return `Template version ${view.sha} — variant unchecked`;
}

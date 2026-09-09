// Which panel the Library is showing.
//
// Everything the Library browses is a media.assets row filtered by one server-side RPC, so
// "which section" is normally just a filter. Typography is the exception and has to be:
// brand faces are licensed to the brand, the font store deliberately never mints a URL for
// one, and a font that became a media.assets row would inherit search, share links and
// signed-URL minting. So it is a different panel over a different store, not a filter.
//
// `pipelines` is the same shape of exception: a published pipeline is a
// `brand_profiles.canvas_workflows` row, not an asset, and what a reader wants from it —
// which ports to feed, whether it can run — is not a field the browse RPC has.
//
// Lives in the URL rather than component state so a refresh, a back button and a pasted link
// all land on the same panel — the same contract every other Library filter already keeps.

export const LIBRARY_SECTIONS = ['browse', 'typography', 'pipelines'] as const;
export type LibrarySection = (typeof LIBRARY_SECTIONS)[number];

export function parseLibrarySection(value: string | undefined | null): LibrarySection {
  if (value === 'typography') return 'typography';
  if (value === 'pipelines') return 'pipelines';
  return 'browse';
}

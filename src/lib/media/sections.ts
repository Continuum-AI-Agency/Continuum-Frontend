// Which panel the Library is showing.
//
// Everything the Library browses is a media.assets row filtered by one server-side RPC, so
// "which section" is normally just a filter. Typography is the exception and has to be:
// brand faces are licensed to the brand, the font store deliberately never mints a URL for
// one, and a font that became a media.assets row would inherit search, share links and
// signed-URL minting. So it is a different panel over a different store, not a filter.
//
// Lives in the URL rather than component state so a refresh, a back button and a pasted link
// all land on the same panel — the same contract every other Library filter already keeps.

export const LIBRARY_SECTIONS = ['browse', 'typography'] as const;
export type LibrarySection = (typeof LIBRARY_SECTIONS)[number];

export function parseLibrarySection(value: string | undefined | null): LibrarySection {
  return value === 'typography' ? 'typography' : 'browse';
}

// A link into Forge from elsewhere — the Library's provenance panel — that opens a template, one of
// its render sets and a row in it: `/forge?template=&set=&row=&rerender=1`. Written and read here
// only, so the two ends cannot drift.

export type ForgeDeepLink = {
  /** The template's source asset id. */
  templateAssetId: string;
  renderSetId: string | null;
  rowId: string | null;
  /** Select the row, ready for Render — never render it without the person confirming. */
  rerender: boolean;
};

export function forgeDeepLinkHref(link: {
  templateAssetId: string | null;
  renderSetId: string | null;
  rowId: string | null;
  rerender?: boolean;
}): string {
  const params = new URLSearchParams();
  if (link.templateAssetId) params.set('template', link.templateAssetId);
  if (link.renderSetId) params.set('set', link.renderSetId);
  if (link.rowId) params.set('row', link.rowId);
  if (link.rerender) params.set('rerender', '1');
  const query = params.toString();
  return query ? `/forge?${query}` : '/forge';
}

/** Null without a template: a set or row means nothing until its template is known. */
export function readForgeDeepLink(search: string): ForgeDeepLink | null {
  const params = new URLSearchParams(search);
  const templateAssetId = params.get('template');
  if (!templateAssetId) return null;
  const renderSetId = params.get('set');
  return {
    templateAssetId,
    renderSetId,
    rowId: renderSetId ? params.get('row') : null,
    rerender: params.get('rerender') === '1',
  };
}

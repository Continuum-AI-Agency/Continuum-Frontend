// Links into Forge from the Library or AI Studio. Query names are kept here so the two ends cannot
// drift: `/forge?template=&set=&row=&rerender=1` or `/forge?hfRevision=&brand=`.

export type ForgeDeepLink = {
  /** The template's source asset id. */
  templateAssetId: string | null;
  renderSetId: string | null;
  rowId: string | null;
  /** Select the row, ready for Render — never render it without the person confirming. */
  rerender: boolean;
  /** Latest private Hyperframes composition revision to attach after choosing a source. */
  hyperframesRevisionId: string | null;
  /** Active brand at handoff time; Forge refuses to carry it across a brand switch. */
  brandId: string | null;
};

export function forgeDeepLinkHref(link: {
  templateAssetId: string | null;
  renderSetId: string | null;
  rowId: string | null;
  rerender?: boolean;
  hyperframesRevisionId?: string | null;
  brandId?: string | null;
}): string {
  const params = new URLSearchParams();
  if (link.templateAssetId) params.set('template', link.templateAssetId);
  if (link.renderSetId) params.set('set', link.renderSetId);
  if (link.rowId) params.set('row', link.rowId);
  if (link.rerender) params.set('rerender', '1');
  if (link.hyperframesRevisionId) params.set('hfRevision', link.hyperframesRevisionId);
  if (link.brandId) params.set('brand', link.brandId);
  const query = params.toString();
  return query ? `/forge?${query}` : '/forge';
}

/** Null without a template or Hyperframes revision: a set or row needs its template. */
export function readForgeDeepLink(search: string): ForgeDeepLink | null {
  const params = new URLSearchParams(search);
  const templateAssetId = params.get('template');
  const hyperframesRevisionId = params.get('hfRevision');
  if (!templateAssetId && !hyperframesRevisionId) return null;
  const renderSetId = params.get('set');
  return {
    templateAssetId: templateAssetId || null,
    renderSetId,
    rowId: templateAssetId && renderSetId ? params.get('row') : null,
    rerender: params.get('rerender') === '1',
    hyperframesRevisionId: hyperframesRevisionId || null,
    brandId: params.get('brand') || null,
  };
}

import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';

/**
 * The workspace a template lives in, and whether naming it matters. One workspace is not a
 * question — the server answers from the default — so only a brand with several is asked in turn.
 * Every read of a template's contract goes through this: without the binding, a template in a
 * brand's non-default workspace is not found.
 */
export async function templateBindingFor(
  brandId: string,
  templateKey: string,
): Promise<{ bindingId: string | null; several: boolean }> {
  const { items } = await apiRendersApi.listEnvironments(brandId);
  if (items.length <= 1) return { bindingId: items[0]?.bindingId ?? null, several: false };
  for (const environment of items) {
    const templates = await apiRendersApi.listTemplates(brandId, environment.bindingId);
    if (templates.items.some((template) => template.key === templateKey)) {
      return { bindingId: environment.bindingId, several: true };
    }
  }
  return { bindingId: null, several: true };
}

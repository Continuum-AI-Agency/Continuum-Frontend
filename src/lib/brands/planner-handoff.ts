import { z } from 'zod';

const idSchema = z.string().uuid();

type PlannerHandoffInput = {
  brandId: string;
  draftId?: string;
  accessibleBrandIds: readonly string[];
  draftBrandId?: string | null;
};

export type PlannerHandoff = {
  brandId: string;
  destination: string;
};

/** Validate an MCP-to-Planner handoff before it can mutate the web preference. */
export function resolvePlannerHandoff(input: PlannerHandoffInput): PlannerHandoff {
  if (!idSchema.safeParse(input.brandId).success) throw new Error('Invalid brand id');
  if (input.draftId && !idSchema.safeParse(input.draftId).success) {
    throw new Error('Invalid draft id');
  }
  if (!input.accessibleBrandIds.includes(input.brandId)) throw new Error('Brand access denied');
  if (input.draftId && input.draftBrandId !== input.brandId) {
    throw new Error('Draft does not belong to brand');
  }

  const params = new URLSearchParams({ tab: 'planner' });
  if (input.draftId) params.set('draftId', input.draftId);
  return { brandId: input.brandId, destination: `/organic?${params}` };
}

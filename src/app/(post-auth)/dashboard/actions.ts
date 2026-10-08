'use server';

import type { HomeObjective } from '@continuum/contracts';
import { revalidatePath } from 'next/cache';
import {
  resetHomeObjectives,
  type SaveHomeObjectivesResult,
  saveHomeObjectives,
} from '@/lib/home/homeProfile.server';

/** Saves what the Home leads with for a brand ("brand") or one of its ad accounts. */
export async function saveHomeObjectivesAction(
  brandId: string,
  scope: string,
  objectives: HomeObjective[],
): Promise<SaveHomeObjectivesResult> {
  const result = await saveHomeObjectives({ brandId, scope, objectives });
  if (result.ok) revalidatePath('/dashboard');
  return result;
}

/** Forgets the saved goals for a scope, so the Home goes back to the brand's or the inferred ones. */
export async function resetHomeObjectivesAction(
  brandId: string,
  scope: string,
): Promise<SaveHomeObjectivesResult> {
  const result = await resetHomeObjectives({ brandId, scope });
  if (result.ok) revalidatePath('/dashboard');
  return result;
}

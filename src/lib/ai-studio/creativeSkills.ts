// Browser client for the Creative Studio "skill from selection" translator. Calls
// the agents-ts backend directly (http.request attaches base URL + bearer), per
// the FE API-layer rule. The draft is returned for review; saving goes through the
// existing brand-skill CRUD (createBrandSkill).

'use client';

import {
  type CreativeSkillDraft,
  type CreativeSkillDraftResponse,
  creativeSkillDraftResponseSchema,
  type CreativeSkillSelection,
} from '@continuum/contracts';
import { http } from '@/lib/api/http';

export async function draftSkillFromSelection(
  selection: CreativeSkillSelection,
): Promise<CreativeSkillDraft> {
  const result = await http.request<CreativeSkillDraftResponse>({
    path: '/api/ai-studio/skills/draft',
    method: 'POST',
    body: selection,
    schema: creativeSkillDraftResponseSchema,
  });
  return result.draft;
}

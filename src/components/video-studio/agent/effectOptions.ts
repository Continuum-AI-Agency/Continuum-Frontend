// What the Video Studio agent's `/` menu offers, apart from the panel so it can be read alone.

import { VIDEO_HOUSE_EFFECTS, type VideoEditorWorkflow, workflowSlug } from '@continuum/contracts';
import type { SlashOption } from '@/components/chat/slashShortcuts';

/**
 * The `/` menu: the brand's saved workflows, then the house effects. A saved workflow answers
 * to its name's slug and shadows a house effect of the same slug, as the agent resolves them.
 */
export function effectOptions(workflows: readonly VideoEditorWorkflow[]): SlashOption[] {
  const saved = workflows
    .map((workflow) => ({
      slug: workflowSlug(workflow.name),
      label: workflow.name,
      group: 'Saved',
    }))
    .filter(
      (option, index, all) =>
        option.slug && all.findIndex((other) => other.slug === option.slug) === index,
    );
  const taken = new Set(saved.map((option) => option.slug));
  const house = VIDEO_HOUSE_EFFECTS.filter((effect) => !taken.has(effect.slug)).map((effect) => ({
    slug: effect.slug,
    label: effect.description,
    group: 'Effects',
  }));
  return [...saved, ...house];
}

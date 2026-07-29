// A skill body has two audiences with incompatible needs, so it carries two
// sections separated by the `## Canvas recipe` heading.
//
//   model-facing (everything above)  -- string-appended into a real image/video
//     generation prompt by the AI Studio injector and folded into the organic
//     pipeline's guidancePrompt. A diffusion model reads this as creative
//     direction, so it must describe PIXELS: no node types, no graph wiring.
//   agent-facing (the heading and everything below) -- read only by the canvas
//     composer, which is the only consumer that has nodes to wire. Stripped
//     before any prompt injection.
//
// The split exists because the two were previously one string: four shipped
// skills carried `### Graph recipe` / `### Canvas workflow` prose that was being
// handed to Veo and nano-banana as creative direction ("add a frameExtract node
// for the exact last frame"). Splitting keeps the recipe knowledge — the composer
// finally gets to read it — without leaking it into the pixels.

export const SKILL_CANVAS_RECIPE_HEADING = '## Canvas recipe';

export interface SkillBodySections {
  /** Safe to append to a generation prompt. Never contains node or graph vocabulary. */
  modelFacing: string;
  /** The canvas recipe, without its heading. Empty when the skill has no recipe. */
  agentFacing: string;
}

// Splits on the first `## Canvas recipe` heading that starts a line, so the
// literal string appearing mid-sentence in prose cannot truncate a body.
// A skill with no recipe section returns its whole body as model-facing.
export function splitSkillBody(directives: string): SkillBodySections {
  const match = /^## Canvas recipe[ \t]*$/m.exec(directives);
  if (!match) return { modelFacing: directives.trim(), agentFacing: '' };
  return {
    modelFacing: directives.slice(0, match.index).trim(),
    agentFacing: directives.slice(match.index + match[0].length).trim(),
  };
}

// The half a generation prompt is allowed to see.
export function skillModelFacingBody(directives: string): string {
  return splitSkillBody(directives).modelFacing;
}

// The half the canvas composer is allowed to see. Empty string means the skill
// is pure pixel craft and carries no graph shape.
export function skillCanvasRecipe(directives: string): string {
  return splitSkillBody(directives).agentFacing;
}

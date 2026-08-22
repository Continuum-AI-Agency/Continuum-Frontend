import { describe, expect, it } from 'bun:test';
import {
  SKILL_CANVAS_RECIPE_HEADING,
  skillCanvasRecipe,
  skillModelFacingBody,
  splitSkillBody,
} from './skill-body';

const BODY = `## Poster and Key Visual

One still frame carries the whole message.

### Never
- Malformed letterforms

## Canvas recipe
- One \`string\` prompt node into one \`nanoGen\`.
- Terminate on \`plannerDraft\`.`;

describe('splitSkillBody', () => {
  it('splits a two-section body at the canvas-recipe heading', () => {
    const { modelFacing, agentFacing } = splitSkillBody(BODY);

    expect(modelFacing).toStartWith('## Poster and Key Visual');
    expect(modelFacing).toContain('Malformed letterforms');
    expect(agentFacing).toStartWith('- One `string` prompt node');
    expect(agentFacing).toContain('plannerDraft');
  });

  it('keeps node vocabulary out of the model-facing half', () => {
    const modelFacing = skillModelFacingBody(BODY);

    for (const nodeType of ['nanoGen', 'plannerDraft', 'string`']) {
      expect(modelFacing).not.toContain(nodeType);
    }
    expect(modelFacing).not.toContain(SKILL_CANVAS_RECIPE_HEADING);
  });

  it('drops the heading itself from the agent-facing half', () => {
    expect(skillCanvasRecipe(BODY)).not.toContain(SKILL_CANVAS_RECIPE_HEADING);
  });

  it('treats a body with no recipe section as entirely model-facing', () => {
    const craftOnly = '## Hook Patterns\n\nThe hook stops the scroll.';
    const { modelFacing, agentFacing } = splitSkillBody(craftOnly);

    expect(modelFacing).toBe(craftOnly);
    expect(agentFacing).toBe('');
  });

  // The heading is a structural marker, so only a line that IS the heading may
  // split. Prose that merely mentions it must not truncate the craft section.
  it('ignores the heading text when it appears mid-line', () => {
    const prose = '## Carousel Sets\n\nSee the ## Canvas recipe below for wiring.\n\nMore craft.';

    expect(splitSkillBody(prose).agentFacing).toBe('');
    expect(splitSkillBody(prose).modelFacing).toContain('More craft.');
  });

  it('splits on the first heading when a body somehow repeats it', () => {
    const doubled = 'Craft.\n\n## Canvas recipe\n- first\n\n## Canvas recipe\n- second';
    const { modelFacing, agentFacing } = splitSkillBody(doubled);

    expect(modelFacing).toBe('Craft.');
    expect(agentFacing).toContain('- first');
    expect(agentFacing).toContain('- second');
  });

  it('tolerates trailing whitespace on the heading line', () => {
    const padded = 'Craft.\n\n## Canvas recipe   \n- wire it';

    expect(skillCanvasRecipe(padded)).toBe('- wire it');
  });
});

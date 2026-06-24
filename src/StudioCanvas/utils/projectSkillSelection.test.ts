import { describe, expect, it } from 'bun:test';
import { projectSkillSelection } from './projectSkillSelection';
import { StudioNode } from '../types';

const node = (id: string, type: string, data: Record<string, unknown>): StudioNode =>
  ({ id, type, position: { x: 0, y: 0 }, data } as StudioNode);

describe('projectSkillSelection', () => {
  it('projects gen + string + reference nodes into selection nodes', () => {
    const selection = projectSkillSelection(
      [
        node('s', 'string', { value: 'A neon ramen bowl' }),
        node('n', 'nanoGen', { model: 'nano-banana-pro', positivePrompt: 'top-down hero', aspectRatio: '1:1' }),
        node('v', 'veoDirector', { model: 'veo-3.1', prompt: 'slow push-in', negativePrompt: 'shaky' }),
        node('i', 'image', { referenceType: 'product' }),
      ],
      'brand-1',
    );

    expect(selection.brandId).toBe('brand-1');
    expect(selection.nodes).toHaveLength(4);
    expect(selection.nodes.find((n) => n.nodeType === 'nanoGen')?.prompt).toBe('top-down hero');
    expect(selection.nodes.find((n) => n.nodeType === 'videoGen')?.negativePrompt).toBe('shaky');
    expect(selection.nodes.find((n) => n.nodeType === 'image')?.referenceRoles).toEqual(['product']);
  });

  it('drops nodes with no usable signal (empty prompts, default reference)', () => {
    const selection = projectSkillSelection(
      [
        node('s', 'string', { value: '   ' }),
        node('n', 'nanoGen', { model: 'nano-banana', positivePrompt: '' }),
        node('i', 'image', { referenceType: 'default' }),
        node('a', 'audio', { audio: 'x' }),
      ],
      'brand-1',
    );

    expect(selection.nodes).toHaveLength(0);
  });
});

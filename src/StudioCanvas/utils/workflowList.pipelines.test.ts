import { describe, expect, test } from 'bun:test';
import { PIPELINE_METADATA_FLAG, TECHNIQUE_METADATA_FLAG } from '@continuum/contracts';
import type { AiStudioWorkflow } from '@/lib/schemas/aiStudio';
import type { WorkflowLibraryItem } from '@/lib/schemas/workflowLibrary';
import { partitionSavedWorkflows, premadeRank, sortPremades } from './workflowList';

const ports = {
  version: 1,
  kind: 'generation',
  inputPorts: [{ id: 'in-1', nodeRef: 'gen', handleId: 'ref-image' }],
  outputPorts: [{ id: 'out-1', nodeRef: 'gen', handleId: 'image' }],
};

const item = (name: string): WorkflowLibraryItem =>
  ({
    id: name,
    name,
    description: null,
    tags: [],
    content: { nodes: [], edges: [] },
  }) as unknown as WorkflowLibraryItem;

const workflow = (name: string, metadata?: Record<string, unknown>): AiStudioWorkflow =>
  ({ id: name, name, nodes: [], edges: [], metadata }) as unknown as AiStudioWorkflow;

describe('premadeRank', () => {
  test('reads the leading number the shipped templates are named with', () => {
    expect(premadeRank('1. Founder')).toBe(1);
    expect(premadeRank('10. Minimal Branding')).toBe(10);
    expect(premadeRank('3) Brand Lifestyle')).toBe(3);
  });

  test('an unnumbered template has no place in the sequence', () => {
    expect(premadeRank('Brand extension generator')).toBeNull();
    expect(premadeRank('Version 2 of something')).toBeNull();
  });
});

describe('sortPremades', () => {
  // The bug this exists for: the library ordered by name, so the curated 1-10 sequence came
  // out 1, 10, 2, 3 — the tenth template sat second in a list whose numbering is the whole
  // point of it.
  test('orders 1-10 numerically, not lexically', () => {
    const shuffled = ['10. Minimal Branding', '2. Premium Cinematic Product', '1. Founder'].map(
      item,
    );
    expect(sortPremades(shuffled).map((entry) => entry.name)).toEqual([
      '1. Founder',
      '2. Premium Cinematic Product',
      '10. Minimal Branding',
    ]);
  });

  test('unnumbered templates sort after the sequence, alphabetically', () => {
    const mixed = ['Palette smash-up', '2. Premium', 'Brand extension', '1. Founder'].map(item);
    expect(sortPremades(mixed).map((entry) => entry.name)).toEqual([
      '1. Founder',
      '2. Premium',
      'Brand extension',
      'Palette smash-up',
    ]);
  });

  test('does not mutate the list it was given', () => {
    const original = ['2. B', '1. A'].map(item);
    sortPremades(original);
    expect(original.map((entry) => entry.name)).toEqual(['2. B', '1. A']);
  });
});

describe('partitionSavedWorkflows', () => {
  test('a published pipeline leaves the saved list', () => {
    const { saved, pipelines } = partitionSavedWorkflows([
      workflow('plain'),
      workflow('published', { [PIPELINE_METADATA_FLAG]: ports }),
    ]);
    expect(saved.map((w) => w.name)).toEqual(['plain']);
    expect(pipelines.map((w) => w.name)).toEqual(['published']);
  });

  // A technique is a sub-graph workflow — saved by the user, wired in by hand. It belongs
  // with their other saved work, not in the tab that means "published for the machine".
  test('a technique stays in saved, because it is a workflow', () => {
    const { saved, pipelines } = partitionSavedWorkflows([
      workflow('sub-graph', { [TECHNIQUE_METADATA_FLAG]: ports }),
    ]);
    expect(saved.map((w) => w.name)).toEqual(['sub-graph']);
    expect(pipelines).toEqual([]);
  });

  test('a workflow that is both is listed once, as a pipeline', () => {
    const { saved, pipelines } = partitionSavedWorkflows([
      workflow('both', {
        [TECHNIQUE_METADATA_FLAG]: ports,
        [PIPELINE_METADATA_FLAG]: ports,
      }),
    ]);
    expect(saved).toEqual([]);
    expect(pipelines.map((w) => w.name)).toEqual(['both']);
  });

  test('metadata that is absent or junk is just a saved workflow', () => {
    const { saved, pipelines } = partitionSavedWorkflows([
      workflow('none'),
      workflow('junk', { [PIPELINE_METADATA_FLAG]: { version: 99 } }),
    ]);
    expect(saved).toHaveLength(2);
    expect(pipelines).toEqual([]);
  });
});

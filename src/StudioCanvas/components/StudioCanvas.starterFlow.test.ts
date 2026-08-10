import { describe, expect, it } from 'bun:test';

import type { PlannerAiStudioHandoff } from '@/lib/organic/ai-studio-bridge';
import { buildStarterFlow } from './StudioCanvas';

const carouselSeed = (overrides: Partial<PlannerAiStudioHandoff> = {}): PlannerAiStudioHandoff => ({
  schemaVersion: 'planner_ai_handoff_v1',
  draftId: 'draft-1',
  brandProfileId: 'brand-1',
  weekStartId: '2026-08-03',
  platform: 'instagram',
  postType: 'carousel',
  workflowConcept: 'ig_carousel_multi_image',
  format: 'Carousel',
  authoritativeCount: 10,
  title: 'Inefficient booking costs time',
  summary: 'Ten reasons manual booking bleeds hours',
  captionPreview: 'Stop losing 15 hours a week',
  updatedAt: '2026-08-06T17:03:00.000Z',
  ...overrides,
});

const slideTextNodes = (nodes: Array<{ type?: string; data: unknown }>) =>
  nodes.filter((node) => node.type === 'string');

const generatorNodes = (nodes: Array<{ type?: string }>) =>
  nodes.filter((node) => node.type === 'nanoGen');

const promptOf = (node: { data: unknown }) => (node.data as { value?: string }).value ?? '';

describe('buildStarterFlow — carousel handoff', () => {
  it('seeds one generator and one distinct, non-empty prompt node per slide', () => {
    const { nodes, edges } = buildStarterFlow(
      carouselSeed({
        slides: Array.from({ length: 10 }, (_, index) => ({
          index,
          prompt: `Slide ${index + 1} visual direction`,
        })),
      }),
    );

    const texts = slideTextNodes(nodes);
    const generators = generatorNodes(nodes);
    expect(texts).toHaveLength(10);
    expect(generators).toHaveLength(10);

    const prompts = texts.map(promptOf);
    expect(prompts.every((prompt) => prompt.trim().length > 0)).toBe(true);
    expect(new Set(prompts).size).toBe(10);

    // Each slide carries its OWN direction, plus the shared brief verbatim.
    prompts.forEach((prompt, index) => {
      expect(prompt).toContain(`Slide ${index + 1} of 10`);
      expect(prompt).toContain(`Slide ${index + 1} visual direction`);
      expect(prompt).toContain('Inefficient booking costs time');
    });

    // One text node feeds exactly one generator — a shared node would make all
    // ten generators render the same image.
    const promptEdges = edges.filter((edge) => edge.targetHandle === 'prompt');
    expect(promptEdges).toHaveLength(10);
    expect(new Set(promptEdges.map((edge) => edge.source)).size).toBe(10);
    expect(new Set(promptEdges.map((edge) => edge.target)).size).toBe(10);
  });

  it('still produces distinct prompts when the draft carries no per-slide copy', () => {
    const { nodes } = buildStarterFlow(carouselSeed({ authoritativeCount: 4 }));

    const prompts = slideTextNodes(nodes).map(promptOf);
    expect(prompts).toHaveLength(4);
    expect(new Set(prompts).size).toBe(4);
    expect(prompts.every((prompt) => prompt.trim().length > 0)).toBe(true);
  });

  it('caps at the ten slides Instagram will publish', () => {
    const { nodes } = buildStarterFlow(carouselSeed({ authoritativeCount: 25 }));
    expect(generatorNodes(nodes)).toHaveLength(10);
    expect(slideTextNodes(nodes)).toHaveLength(10);
  });

  it('leaves single-output workflows on one shared prompt node', () => {
    const { nodes } = buildStarterFlow(
      carouselSeed({
        postType: 'post',
        workflowConcept: 'ig_post_single_image',
        format: 'Post',
        authoritativeCount: 1,
      }),
    );

    expect(slideTextNodes(nodes)).toHaveLength(1);
    expect(generatorNodes(nodes)).toHaveLength(1);
  });
});

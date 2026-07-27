import { describe, expect, it } from 'bun:test';
import { describeNodeVocabulary } from './agent-vocabulary';
import { STUDIO_NODE_TYPES, timelineItemSpecSchema } from './workflow-graph';

describe('describeNodeVocabulary', () => {
  const block = describeNodeVocabulary();

  it('names every node type the canvas accepts', () => {
    for (const type of STUDIO_NODE_TYPES) {
      expect(block).toContain(`- ${type} —`);
    }
  });

  it('advertises the handle a video generator actually renders', () => {
    expect(block).toContain('prompt-in');
  });

  it('states the reference-image limit rather than leaving the model to guess', () => {
    expect(block).toMatch(/ref-images \(max \d+\)/);
  });

  it('advertises both Veo 3.1 reference modes and the exclusivity between them', () => {
    expect(block).toContain('referenceMode "frames"');
    expect(block).toContain('referenceMode "images"');
    expect(block).toMatch(/veo-3\.1 .*referenceMode "frames".*first-frame, last-frame/);
    expect(block).toContain('REJECTS reference images and first/last frames in one request');
  });

  it('marks source nodes as taking no inputs', () => {
    const imageLine = block.split('\n').find((line) => line.startsWith('- image —'));
    expect(imageLine).toBeDefined();
    const inputsLine = block.split('\n')[block.split('\n').indexOf(imageLine as string) + 1];
    expect(inputsLine).toContain('(none — it is a source)');
  });

  it('marks publishing sinks as producing no output', () => {
    const lines = block.split('\n');
    for (const type of ['organicPublisher', 'paidPublisher']) {
      const index = lines.findIndex((line) => line.startsWith(`- ${type} —`));
      expect(lines[index + 2]).toContain('(none — it is a sink)');
    }
  });
});

describe('timeline placement drift guard', () => {
  it('documents every field timelineItemSpecSchema accepts, and nothing else', () => {
    const block = describeNodeVocabulary();
    const schemaFields = Object.keys(timelineItemSpecSchema.shape);
    for (const field of schemaFields) {
      expect(block).toContain(`${field}:`);
    }
    // The wrong names the model used to guess must never appear as documented fields.
    for (const invented of ['mediaId', 'durationMs', 'clipIndex', 'offsetMs']) {
      expect(block).not.toContain(invented);
    }
  });

  it('lists the real transition vocabulary', () => {
    expect(describeNodeVocabulary()).toContain('crossDissolve');
  });
});

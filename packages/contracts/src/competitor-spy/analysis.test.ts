import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import {
  competitorPostAnalysisSchema,
  competitorPostIdeaSchema,
  competitorPostVideoDescriptionSchema,
} from './analysis';

describe('competitor post analysis schemas', () => {
  it('give Gemini no union and no numeric enum', () => {
    for (const schema of [competitorPostIdeaSchema, competitorPostVideoDescriptionSchema]) {
      const json = JSON.stringify(z.toJSONSchema(schema));
      expect(json).not.toMatch(/"(anyOf|oneOf|allOf)"/);
      expect(json).not.toMatch(/"enum":\[\d/);
    }
  });

  it('rejects an Idea block with no supporting evidence or a blank contrarian reality', () => {
    const idea = {
      topic: 't',
      industry: 'i',
      ideaSeed: 's',
      uniqueAngle: 'u',
      commonBeliefChallenged: 'c',
      contrarianReality: 'r',
      supportingEvidence: ['e'],
    };
    expect(competitorPostIdeaSchema.safeParse(idea).success).toBe(true);
    expect(competitorPostIdeaSchema.safeParse({ ...idea, supportingEvidence: [] }).success).toBe(
      false,
    );
    expect(competitorPostIdeaSchema.safeParse({ ...idea, contrarianReality: '' }).success).toBe(
      false,
    );
  });

  it('still parses a stored failure envelope written before the Idea block existed', () => {
    const parsed = competitorPostAnalysisSchema.parse({
      kind: 'failed',
      error: 'Cannot fetch content from the provided URL.',
      model: 'gemini-3.1-flash-lite',
      duration_ms: 812,
    });
    expect(parsed.idea).toBeUndefined();
  });
});

import { describe, expect, it } from 'bun:test';
import { buildCampaignGoalRequest } from './CreateCampaignGoalDialog';

describe('buildCampaignGoalRequest', () => {
  it('creates the campaign template from explicit structured interface values', () => {
    const request = buildCampaignGoalRequest('brand-1', {
      title: 'Q4 acquisition',
      objective: 'Acquire qualified customers within the approved investment envelope.',
      successCriteria: 'Launch approval recorded\nMeasurement plan accepted',
      visibility: 'brand',
      activatedArtifactIds: ['offer-destination-brief', 'experiment-plan'],
    });

    expect(request).toEqual(
      expect.objectContaining({
        brandId: 'brand-1',
        kind: 'campaign-creation',
        templateId: 'campaign-creation',
        visibility: 'brand',
        activatedArtifactIds: ['offer-destination-brief', 'experiment-plan'],
        successCriteria: [
          { id: 'criterion-1', statement: 'Launch approval recorded' },
          { id: 'criterion-2', statement: 'Measurement plan accepted' },
        ],
      }),
    );
  });

  it('rejects a Goal without an explicit definition of done', () => {
    expect(() =>
      buildCampaignGoalRequest('brand-1', {
        title: 'Q4 acquisition',
        objective: 'Acquire qualified customers.',
        successCriteria: '  \n ',
        visibility: 'private',
        activatedArtifactIds: [],
      }),
    ).toThrow();
  });
});

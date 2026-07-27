import { describe, expect, it } from 'bun:test';
import {
  type GoalArtifactView,
  goalArtifactProgress,
  initialsForParticipant,
  orderArtifactsForManifest,
} from './models';

function artifact(
  id: string,
  dependsOnArtifactIds: string[] = [],
  status: GoalArtifactView['status'] = 'draft',
): GoalArtifactView {
  return {
    id,
    title: id,
    kindLabel: 'Brief',
    status,
    dependsOnArtifactIds,
    versionLabel: 'v1',
    updatedAt: '2026-07-26T00:00:00.000Z',
    markdown: '',
    draftRevision: 1,
    canEdit: true,
    alignmentLabel: null,
  };
}

describe('orderArtifactsForManifest', () => {
  it('places dependencies before the artifacts that rely on them', () => {
    const ordered = orderArtifactsForManifest([
      artifact('measurement', ['strategy']),
      artifact('strategy'),
      artifact('creative', ['strategy']),
    ]);

    expect(ordered.map((item) => item.id)).toEqual(['strategy', 'measurement', 'creative']);
  });

  it('keeps every artifact visible when malformed dependencies form a cycle', () => {
    const ordered = orderArtifactsForManifest([
      artifact('strategy', ['creative']),
      artifact('creative', ['strategy']),
    ]);

    expect(new Set(ordered.map((item) => item.id))).toEqual(new Set(['strategy', 'creative']));
    expect(ordered).toHaveLength(2);
  });
});

describe('goalArtifactProgress', () => {
  it('counts accepted and explicitly waived artifacts as resolved', () => {
    expect(
      goalArtifactProgress([
        artifact('one', [], 'accepted'),
        artifact('two', [], 'waived'),
        artifact('three', [], 'in_review'),
      ]),
    ).toEqual({ accepted: 2, total: 3 });
  });
});

describe('initialsForParticipant', () => {
  it('uses first and last words while tolerating blank names', () => {
    expect(initialsForParticipant('Alex Morgan')).toBe('AM');
    expect(initialsForParticipant('Jaina')).toBe('J');
    expect(initialsForParticipant('   ')).toBe('?');
  });
});

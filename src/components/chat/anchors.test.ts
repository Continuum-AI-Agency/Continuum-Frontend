import { describe, expect, it } from 'bun:test';
import {
  anchorLabel,
  isNavigableAnchor,
  nextNavigableAnchorId,
  previousNavigableAnchorId,
  type TranscriptAnchor,
} from './anchors';

const TRANSCRIPT: TranscriptAnchor[] = [
  { id: 'u1', kind: 'user' },
  { id: 'a1', kind: 'assistant' },
  { id: 'm1', kind: 'milestone', label: 'Blueprint ready' },
  { id: 'u2', kind: 'user' },
  { id: 'a2', kind: 'assistant' },
];

describe('isNavigableAnchor', () => {
  it('treats assistant turns and milestones as navigable', () => {
    expect(isNavigableAnchor({ id: 'a', kind: 'assistant' })).toBe(true);
    expect(isNavigableAnchor({ id: 'm', kind: 'milestone' })).toBe(true);
  });

  it('excludes the reader’s own turns', () => {
    expect(isNavigableAnchor({ id: 'u', kind: 'user' })).toBe(false);
  });
});

describe('anchorLabel', () => {
  it('prefers the explicit label', () => {
    expect(anchorLabel({ id: 'm1', kind: 'milestone', label: 'Blueprint ready' })).toBe(
      'Blueprint ready',
    );
  });

  it('falls back to a per-kind default', () => {
    expect(anchorLabel({ id: 'a1', kind: 'assistant' })).toBe('Response');
    expect(anchorLabel({ id: 'u1', kind: 'user' })).toBe('Your message');
    expect(anchorLabel({ id: 'm2', kind: 'milestone' })).toBe('Checkpoint');
  });
});

describe('nextNavigableAnchorId', () => {
  it('skips the reader’s turns to reach the next agent output', () => {
    expect(nextNavigableAnchorId(TRANSCRIPT, 'a1')).toBe('m1');
    expect(nextNavigableAnchorId(TRANSCRIPT, 'm1')).toBe('a2');
  });

  it('skips forward past a user turn', () => {
    expect(nextNavigableAnchorId(TRANSCRIPT, 'u2')).toBe('a2');
  });

  it('returns the first navigable anchor when nothing is current', () => {
    expect(nextNavigableAnchorId(TRANSCRIPT, null)).toBe('a1');
  });

  it('returns null at the last navigable anchor', () => {
    expect(nextNavigableAnchorId(TRANSCRIPT, 'a2')).toBeNull();
  });

  it('returns null when the transcript holds no agent output', () => {
    expect(nextNavigableAnchorId([{ id: 'u1', kind: 'user' }], null)).toBeNull();
  });

  it('returns null for an empty transcript', () => {
    expect(nextNavigableAnchorId([], null)).toBeNull();
  });

  it('starts from the beginning when the current anchor is unknown', () => {
    expect(nextNavigableAnchorId(TRANSCRIPT, 'ghost')).toBe('a1');
  });
});

describe('previousNavigableAnchorId', () => {
  it('walks backwards past the reader’s turns', () => {
    expect(previousNavigableAnchorId(TRANSCRIPT, 'a2')).toBe('m1');
    expect(previousNavigableAnchorId(TRANSCRIPT, 'm1')).toBe('a1');
  });

  it('returns null before the first agent output', () => {
    expect(previousNavigableAnchorId(TRANSCRIPT, 'a1')).toBeNull();
  });

  it('returns the last navigable anchor when nothing is current', () => {
    expect(previousNavigableAnchorId(TRANSCRIPT, null)).toBe('a2');
  });
});

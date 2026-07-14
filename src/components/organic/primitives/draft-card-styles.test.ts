import { describe, expect, it } from 'bun:test';
import {
  DRAFT_STATUS_PRESENTATION,
  draftStatusPresentation,
  statusFrameClasses,
} from './draft-card-styles';
import type { OrganicDraftStatus } from './types';

const ALL_STATUSES: OrganicDraftStatus[] = [
  'draft',
  'scheduled',
  'streaming',
  'failed',
  'placeholder',
  'published',
];

describe('draft status presentation (the single source of truth)', () => {
  it('covers every draft status', () => {
    for (const status of ALL_STATUSES) {
      expect(DRAFT_STATUS_PRESENTATION[status]).toBeDefined();
    }
    expect(Object.keys(DRAFT_STATUS_PRESENTATION).sort()).toEqual([...ALL_STATUSES].sort());
  });

  it('gives every status its own hue — no two statuses can read as the same thing', () => {
    const tones = ALL_STATUSES.map((status) => draftStatusPresentation(status).tone);
    const strips = ALL_STATUSES.map((status) => draftStatusPresentation(status).strip);

    expect(new Set(tones).size).toBe(ALL_STATUSES.length);
    expect(new Set(strips).size).toBe(ALL_STATUSES.length);
  });

  it('separates scheduled from published — the pair that used to be two shades of emerald', () => {
    const scheduled = draftStatusPresentation('scheduled');
    const published = draftStatusPresentation('published');

    expect(scheduled.label).toBe('Scheduled');
    expect(published.label).toBe('Published');
    expect(scheduled.tone).not.toBe(published.tone);
    expect(scheduled.strip).not.toBe(published.strip);
    expect(scheduled.frame).not.toBe(published.frame);
  });

  it('carries a readable label and a plain-language hint for every status', () => {
    for (const status of ALL_STATUSES) {
      const { label, hint } = draftStatusPresentation(status);
      expect(label.length).toBeGreaterThan(0);
      expect(hint.length).toBeGreaterThan(label.length);
    }
  });
});

describe('statusFrameClasses', () => {
  it('derives the chip treatment from the status map, so each status frames differently', () => {
    const draft = statusFrameClasses('instagram', 'draft', 'chip');
    const scheduled = statusFrameClasses('instagram', 'scheduled', 'chip');
    const published = statusFrameClasses('instagram', 'published', 'chip');

    expect(new Set([draft, scheduled, published]).size).toBe(3);
    expect(draft).toContain('border-dashed');
    expect(published).toContain('bg-fuchsia-500');
  });

  it('keeps the platform hue on the frame while the status picks the treatment', () => {
    expect(statusFrameClasses('linkedin', 'scheduled', 'chip')).toContain('sky');
    expect(statusFrameClasses('instagram', 'scheduled', 'chip')).toContain('fuchsia');
  });

  it('lets a run-scoped status own its own hue — a failure is not a channel color', () => {
    const failedOnInstagram = statusFrameClasses('instagram', 'failed', 'chip');
    const failedOnLinkedIn = statusFrameClasses('linkedin', 'failed', 'chip');

    expect(failedOnInstagram).toBe(failedOnLinkedIn);
    expect(failedOnInstagram).toContain('destructive');
    expect(statusFrameClasses('instagram', 'streaming', 'chip')).toContain('warning');
  });

  it('falls back to the row rail treatment for list rows', () => {
    expect(statusFrameClasses('instagram', 'published', 'row')).toContain('border-l-');
    expect(statusFrameClasses('instagram', 'failed', 'row')).toContain('border-l-destructive/70');
  });

  it('treats an unknown platform as the default channel rather than throwing', () => {
    expect(statusFrameClasses('threads', 'draft', 'chip')).toBe(
      statusFrameClasses('instagram', 'draft', 'chip'),
    );
  });
});

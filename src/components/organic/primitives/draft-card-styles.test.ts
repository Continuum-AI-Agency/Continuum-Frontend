import { describe, expect, it } from 'bun:test';
import {
  DRAFT_READINESS_LEGEND_NOTE,
  DRAFT_STATUS_LEGEND_ORDER,
  DRAFT_STATUS_PRESENTATION,
  type DraftStatusPresentation,
  draftStatusLegendEntries,
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
    // Compile-time half of the guard: the table is `satisfies Record<OrganicDraftStatus, …>`
    // in source, so a new member of the union fails the build. This assignment is the same
    // check from the consumer side, and the key-set assertion below is the runtime half —
    // together they make a silently unstyled status impossible.
    const exhaustive: Record<OrganicDraftStatus, DraftStatusPresentation> =
      DRAFT_STATUS_PRESENTATION;

    for (const status of ALL_STATUSES) {
      expect(exhaustive[status]).toBeDefined();
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

// The toolbar legend used to hardcode its own five badges and got four facts wrong. These
// lock the derived API it now reads instead.
describe('legend API', () => {
  it('lists every status, so no status can be omitted from the legend', () => {
    expect([...DRAFT_STATUS_LEGEND_ORDER].sort()).toEqual([...ALL_STATUSES].sort());
  });

  it('includes placeholder — the status the hardcoded legend left out entirely', () => {
    expect(DRAFT_STATUS_LEGEND_ORDER).toContain('placeholder');
  });

  it('carries the exact words the planner pills use', () => {
    const entries = draftStatusLegendEntries();

    expect(entries.map((entry) => entry.label)).toEqual(
      DRAFT_STATUS_LEGEND_ORDER.map((status) => draftStatusPresentation(status).label),
    );
    expect(entries.every((entry) => entry.hint.length > entry.label.length)).toBe(true);
  });

  it('names violet "Seeded" and amber "Generating" — the legend had them swapped', () => {
    const byStatus = new Map(draftStatusLegendEntries().map((entry) => [entry.status, entry]));

    expect(byStatus.get('placeholder')?.label).toBe('Seeded');
    expect(draftStatusPresentation('placeholder').tone).toBe('violet');
    expect(byStatus.get('streaming')?.label).toBe('Generating');
    expect(draftStatusPresentation('streaming').tone).toBe('warning');
  });

  it('says "Needs setup" is readiness rather than listing it as a status', () => {
    expect(DRAFT_STATUS_LEGEND_ORDER).not.toContain('needs_setup' as OrganicDraftStatus);
    expect(DRAFT_READINESS_LEGEND_NOTE).toContain('not a status');
    expect(draftStatusLegendEntries().some((entry) => entry.label === 'Needs setup')).toBe(false);
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

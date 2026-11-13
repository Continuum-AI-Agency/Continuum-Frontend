// The planner -> AI Studio handoff (`?source=organic-planner&draftId=…`). A seed that is
// missing, foreign or unsaved, or a draft deleted since, used to open a silently empty
// canvas whose "Apply back" could never land. It must say the post is gone instead.

import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import type { PlannerAiStudioHandoff } from '@/lib/organic/ai-studio-bridge';
import { PlannerDraftMissingNotice, resolvePlannerHandoff } from './AIStudioClient';

afterEach(() => cleanup());

const seed = (overrides: Partial<PlannerAiStudioHandoff> = {}): PlannerAiStudioHandoff => ({
  schemaVersion: 'planner_ai_handoff_v1',
  draftId: 'fe-1',
  backendDraftId: 'row-1',
  brandProfileId: 'brand-1',
  sourceUpdatedAt: '2026-11-13T10:00:00.000Z',
  weekStartId: '2026-11-09',
  platform: 'instagram',
  postType: 'post',
  format: 'post',
  title: 'Cold wash',
  summary: '',
  captionPreview: '',
  updatedAt: '2026-11-13T10:00:00.000Z',
  ...overrides,
});

const base = { source: 'organic-planner', draftId: 'fe-1', brandProfileId: 'brand-1' };

describe('resolvePlannerHandoff', () => {
  it('is not a handoff without the planner source and a draft id', async () => {
    const readSeed = mock(() => seed());
    expect(await resolvePlannerHandoff({ ...base, source: null, readSeed })).toEqual({
      status: 'none',
    });
    expect(await resolvePlannerHandoff({ ...base, draftId: null, readSeed })).toEqual({
      status: 'none',
    });
    expect(readSeed).not.toHaveBeenCalled();
  });

  it('is missing when no valid seed was handed over', async () => {
    const draftExists = mock(async () => true);
    const handoff = await resolvePlannerHandoff({ ...base, readSeed: () => null, draftExists });
    expect(handoff).toEqual({ status: 'missing' });
    expect(draftExists).not.toHaveBeenCalled();
  });

  it('is missing when the seed names no saved row', async () => {
    const handoff = await resolvePlannerHandoff({
      ...base,
      readSeed: () => seed({ backendDraftId: undefined }),
      draftExists: async () => true,
    });
    expect(handoff).toEqual({ status: 'missing' });
  });

  it('is missing when the planner read says the row is gone', async () => {
    const draftExists = mock(async (_id: string) => false);
    const handoff = await resolvePlannerHandoff({ ...base, readSeed: () => seed(), draftExists });
    expect(draftExists).toHaveBeenCalledWith('row-1');
    expect(handoff).toEqual({ status: 'missing' });
  });

  it('keeps the seed when the row exists, or when existence could not be checked', async () => {
    const ready = await resolvePlannerHandoff({
      ...base,
      readSeed: () => seed(),
      draftExists: async () => true,
    });
    expect(ready).toEqual({ status: 'ready', seed: seed() });
    const unknown = await resolvePlannerHandoff({
      ...base,
      readSeed: () => seed(),
      draftExists: async () => null,
    });
    expect(unknown.status).toBe('ready');
  });
});

describe('PlannerDraftMissingNotice', () => {
  it('says the post is gone and links to the calendar', () => {
    render(<PlannerDraftMissingNotice />);
    expect(screen.getByRole('alert').textContent).toContain("This post isn't saved anymore");
    const link = screen.getByRole('link', { name: 'Open Calendar' });
    expect(link.getAttribute('href')).toBe('/organic?tab=planner');
  });
});

import { describe, expect, it } from 'bun:test';
import type {
  OrganicCalendarDay,
  OrganicCalendarDraft,
} from '@/components/organic/primitives/types';
import { mergeUnsavedLocalDrafts } from './calendar-draft-persistence';

const draft = (over: Partial<OrganicCalendarDraft>): OrganicCalendarDraft =>
  ({ id: 'x', ...over }) as unknown as OrganicCalendarDraft;

const day = (id: string, slots: OrganicCalendarDraft[]): OrganicCalendarDay =>
  ({ id, slots }) as unknown as OrganicCalendarDay;

describe('mergeUnsavedLocalDrafts', () => {
  it("preserves a never-persisted local draft the server hasn't echoed", () => {
    const server = [day('2026-06-18', [draft({ id: 'be-1', backendDraftId: 'be-1' })])];
    const local = [
      day('2026-06-18', [
        draft({ id: 'be-1', backendDraftId: 'be-1' }),
        draft({ id: 'manual-local', backendDraftId: undefined, origin: 'manual' }),
      ]),
    ];
    const merged = mergeUnsavedLocalDrafts(server, local);
    expect(merged[0].slots.map((s) => s.id)).toEqual(['be-1', 'manual-local']);
  });

  it('does NOT resurrect a persisted draft the server dropped (deleted/out-of-range)', () => {
    const server = [day('2026-06-18', [])];
    const local = [day('2026-06-18', [draft({ id: 'gone', backendDraftId: 'be-gone' })])];
    const merged = mergeUnsavedLocalDrafts(server, local);
    expect(merged[0].slots).toEqual([]);
  });

  it('does not duplicate an unsaved local draft once the server echoes its FE id', () => {
    const server = [day('2026-06-18', [draft({ id: 'manual-local', backendDraftId: 'be-new' })])];
    const local = [day('2026-06-18', [draft({ id: 'manual-local', backendDraftId: undefined })])];
    const merged = mergeUnsavedLocalDrafts(server, local);
    expect(merged[0].slots).toHaveLength(1);
  });

  it('drops an optimistic local draft when the server has the same clientKey under a different id', () => {
    // The duplicate-posts bug: an optimistic draft (no backendDraftId, local id) and
    // the server row map to DIFFERENT ids but share the canonical clientKey. Deduping
    // by id alone let the optimistic copy survive and re-insert; clientKey catches it.
    const server = [
      day('2026-06-18', [draft({ id: 'be-row', backendDraftId: 'be-row', clientKey: 'ck-1' })]),
    ];
    const local = [
      day('2026-06-18', [
        draft({ id: 'optimistic-local', backendDraftId: undefined, clientKey: 'ck-1' }),
      ]),
    ];
    const merged = mergeUnsavedLocalDrafts(server, local);
    expect(merged[0].slots.map((s) => s.id)).toEqual(['be-row']);
  });

  it('returns the server set unchanged when there are no unsaved local drafts', () => {
    const server = [day('2026-06-18', [draft({ id: 'be-1', backendDraftId: 'be-1' })])];
    const merged = mergeUnsavedLocalDrafts(server, server);
    expect(merged).toBe(server);
  });

  it('carries over an unsaved local draft on a day absent from the server set', () => {
    // Fetch-all scaffolds only days that have server rows (+ the visible span), so
    // a fresh manual draft on a far day won't be in serverDays yet. It must survive
    // the refetch on its own appended day rather than being wiped.
    const server = [day('2026-06-18', [])];
    const local = [day('2026-06-19', [draft({ id: 'manual-local', backendDraftId: undefined })])];
    const merged = mergeUnsavedLocalDrafts(server, local);
    expect(merged).toHaveLength(2);
    const carried = merged.find((d) => d.id === '2026-06-19');
    expect(carried?.slots.map((s) => s.id)).toEqual(['manual-local']);
  });

  it('does NOT carry over a persisted draft on a day absent from the server set', () => {
    const server = [day('2026-06-18', [])];
    const local = [day('2026-06-19', [draft({ id: 'gone', backendDraftId: 'be-gone' })])];
    const merged = mergeUnsavedLocalDrafts(server, local);
    expect(merged).toHaveLength(1);
    expect(merged[0].slots).toEqual([]);
  });

  it('preserves an applied user_supplied creative on an agent draft over the stale server media', () => {
    // The AI-Studio-apply / manual-attach revert: the server row still carries the
    // OLD agent creative; the local store draft is user_supplied with the NEW one.
    const server = [
      day('2026-06-18', [
        draft({
          id: 'be-1',
          backendDraftId: 'be-1',
          mediaSuggestion: { mediaStatus: 'ready', assetUrl: 'OLD-agent.png' },
          publishingAssets: [
            {
              role: 'primary',
              kind: 'image',
              storagePath: 'p/old.png',
              storageUrl: 'OLD-agent.png',
            },
          ],
        }),
      ]),
    ];
    const local = [
      day('2026-06-18', [
        draft({
          id: 'be-1',
          backendDraftId: 'be-1',
          mediaSuggestion: { mediaStatus: 'user_supplied', assetUrl: 'NEW-applied.png' },
          publishingAssets: [
            {
              role: 'primary',
              kind: 'image',
              storagePath: 'p/new.png',
              storageUrl: 'NEW-applied.png',
            },
          ],
          mediaCount: 1,
        }),
      ]),
    ];
    const slot = mergeUnsavedLocalDrafts(server, local)[0].slots[0];
    expect(slot.mediaSuggestion?.mediaStatus).toBe('user_supplied');
    expect(slot.mediaSuggestion?.assetUrl).toBe('NEW-applied.png');
    expect(slot.publishingAssets?.[0]?.storageUrl).toBe('NEW-applied.png');
  });

  it('does not override server media when the local draft is not user_supplied', () => {
    const server = [
      day('2026-06-18', [
        draft({
          id: 'be-1',
          backendDraftId: 'be-1',
          mediaSuggestion: { mediaStatus: 'ready', assetUrl: 'agent.png' },
        }),
      ]),
    ];
    const local = [
      day('2026-06-18', [
        draft({
          id: 'be-1',
          backendDraftId: 'be-1',
          mediaSuggestion: { mediaStatus: 'ready', assetUrl: 'stale-local.png' },
        }),
      ]),
    ];
    const slot = mergeUnsavedLocalDrafts(server, local)[0].slots[0];
    expect(slot.mediaSuggestion?.assetUrl).toBe('agent.png');
  });
});

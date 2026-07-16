import { describe, expect, it } from 'bun:test';
import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
import { selectDraftRealizedImages, selectDraftStoryboard } from './useDraftStoryboard';

const slot = (over: Partial<OrganicCalendarDraft>): OrganicCalendarDraft =>
  ({ id: 'x', mediaCount: 0, ...over }) as unknown as OrganicCalendarDraft;

describe('selectDraftStoryboard', () => {
  it('returns signed storyboard URLs for a draft matched by backendDraftId, dropping base64', () => {
    const days = [
      {
        slots: [
          slot({
            id: 'fe-1',
            backendDraftId: 'be-1',
            mediaSuggestion: {
              storyboard: [
                {
                  role: 'primary',
                  bucket: 'b',
                  storagePath: 'p1',
                  storageUrl: 'https://signed/a',
                  format: 'post',
                },
                {
                  role: 'slide_2',
                  bucket: 'b',
                  storagePath: 'p2',
                  storageUrl: 'data:image/png;base64,AAAA',
                },
              ],
            },
          }),
        ],
      },
    ];
    expect(selectDraftStoryboard(days, [], 'be-1')).toEqual(['https://signed/a']);
  });

  it('matches by FE id and finds the draft in the backlog', () => {
    const backlog = [
      slot({
        id: 'fe-2',
        mediaSuggestion: {
          storyboard: [
            { role: 'primary', bucket: 'b', storagePath: 'p', storageUrl: 'https://signed/c' },
          ],
        },
      }),
    ];
    expect(selectDraftStoryboard([], backlog, 'fe-2')).toEqual(['https://signed/c']);
  });

  it('returns an empty array for a missing draftId or no match', () => {
    expect(selectDraftStoryboard([], [], null)).toEqual([]);
    expect(selectDraftStoryboard([{ slots: [] }], [], 'missing')).toEqual([]);
  });
});

describe('selectDraftRealizedImages', () => {
  it('returns publishingAssets image URLs once media is ready, dropping video + base64', () => {
    const days = [
      {
        slots: [
          slot({
            id: 'fe-1',
            backendDraftId: 'be-1',
            mediaSuggestion: { mediaStatus: 'ready' },
            publishingAssets: [
              {
                role: 'slide_1',
                kind: 'image',
                storagePath: 'p1',
                storageUrl: 'https://signed/real-1',
              },
              {
                role: 'slide_2',
                kind: 'image',
                storagePath: 'p2',
                storageUrl: 'https://signed/real-2',
              },
              { role: 'clip', kind: 'video', storagePath: 'p3', storageUrl: 'https://signed/vid' },
              {
                role: 'b64',
                kind: 'image',
                storagePath: 'p4',
                storageUrl: 'data:image/png;base64,AAAA',
              },
            ],
          }),
        ],
      },
    ];
    expect(selectDraftRealizedImages(days, [], 'be-1')).toEqual([
      'https://signed/real-1',
      'https://signed/real-2',
    ]);
  });

  it('falls back to the primary assetUrl/signedUrl when publishingAssets are absent', () => {
    const backlog = [
      slot({
        id: 'fe-2',
        mediaSuggestion: { mediaStatus: 'ready', signedUrl: 'https://signed/primary' },
      }),
    ];
    expect(selectDraftRealizedImages([], backlog, 'fe-2')).toEqual(['https://signed/primary']);
  });

  it('returns empty until media is ready, so the card keeps showing the blueprint', () => {
    const days = [
      {
        slots: [
          slot({
            id: 'fe-3',
            mediaSuggestion: {
              mediaStatus: 'pending',
              storyboard: [
                { role: 'primary', bucket: 'b', storagePath: 'p', storageUrl: 'https://signed/bp' },
              ],
            },
            publishingAssets: [
              {
                role: 'slide_1',
                kind: 'image',
                storagePath: 'p1',
                storageUrl: 'https://signed/real',
              },
            ],
          }),
        ],
      },
    ];
    expect(selectDraftRealizedImages(days, [], 'fe-3')).toEqual([]);
  });

  it('returns an empty array for a missing draftId or no match', () => {
    expect(selectDraftRealizedImages([], [], null)).toEqual([]);
    expect(selectDraftRealizedImages([{ slots: [] }], [], 'missing')).toEqual([]);
  });
});

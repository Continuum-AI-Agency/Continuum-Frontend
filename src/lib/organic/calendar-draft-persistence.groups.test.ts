// A multi-platform post is a group of rows, one per platform. These read rows the way the
// planner reads them and check that each platform's frame is its own row: its caption, its
// account, its id for every write — and that a refetch can never drop a platform.
import { describe, expect, it } from 'bun:test';
import {
  deriveSiblingClientKey,
  publishPlanDraftFromRow,
  resolvePublishPlan,
} from '@continuum/contracts';
import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
import {
  buildPersistedDraftPayload,
  collapseDraftGroups,
  mapPersistedRowToCalendarEntry,
  mergeUnsavedLocalDrafts,
  type PersistedOrganicDraftRow,
} from '@/lib/organic/calendar-draft-persistence';
import {
  cardCaption,
  findDraftInDays,
  groupMemberDrafts,
  isGroup,
  resolveFrameDraft,
} from '@/lib/organic/groupDraft';
import { publishPlanDraftFromCalendarDraft } from '@/lib/organic/publishPlan';

const DAY = {
  id: '2026-10-20',
  label: 'Tue',
  dateLabel: 'Oct 20',
  suggestedTimes: ['9:00 AM'],
  slots: [],
};
const IMAGE = {
  role: 'primary',
  kind: 'image',
  slideIndex: 0,
  storagePath: 'b/p.png',
  storageUrl: 'https://cdn.example/p.png',
};

function row(
  id: string,
  platform: string,
  clientKey: string,
  caption: string,
  overrides: Partial<PersistedOrganicDraftRow> = {},
): PersistedOrganicDraftRow {
  return {
    id,
    platform,
    platform_account_id: `acct-${platform}`,
    client_key: clientKey,
    group_id: 'group-1',
    status: 'draft',
    scheduled_date: '2026-10-20T16:00:00.000Z',
    updated_at: `T-${id}`,
    slot_data: {
      placementId: clientKey,
      dayId: DAY.id,
      platform: { name: platform },
      draftSnapshot: { id: clientKey, platforms: [platform], format: 'Post' },
    },
    content_json: { copy: { caption }, publishingAssets: [IMAGE], content: { format: 'Post' } },
    ...overrides,
  };
}

const cardOf = (rows: PersistedOrganicDraftRow[]): OrganicCalendarDraft => {
  const cards = collapseDraftGroups(
    rows.map((r) => mapPersistedRowToCalendarEntry(r, [DAY])).filter((entry) => entry !== null),
  );
  expect(cards).toHaveLength(1);
  return cards[0].draft;
};

const igRow = () => row('be-ig', 'instagram', 'draft-abc', 'IG caption the user typed');
const ttRow = () =>
  row('be-tt', 'tiktok', deriveSiblingClientKey('draft-abc', 'tiktok'), 'TikTok caption');

const planCaption = (draft: OrganicCalendarDraft, platform: 'instagram' | 'tiktok') =>
  resolvePublishPlan({
    draft: publishPlanDraftFromCalendarDraft(draft),
    platform,
    account: { boundAccountId: draft.targetAccountId ?? null, accounts: null },
    publishOptions: null,
    mediaGenerated: null,
  }).caption.text;

describe('a group: each frame is its own row', () => {
  it('(a) the TikTok frame previews the TikTok row, the caption the TikTok row publishes', () => {
    const card = cardOf([ttRow(), igRow()]);
    expect(card.platforms).toEqual(['instagram', 'tiktok']);
    expect(card.backendDraftId).toBe('be-ig');

    const frame = resolveFrameDraft(card, 'tiktok');
    expect(frame.backendDraftId).toBe('be-tt');
    expect(frame.targetAccountId).toBe('acct-tiktok');
    const published = resolvePublishPlan({
      draft: publishPlanDraftFromRow(ttRow()),
      platform: 'tiktok',
      account: { boundAccountId: 'acct-tiktok', accounts: null },
      publishOptions: null,
      mediaGenerated: null,
    }).caption.text;
    expect(planCaption(frame, 'tiktok')).toBe('TikTok caption');
    expect(planCaption(frame, 'tiktok')).toBe(published);
    // The card's own platform is the card itself.
    expect(resolveFrameDraft(card, 'instagram')).toBe(card);
    // A member frame is found by its own id, as Studio and stitch look drafts up.
    const days = [{ id: '2030-01-01', label: '', dateLabel: '', slots: [card] }] as never;
    expect(findDraftInDays(days, frame.id)).toBe(frame);
    expect(findDraftInDays(days, card.id)).toBe(card);
  });

  it('every member carries its own row id, account and draft; the card row carries none', () => {
    const card = cardOf([igRow(), ttRow()]);
    expect(card.groupMembers).toEqual([
      expect.objectContaining({
        backendDraftId: 'be-ig',
        platform: 'instagram',
        accountId: 'acct-instagram',
      }),
      expect.objectContaining({
        backendDraftId: 'be-tt',
        platform: 'tiktok',
        accountId: 'acct-tiktok',
      }),
    ]);
    expect(card.groupMembers?.[0]?.draft).toBeUndefined();
    const ttDraft = card.groupMembers?.[1]?.draft;
    expect(ttDraft?.id).not.toBe(card.id);
    expect(ttDraft?.captionPreview).toBe('TikTok caption');
    expect(groupMemberDrafts(card).map((draft) => draft.backendDraftId)).toEqual([
      'be-ig',
      'be-tt',
    ]);
    expect(isGroup(card)).toBe(true);
  });

  it('(c) a refetch after a tick keeps both platforms, because both are rows', () => {
    // The tick created the TikTok row on the server; the local card is still the pre-tick one.
    const localCard = cardOf([{ ...igRow(), group_id: null }]);
    expect(localCard.platforms).toEqual(['instagram']);
    const server = cardOf([igRow(), ttRow()]);
    const merged = mergeUnsavedLocalDrafts(
      [{ ...DAY, slots: [server] }],
      [{ ...DAY, slots: [localCard] }],
    );
    const after = merged.flatMap((day) => day.slots);
    expect(after).toHaveLength(1);
    expect(after[0]?.platforms).toEqual(['instagram', 'tiktok']);
    expect(resolveFrameDraft(after[0] as OrganicCalendarDraft, 'tiktok').backendDraftId).toBe(
      'be-tt',
    );
  });

  it('orders the members by the contracts platform order, x included', () => {
    const card = cardOf([
      row('be-x', 'x', 'draft-abc::x', 'x'),
      row('be-li', 'linkedin', 'draft-abc::linkedin', 'li'),
      igRow(),
      row('be-fb', 'facebook', 'draft-abc::facebook', 'fb'),
    ]);
    expect(card.platforms).toEqual(['instagram', 'facebook', 'linkedin', 'x']);
  });

  it('keeps a user-supplied creative on a member across a refetch', () => {
    const local = cardOf([igRow(), ttRow()]);
    const ttLocal = local.groupMembers?.[1]?.draft as OrganicCalendarDraft;
    const applied: OrganicCalendarDraft = {
      ...local,
      groupMembers: local.groupMembers?.map((member) =>
        member.draft
          ? {
              ...member,
              draft: {
                ...ttLocal,
                mediaSuggestion: { mediaStatus: 'user_supplied', url: 'https://cdn/own.mp4' },
                mediaCount: 1,
              },
            }
          : member,
      ),
    };
    const merged = mergeUnsavedLocalDrafts(
      [{ ...DAY, slots: [cardOf([igRow(), ttRow()])] }],
      [{ ...DAY, slots: [applied] }],
    );
    const card = merged[0]?.slots[0] as OrganicCalendarDraft;
    expect(resolveFrameDraft(card, 'tiktok').mediaSuggestion?.url).toBe('https://cdn/own.mp4');
  });
});

describe('the row is the only source of platform and account (C2, A11)', () => {
  it('reads the platform from the platform column, never from a browser-written snapshot list', () => {
    const mapped = mapPersistedRowToCalendarEntry(
      row('be-1', 'linkedin', 'k', 'c', {
        group_id: null,
        slot_data: {
          dayId: DAY.id,
          platform: { name: 'instagram' },
          draftSnapshot: { platforms: ['instagram', 'tiktok'] },
        },
      }),
      [DAY],
    );
    expect(mapped?.draft.platforms).toEqual(['linkedin']);
  });

  it('falls back to slot_data.platform for a row without a platform column', () => {
    const mapped = mapPersistedRowToCalendarEntry(
      row('be-1', 'x', 'k', 'c', {
        platform: undefined,
        group_id: null,
        slot_data: { dayId: DAY.id, platform: { name: 'facebook' } },
      }),
      [DAY],
    );
    expect(mapped?.draft.platforms).toEqual(['facebook']);
  });

  it('reads the stamp only from platform_account_id', () => {
    const mapped = mapPersistedRowToCalendarEntry(
      row('be-1', 'instagram', 'k', 'c', {
        group_id: null,
        platform_account_id: 'acct-column',
        slot_data: {
          dayId: DAY.id,
          platform: { name: 'instagram', accountId: 'acct-slot' },
          draftSnapshot: { targetAccountId: 'acct-snapshot' },
        },
      }),
      [DAY],
    );
    expect(mapped?.draft.targetAccountId).toBe('acct-column');
    expect(mapped?.draft.groupMembers?.[0]?.accountId).toBe('acct-column');
  });

  it("treats 'unassigned' and null as no account", () => {
    for (const stamp of ['unassigned', null]) {
      const mapped = mapPersistedRowToCalendarEntry(
        row('be-1', 'instagram', 'k', 'c', {
          group_id: null,
          platform_account_id: stamp,
          slot_data: { dayId: DAY.id, draftSnapshot: { targetAccountId: 'acct-snapshot' } },
        }),
        [DAY],
      );
      expect(mapped?.draft.targetAccountId).toBeUndefined();
      expect(mapped?.draft.groupMembers?.[0]?.accountId).toBeNull();
    }
  });

  it('writes no platform list and no account into the snapshot', () => {
    const payload = buildPersistedDraftPayload({
      brandId: 'brand-1',
      weekStartId: '2026-10-19',
      dayId: DAY.id,
      draft: {
        ...cardOf([igRow(), ttRow()]),
        backendDraftId: undefined,
        targetAccountId: 'acct-ig',
      },
    });
    const snapshot = payload.slot_data.draftSnapshot as Record<string, unknown>;
    expect(snapshot.platforms).toBeUndefined();
    expect(snapshot.targetAccountId).toBeUndefined();
    expect(snapshot.groupMembers).toBeUndefined();
    expect(payload.platform).toBe('instagram');
    expect(payload.platform_account_id).toBe('acct-ig');
  });
});

describe('cardCaption', () => {
  it('is the caption the frame sends: its own body plus its hashtags', () => {
    const tt = ttRow();
    const card = cardOf([
      igRow(),
      {
        ...tt,
        content_json: {
          ...(tt.content_json as object),
          copy: { caption: 'TikTok caption', hashtags: { high: ['fyp'], medium: [], low: [] } },
        },
      },
    ]);
    expect(cardCaption(card, 'tiktok')).toBe('TikTok caption\n\n#fyp');
    expect(cardCaption(card, 'instagram')).toBe('IG caption the user typed');
    expect(cardCaption(card, 'tiktok')).toBe(
      planCaption(resolveFrameDraft(card, 'tiktok'), 'tiktok'),
    );
  });
});

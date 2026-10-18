import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, renderHook } from '@testing-library/react';
import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
import { ApiError } from '@/lib/api/errors';
import { createCalendarStoreStub } from '@/lib/organic/testing/calendarStoreStub';

const showMock = mock((_toast: { title: string; description?: string }) => {});
const requestCalendarRefetchMock = mock(() => {});
const updateDraftMock = mock(
  (_id: string, _updater: (draft: OrganicCalendarDraft) => OrganicCalendarDraft) => {},
);

type Call = { path: string; method?: string; body?: Record<string, unknown> };
const calls: Call[] = [];
let answer: (call: Call) => unknown = () => ({});
const requestMock = mock(async (call: Call) => {
  calls.push(call);
  return answer(call);
});

mock.module('@/lib/api/http', () => ({ request: requestMock, http: { request: requestMock } }));
mock.module('@/components/ui/ToastProvider', () => ({ useToast: () => ({ show: showMock }) }));
mock.module('@/lib/organic/store', () =>
  createCalendarStoreStub({
    requestCalendarRefetch: requestCalendarRefetchMock,
    updateDraft: updateDraftMock,
  }),
);

afterAll(() => mock.restore());

const { useDraftMembership, withServerMembers, withGroupAfterRemoval } = await import(
  './useFanOutDraft'
);
const { resolveFrameDraft } = await import('@/lib/organic/groupDraft');

const GROUP_ID = '3f1c9a2e-6b5d-4a71-9c2f-8d0e1a2b3c4d';

function card(overrides: Partial<OrganicCalendarDraft> = {}): OrganicCalendarDraft {
  return {
    id: 'placement-1',
    title: 'Post',
    summary: '',
    timeLabel: '9:00 AM',
    dateLabel: '',
    status: 'draft',
    platforms: ['facebook'],
    format: 'Post',
    objective: 'Draft',
    captionPreview: 'Shared copy',
    tags: [],
    mediaCount: 1,
    backendDraftId: 'row-fb',
    updatedAt: 'T0',
    groupMembers: [
      { backendDraftId: 'row-fb', platform: 'facebook', status: 'draft', accountId: 'acct-fb' },
    ],
    ...overrides,
  };
}

const fanOutResponse = (platforms: string[]) => ({
  sourceId: 'row-fb',
  sourcePlatform: 'facebook',
  groupId: GROUP_ID,
  members: platforms.map((platform) => ({
    id: `row-${platform}`,
    platform,
    clientKey: platform === 'facebook' ? 'post-abc' : `post-abc::${platform}`,
    platformAccountId: `acct-${platform}`,
    status: 'draft',
    isSource: platform === 'facebook',
    created: platform !== 'facebook',
  })),
  removed: [],
  retained: [],
});

const fanOutBodies = () =>
  calls.filter((call) => call.path.endsWith('/fan-out')).map((call) => call.body?.platforms);

async function run(draft: OrganicCalendarDraft, platforms: string[]): Promise<boolean> {
  const { result } = renderHook(() => useDraftMembership());
  let outcome = false;
  await act(async () => {
    outcome = await result.current.setPlatforms(draft, platforms);
  });
  return outcome;
}

describe('useDraftMembership', () => {
  beforeEach(() => {
    calls.length = 0;
    showMock.mockClear();
    requestCalendarRefetchMock.mockClear();
    updateDraftMock.mockClear();
    answer = (call) =>
      call.path.endsWith('/fan-out')
        ? fanOutResponse(call.body?.platforms as string[])
        : { updated_at: 'T1' };
  });

  it('(d) a tick sends the FULL set, in the contracts order, to the card row, then refetches', async () => {
    expect(await run(card(), ['tiktok', 'facebook'])).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.path).toBe('/api/organic/calendar/drafts/row-fb/fan-out');
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.body).toEqual({ platforms: ['facebook', 'tiktok'] });
    expect(requestCalendarRefetchMock).toHaveBeenCalledTimes(1);
  });

  it("(race) a new platform's frame edits the NEW row at once, before any refetch", () => {
    const shown = withServerMembers(card(), fanOutResponse(['facebook', 'tiktok']) as never);
    expect(shown.platforms).toEqual(['facebook', 'tiktok']);
    expect(shown.groupId).toBe(GROUP_ID);
    const tiktok = resolveFrameDraft(shown, 'tiktok');
    expect(tiktok.backendDraftId).toBe('row-tiktok');
    // The id the refetch maps the row to (its client key), so an editor keyed on it survives.
    expect(tiktok.id).toBe(fanOutResponse(['facebook', 'tiktok']).members[1]?.clientKey);
    expect(tiktok.id).not.toBe(shown.id);
    expect(tiktok.targetAccountId).toBe('acct-tiktok');
    expect(tiktok.captionPreview).toBe('Shared copy');
    // The card's own row keeps being the card.
    expect(resolveFrameDraft(shown, 'facebook')).toBe(shown);
  });

  it('keeps a known member its own draft when the server answers', () => {
    const own = card({ id: 'placement-1::linkedin', captionPreview: 'LinkedIn words' });
    const grouped = card({
      groupMembers: [
        { backendDraftId: 'row-fb', platform: 'facebook', status: 'draft', accountId: 'acct-fb' },
        {
          backendDraftId: 'row-linkedin',
          platform: 'linkedin',
          status: 'draft',
          accountId: null,
          draft: own,
        },
      ],
    });
    const shown = withServerMembers(grouped, fanOutResponse(['facebook', 'linkedin']) as never);
    expect(resolveFrameDraft(shown, 'linkedin').captionPreview).toBe('LinkedIn words');
  });

  // The post as the server holds it after group/remove: `remaining` rows, `sourceId` the source.
  const groupAnswer = (
    remaining: { id: string; platform: string; caption: string; accountId: string }[],
    sourceId: string,
  ) => ({
    groupId: GROUP_ID,
    sourceId,
    format: 'POST',
    status: 'draft',
    verdicts: [],
    members: remaining.map((member) => ({
      ...member,
      status: 'draft',
      account: null,
      scheduledDate: null,
      updatedAt: `T-${member.id}`,
      platformPostId: null,
      isSource: member.id === sourceId,
    })),
  });

  const threePlatforms = () =>
    card({
      platforms: ['facebook', 'linkedin', 'tiktok'],
      groupId: GROUP_ID,
      clientKey: 'post-abc',
      groupMembers: [
        { backendDraftId: 'row-fb', platform: 'facebook', status: 'draft', accountId: 'acct-fb' },
        {
          backendDraftId: 'row-linkedin',
          platform: 'linkedin',
          status: 'draft',
          clientKey: 'post-abc::linkedin',
          accountId: 'acct-li',
          draft: card({
            id: 'post-abc::linkedin',
            backendDraftId: 'row-linkedin',
            clientKey: 'post-abc::linkedin',
            platforms: ['linkedin'],
            captionPreview: 'LinkedIn words',
            targetAccountId: 'acct-li',
            groupMembers: undefined,
          }),
        },
        {
          backendDraftId: 'row-tiktok',
          platform: 'tiktok',
          status: 'draft',
          accountId: 'acct-tt',
          draft: card({
            id: 'post-abc::tiktok',
            backendDraftId: 'row-tiktok',
            platforms: ['tiktok'],
            captionPreview: 'TikTok words',
            groupMembers: undefined,
          }),
        },
      ],
    });

  it("unticking the card's own platform in a group of 3 is ONE group/remove; the promoted row becomes the card", async () => {
    answer = (call) =>
      call.path.endsWith('/group/remove')
        ? groupAnswer(
            [
              {
                id: 'row-linkedin',
                platform: 'linkedin',
                caption: 'LinkedIn words',
                accountId: 'acct-li',
              },
              {
                id: 'row-tiktok',
                platform: 'tiktok',
                caption: 'TikTok words',
                accountId: 'acct-tt',
              },
            ],
            'row-linkedin',
          )
        : {};
    const grouped = threePlatforms();
    expect(await run(grouped, ['linkedin', 'tiktok'])).toBe(true);
    expect(calls.map((call) => [call.path, call.method])).toEqual([
      ['/api/organic/calendar/drafts/row-fb/group/remove', 'POST'],
    ]);
    const [id, update] = updateDraftMock.mock.calls.at(-1) as [
      string,
      (draft: OrganicCalendarDraft) => OrganicCalendarDraft,
    ];
    expect(id).toBe('placement-1');
    const shown = update(grouped);
    // The card is now the LinkedIn row, with its own words and account, under the card's id/key.
    expect(shown).toMatchObject({
      id: 'placement-1',
      clientKey: 'post-abc',
      backendDraftId: 'row-linkedin',
      platforms: ['linkedin', 'tiktok'],
      captionPreview: 'LinkedIn words',
      targetAccountId: 'acct-li',
    });
    expect(resolveFrameDraft(shown, 'tiktok').backendDraftId).toBe('row-tiktok');
    expect(resolveFrameDraft(shown, 'linkedin')).toBe(shown);
    expect(requestCalendarRefetchMock).toHaveBeenCalledTimes(1);
  });

  it('unticking a member removes only its row, through group/remove', async () => {
    answer = () =>
      groupAnswer(
        [
          { id: 'row-fb', platform: 'facebook', caption: 'Shared copy', accountId: 'acct-fb' },
          {
            id: 'row-linkedin',
            platform: 'linkedin',
            caption: 'LinkedIn words',
            accountId: 'acct-li',
          },
        ],
        'row-fb',
      );
    const grouped = threePlatforms();
    expect(await run(grouped, ['facebook', 'linkedin'])).toBe(true);
    expect(calls.map((call) => call.path)).toEqual([
      '/api/organic/calendar/drafts/row-tiktok/group/remove',
    ]);
    const update = updateDraftMock.mock.calls.at(-1)?.[1] as (
      draft: OrganicCalendarDraft,
    ) => OrganicCalendarDraft;
    expect(update(grouped)).toMatchObject({
      backendDraftId: 'row-fb',
      platforms: ['facebook', 'linkedin'],
    });
  });

  it('a refused removal says why in plain words, and changes nothing', async () => {
    answer = () => {
      throw new ApiError('The TikTok post is scheduled', 409, undefined, {
        error: 'member_scheduled',
        message: 'The TikTok post is scheduled: unschedule it before removing it.',
      });
    };
    expect(await run(threePlatforms(), ['facebook', 'linkedin'])).toBe(false);
    expect(showMock.mock.calls[0]?.[0]).toMatchObject({
      title: 'Platform not removed',
      description: 'TikTok is scheduled. Move it back to draft before removing it.',
    });
    expect(updateDraftMock).not.toHaveBeenCalled();
  });

  it('the card keeps a row id after its own row is removed, so the autosave can never re-insert it', () => {
    const shown = withGroupAfterRemoval(
      threePlatforms(),
      groupAnswer(
        [
          {
            id: 'row-linkedin',
            platform: 'linkedin',
            caption: 'LinkedIn words',
            accountId: 'acct-li',
          },
        ],
        'row-linkedin',
      ) as never,
    );
    expect(shown.backendDraftId).toBe('row-linkedin');
    expect(shown.clientKey).toBe('post-abc');
    expect(shown.platforms).toEqual(['linkedin']);
  });

  it("surfaces the server's reason when it refuses, and writes nothing else", async () => {
    answer = () => {
      throw new ApiError('Connect TikTok to post here', 422, undefined, {
        error: 'not_connected',
        message: 'Connect TikTok to post here',
      });
    };
    expect(await run(card(), ['facebook', 'tiktok'])).toBe(false);
    expect(showMock.mock.calls[0]?.[0]).toMatchObject({
      title: 'Platforms not changed',
      description: 'Connect TikTok to post here',
    });
    expect(calls.some((call) => call.path.endsWith('/fields'))).toBe(false);
  });

  it('keeps a lone platform: an empty set sends nothing', async () => {
    expect(await run(card(), [])).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('does nothing for a draft with no row yet', async () => {
    expect(
      await run(card({ backendDraftId: undefined, groupMembers: undefined }), ['facebook', 'x']),
    ).toBe(false);
    expect(calls).toHaveLength(0);
    expect(showMock.mock.calls[0]?.[0].title).toBe('Not saved yet');
  });
});

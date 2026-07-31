import { describe, expect, it } from 'bun:test';

import { buildWeekDays } from '@/components/organic/primitives/calendar-utils';
import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
import {
  buildPersistedDraftPayload,
  collapseDraftGroups,
  isDayIdInWeekRange,
  mapPersistedRowToCalendarEntry,
  normalizePersistedStatus,
  type PersistedOrganicDraftRow,
} from './calendar-draft-persistence';

function makeDraft(partial: Partial<OrganicCalendarDraft> = {}): OrganicCalendarDraft {
  return {
    id: 'draft-1',
    title: 'Draft title',
    summary: 'Summary',
    timeLabel: '9:00 AM',
    dateLabel: 'Mon, Apr 20',
    status: 'draft',
    platforms: ['instagram'],
    format: 'Post',
    objective: 'Draft',
    captionPreview: 'Caption',
    tags: [],
    mediaCount: 1,
    ...partial,
  };
}

describe('calendar draft persistence utils', () => {
  it('normalizes persisted statuses safely', () => {
    expect(normalizePersistedStatus('scheduled')).toBe('scheduled');
    expect(normalizePersistedStatus('published')).toBe('published');
    expect(normalizePersistedStatus('streaming')).toBe('draft');
    expect(normalizePersistedStatus(null)).toBe('draft');
  });

  it('preserves the placeholder status for text-checkpoint drafts', () => {
    // A Phase-1 checkpoint row lands as `placeholder` and may stay that way if the
    // terminal merge never promotes it; it must round-trip (not collapse to draft)
    // so the planned post renders on the grid.
    expect(normalizePersistedStatus('placeholder')).toBe('placeholder');

    const days = buildWeekDays(new Date('2026-04-20T12:00:00'));
    const row: PersistedOrganicDraftRow = {
      id: 'checkpoint-1',
      status: 'placeholder',
      scheduled_date: '2026-04-21',
      platform_account_id: 'acct-1',
      slot_data: {
        dayId: '2026-04-21',
        timeLabel: '9:00 AM',
        draftSnapshot: makeDraft({ id: 'local-cp', status: 'placeholder' }),
      },
    };

    const mapped = mapPersistedRowToCalendarEntry(row, days);
    expect(mapped).not.toBeNull();
    expect(mapped?.draft.status).toBe('placeholder');
  });

  it('builds persistence payload and normalizes transient status', () => {
    const payload = buildPersistedDraftPayload({
      brandId: '11111111-1111-4111-8111-111111111111',
      weekStartId: '2026-04-20',
      dayId: '2026-04-21',
      draft: makeDraft({ status: 'streaming', timeLabel: '1:00 PM' }),
      platformAccountIds: { instagram: 'acct-123' },
    });

    expect(payload.status).toBe('draft');
    expect(payload.platform).toBe('instagram');
    expect(payload.platform_account_id).toBe('acct-123');
    expect(payload.slot_data.dayId).toBe('2026-04-21');
    expect(payload.slot_data.weekStart).toBe('2026-04-20');
    expect(payload.slot_data.timeLabel).toBe('1:00 PM');
  });

  // scheduled_date is a full timestamptz written verbatim. Writing a bare day let
  // Postgres coerce it to midnight, which discarded the user's chosen time on every
  // autosave tick and made the panel render the draft back as "12:00 AM".
  it('writes an instant carrying the chip time, never a bare calendar day', () => {
    const payload = buildPersistedDraftPayload({
      brandId: '11111111-1111-4111-8111-111111111111',
      weekStartId: '2026-04-20',
      dayId: '2026-04-21',
      draft: makeDraft({ status: 'draft', timeLabel: '1:00 PM' }),
      timeZone: 'UTC',
    });

    expect(payload.scheduled_date).toBe('2026-04-21T13:00:00.000Z');
    expect(payload.slot_data.timeOfDay).toBe('13:00');
    expect(payload.slot_data.timeZone).toBe('UTC');
  });

  it('resolves the chip time in the requested zone, not as UTC wall clock', () => {
    const payload = buildPersistedDraftPayload({
      brandId: '11111111-1111-4111-8111-111111111111',
      weekStartId: '2026-04-20',
      dayId: '2026-04-21',
      draft: makeDraft({ status: 'draft', timeLabel: '9:00 AM' }),
      timeZone: 'America/New_York',
    });

    // 09:00 EDT is 13:00Z. A UTC reading would have produced 09:00Z.
    expect(payload.scheduled_date).toBe('2026-04-21T13:00:00.000Z');
  });

  it('does NOT floor a past-dated draft forward — that would relocate backfilled work', () => {
    const payload = buildPersistedDraftPayload({
      brandId: '11111111-1111-4111-8111-111111111111',
      weekStartId: '2020-01-06',
      dayId: '2020-01-07',
      draft: makeDraft({ status: 'draft', timeLabel: '9:00 AM' }),
      timeZone: 'UTC',
    });

    expect(payload.scheduled_date).toBe('2020-01-07T09:00:00.000Z');
  });

  it('DOES floor a past-dated scheduled draft, so the publish poller cannot fire on arrival', () => {
    const payload = buildPersistedDraftPayload({
      brandId: '11111111-1111-4111-8111-111111111111',
      weekStartId: '2020-01-06',
      dayId: '2020-01-07',
      draft: makeDraft({ status: 'scheduled', timeLabel: '9:00 AM' }),
      timeZone: 'UTC',
    });

    expect(Date.parse(payload.scheduled_date)).toBeGreaterThan(Date.now());
  });

  it('maps persisted rows back into calendar entries', () => {
    const days = buildWeekDays(new Date('2026-04-20T12:00:00'));
    const row: PersistedOrganicDraftRow = {
      id: 'backend-1',
      status: 'scheduled',
      scheduled_date: '2026-04-21',
      platform_account_id: 'acct-99',
      instagram_post_id: 'ig-post-1',
      slot_data: {
        dayId: '2026-04-21',
        timeLabel: '5:00 PM',
        draftSnapshot: {
          id: 'local-123',
          title: 'Saved title',
          summary: 'Saved summary',
          status: 'scheduled',
          platforms: ['instagram'],
          format: 'Carousel',
          objective: 'Awareness',
          captionPreview: 'Saved caption',
          tags: ['launch'],
          mediaCount: 2,
        },
      },
    };

    const mapped = mapPersistedRowToCalendarEntry(row, days);
    expect(mapped).not.toBeNull();
    expect(mapped?.dayId).toBe('2026-04-21');
    expect(mapped?.draft.id).toBe('local-123');
    expect(mapped?.draft.backendDraftId).toBe('backend-1');
    expect(mapped?.draft.status).toBe('scheduled');
    expect(mapped?.draft.timeLabel).toBe('5:00 PM');
    expect(mapped?.draft.mediaCount).toBe(2);
  });

  it('tags pre-minted agent/mcp rows as agent-origin (server-owned) from slot_data.origin', () => {
    const days = buildWeekDays(new Date('2026-04-20T12:00:00'));
    const agentRow: PersistedOrganicDraftRow = {
      id: 'agent-1',
      status: 'placeholder',
      scheduled_date: '2026-04-21',
      platform_account_id: 'acct-1',
      slot_data: { dayId: '2026-04-21', platform: 'instagram', origin: 'agent' },
    };
    expect(mapPersistedRowToCalendarEntry(agentRow, days)?.draft.origin).toBe('agent');

    const mcpRow: PersistedOrganicDraftRow = {
      ...agentRow,
      id: 'mcp-1',
      slot_data: { dayId: '2026-04-21', origin: 'mcp' },
    };
    expect(mapPersistedRowToCalendarEntry(mcpRow, days)?.draft.origin).toBe('agent');

    const manualRow: PersistedOrganicDraftRow = {
      ...agentRow,
      id: 'manual-1',
      slot_data: {
        dayId: '2026-04-21',
        draftSnapshot: { id: 'l', status: 'draft', origin: 'manual' },
      },
    };
    expect(mapPersistedRowToCalendarEntry(manualRow, days)?.draft.origin).toBe('manual');
  });

  it('maps the authoritative media_stage column onto the draft', () => {
    const days = buildWeekDays(new Date('2026-04-20T12:00:00'));
    const row: PersistedOrganicDraftRow = {
      id: 'stage-1',
      status: 'draft',
      scheduled_date: '2026-04-21',
      platform_account_id: 'acct-1',
      media_stage: 'storyboard_ready',
      slot_data: { dayId: '2026-04-21' },
    };
    expect(mapPersistedRowToCalendarEntry(row, days)?.draft.mediaStage).toBe('storyboard_ready');
  });

  it('derives a media_stage fallback from content_json when the column is null (legacy rows)', () => {
    const days = buildWeekDays(new Date('2026-04-20T12:00:00'));
    const realizedRow: PersistedOrganicDraftRow = {
      id: 'legacy-realized',
      status: 'draft',
      scheduled_date: '2026-04-21',
      platform_account_id: 'acct-1',
      media_stage: null,
      slot_data: { dayId: '2026-04-21' },
      content_json: {
        schedule: { dayId: '2026-04-21' },
        publishingAssets: [{ storagePath: 'p/1.jpg' }],
      },
    };
    expect(mapPersistedRowToCalendarEntry(realizedRow, days)?.draft.mediaStage).toBe('realized');

    const textOnlyRow: PersistedOrganicDraftRow = {
      ...realizedRow,
      id: 'legacy-text',
      content_json: { schedule: { dayId: '2026-04-21' } },
    };
    expect(mapPersistedRowToCalendarEntry(textOnlyRow, days)?.draft.mediaStage).toBe('text_only');
  });

  it('checks day id range within a week', () => {
    expect(isDayIdInWeekRange('2026-04-20', '2026-04-20')).toBe(true);
    expect(isDayIdInWeekRange('2026-04-26', '2026-04-20')).toBe(true);
    expect(isDayIdInWeekRange('2026-04-27', '2026-04-20')).toBe(false);
    expect(isDayIdInWeekRange('invalid', '2026-04-20')).toBe(false);
  });

  it('writes the canonical client_key (clientKey, else the local id) into the payload', () => {
    const withKey = buildPersistedDraftPayload({
      brandId: 'b',
      weekStartId: '2026-04-20',
      dayId: '2026-04-21',
      draft: makeDraft({ id: 'draft-x', clientKey: 'ck-stable' }),
    });
    expect(withKey.client_key).toBe('ck-stable');

    const noKey = buildPersistedDraftPayload({
      brandId: 'b',
      weekStartId: '2026-04-20',
      dayId: '2026-04-21',
      draft: makeDraft({ id: 'draft-x' }),
    });
    expect(noKey.client_key).toBe('draft-x');
  });

  it('stamps clientKey from the client_key column (fallback: the mapped local id)', () => {
    const days = buildWeekDays(new Date('2026-04-20T12:00:00'));
    const row: PersistedOrganicDraftRow = {
      id: 'be-1',
      status: 'draft',
      scheduled_date: '2026-04-21',
      platform_account_id: 'a',
      client_key: 'ck-123',
      slot_data: { dayId: '2026-04-21' },
    };
    expect(mapPersistedRowToCalendarEntry(row, days)?.draft.clientKey).toBe('ck-123');

    const noKeyRow: PersistedOrganicDraftRow = { ...row, client_key: null };
    // No column + no placementId -> mapSlotDataDraftId falls back to rowId, so the
    // clientKey converges on the row id (still stable for that row).
    expect(mapPersistedRowToCalendarEntry(noKeyRow, days)?.draft.clientKey).toBe('be-1');
  });
});

describe('mapPersistedRowToCalendarEntry — generated drafts (content_json shape)', () => {
  const days = buildWeekDays(new Date('2026-06-01T12:00:00'));

  const generatedRow = (): PersistedOrganicDraftRow => ({
    id: 'row-1',
    status: 'draft',
    scheduled_date: '2026-06-01 11:00:00+00',
    platform_account_id: 'acct-1',
    content_plan_id: '11111111-1111-1111-1111-111111111111',
    slot_data: {
      slotId: 'spec-1',
      schedule: { dayId: '2026-06-01', timeOfDay: 'morning', postIndex: 0 },
      platform: { name: 'instagram', accountId: 'acct-1' },
      strategy: { objective: 'save' },
      contentPlan: { titleTopic: 'Glass skin', type: 'Reel', format: 'carousel' },
    },
    content_json: {
      placementId: 'spec-1',
      schedule: { dayId: '2026-06-01', scheduledAt: '2026-06-01T11:00:00.000Z' },
      platform: { name: 'instagram', accountId: 'acct-1' },
      content: { titleTopic: 'Glass skin routine', format: 'carousel', objective: 'save' },
      copy: { caption: 'Your 3-step glass skin routine' },
      creative: { mediaSuggestion: { assetUrl: 'https://signed/img.png', kind: 'carousel' } },
    },
  });

  it('places a generated draft on the grid and reads content from content_json', () => {
    const entry = mapPersistedRowToCalendarEntry(generatedRow(), days);
    expect(entry).not.toBeNull();
    expect(entry?.dayId).toBe('2026-06-01');
    expect(entry?.draft.title).toBe('Glass skin routine');
    expect(entry?.draft.captionPreview).toBe('Your 3-step glass skin routine');
    expect(entry?.draft.format).toBe('carousel');
    expect(entry?.draft.platforms).toEqual(['instagram']);
    expect(entry?.draft.timeLabel).toBe('11:00 AM');
    expect(entry?.draft.contentPlanId).toBe('11111111-1111-1111-1111-111111111111');
    expect(entry?.draft.mediaSuggestion?.assetUrl).toBe('https://signed/img.png');
  });

  it('resolves the day from scheduled_date when no dayId is present', () => {
    const row = generatedRow();
    (row.slot_data as Record<string, unknown>).schedule = {};
    (row.content_json as Record<string, unknown>).schedule = {};
    const entry = mapPersistedRowToCalendarEntry(row, days);
    expect(entry?.dayId).toBe('2026-06-01');
  });

  it('leaves contentPlanId null for non-bulk (ad-hoc) drafts', () => {
    const row = generatedRow();
    row.content_plan_id = null;
    const entry = mapPersistedRowToCalendarEntry(row, days);
    expect(entry?.draft.contentPlanId).toBeNull();
  });

  it('restores durable publishingAssets from content_json (no draftSnapshot)', () => {
    const row = generatedRow();
    (row.content_json as Record<string, unknown>).publishingAssets = [
      {
        role: 'primary',
        kind: 'image',
        assetId: 'asset-1',
        bucket: 'brand-profile-assets',
        storagePath: 'b/p/1.png',
        storageUrl: 'https://signed/1.png',
        slideIndex: 1,
      },
      {
        role: 'slide_2',
        kind: 'image',
        assetId: 'asset-2',
        bucket: 'brand-profile-assets',
        storagePath: 'b/p/2.png',
        storageUrl: 'https://signed/2.png',
        slideIndex: 2,
      },
    ];
    const entry = mapPersistedRowToCalendarEntry(row, days);
    expect(entry?.draft.publishingAssets).toHaveLength(2);
    expect(entry?.draft.publishingAssets?.[0].storageUrl).toBe('https://signed/1.png');
    expect(entry?.draft.publishingAssets?.[0].assetId).toBe('asset-1');
    expect(entry?.draft.publishingAssets?.[0].bucket).toBe('brand-profile-assets');
    expect(entry?.draft.publishingAssets?.[0].storagePath).toBe('b/p/1.png');
  });

  it('falls back to mediaSuggestion.url/signedUrl when assetUrl is absent', () => {
    const row = generatedRow();
    (row.content_json as Record<string, unknown>).creative = {
      mediaSuggestion: { kind: 'static', signedUrl: 'https://signed/legacy.png' },
    };
    const entry = mapPersistedRowToCalendarEntry(row, days);
    expect(entry?.draft.mediaSuggestion?.assetUrl).toBe('https://signed/legacy.png');
  });

  it('preserves locked UGC character and product references for review', () => {
    const row = generatedRow();
    (row.content_json as Record<string, unknown>).creative = {
      mediaSuggestion: {
        kind: 'video',
        ugc: {
          references: [
            { assetId: 'character-1', role: 'character', source: 'generated_anchor' },
            { assetId: 'product-1', role: 'product', source: 'library' },
          ],
          sceneCount: 4,
          targetDurationSeconds: 20,
          captionsEnabled: true,
        },
      },
    };
    const entry = mapPersistedRowToCalendarEntry(row, days);
    expect(entry?.draft.mediaSuggestion?.ugc?.references).toEqual([
      { assetId: 'character-1', role: 'character', source: 'generated_anchor' },
      { assetId: 'product-1', role: 'product', source: 'library' },
    ]);
  });

  it('carries the hyperframe sub-object through from content_json', () => {
    const row = generatedRow();
    (row.content_json as Record<string, unknown>).content = {
      titleTopic: 'Glass skin routine',
      format: 'HyperFrame',
      objective: 'save',
    };
    (row.content_json as Record<string, unknown>).creative = {
      mediaSuggestion: {
        mimeType: 'text/html',
        url: 'compositions/brand/hf_123/index.html',
        hyperframe: {
          generated: true,
          compositionId: 'hf_123',
          bucket: 'hyperframes-compositions',
          htmlPath: 'compositions/brand/hf_123/index.html',
          coverImageUrl: 'https://signed/cover.png',
          coverPath: 'compositions/brand/hf_123/cover.png',
          mp4Status: 'pending',
        },
      },
    };
    const entry = mapPersistedRowToCalendarEntry(row, days);
    expect(entry).not.toBeNull();
    expect(entry?.draft.format).toBe('HyperFrame');
    expect(entry?.draft.mediaSuggestion?.hyperframe?.compositionId).toBe('hf_123');
    expect(entry?.draft.mediaSuggestion?.hyperframe?.htmlPath).toBe(
      'compositions/brand/hf_123/index.html',
    );
    expect(entry?.draft.mediaSuggestion?.hyperframe?.coverImageUrl).toBe(
      'https://signed/cover.png',
    );
    expect(entry?.draft.mediaSuggestion?.hyperframe?.mp4Status).toBe('pending');
    expect(entry?.draft.mediaSuggestion?.hyperframe?.generated).toBe(true);
  });

  it('threads the mediaSuggestion bucket onto restored publishing assets lacking bucket/assetId', () => {
    const row = generatedRow();
    (row.content_json as Record<string, unknown>).creative = {
      mediaSuggestion: {
        kind: 'static',
        bucket: 'brand-profile-assets',
        url: 'organic/d/final.png',
      },
    };
    (row.content_json as Record<string, unknown>).publishingAssets = [
      { role: 'primary', kind: 'image', storagePath: 'organic/d/final.png', storageUrl: '' },
      {
        role: 'slide_2',
        kind: 'image',
        bucket: 'other-bucket',
        storagePath: 'organic/d/2.png',
        storageUrl: '',
      },
    ];
    const entry = mapPersistedRowToCalendarEntry(row, days);
    // The bucketless row inherits the draft's durable mediaSuggestion bucket so it
    // can enter the preview's re-sign filter; rows naming their own bucket keep it.
    expect(entry?.draft.publishingAssets?.[0].bucket).toBe('brand-profile-assets');
    expect(entry?.draft.publishingAssets?.[1].bucket).toBe('other-bucket');
  });

  it('restores the persisted storyboard preview frames from content_json', () => {
    const row = generatedRow();
    (row.content_json as Record<string, unknown>).creative = {
      mediaSuggestion: {
        mediaStatus: 'pending',
        storyboard: [
          {
            role: 'primary',
            bucket: 'brand-profile-assets',
            storagePath: 'organic/d/preview/1.png',
            storageUrl: 'https://signed/preview-1.png',
            format: 'carousel',
          },
        ],
      },
    };
    const entry = mapPersistedRowToCalendarEntry(row, days);
    expect(entry?.draft.mediaSuggestion?.storyboard).toHaveLength(1);
    expect(entry?.draft.mediaSuggestion?.storyboard?.[0].storageUrl).toBe(
      'https://signed/preview-1.png',
    );
    expect(entry?.draft.mediaSuggestion?.storyboard?.[0].storagePath).toBe(
      'organic/d/preview/1.png',
    );
    expect(entry?.draft.mediaSuggestion?.storyboard?.[0].bucket).toBe('brand-profile-assets');
  });
});

// content_json is canonical for copy — it is what the publisher and the scheduled
// worker read, and planner manual edits persist there. The captionPreview shown on
// the grid must agree with what will actually publish.
describe('mapPersistedRowToCalendarEntry — captionPreview precedence', () => {
  const days = buildWeekDays(new Date('2026-04-20T12:00:00'));

  const rowWith = (parts: {
    placementCaption?: string;
    snapshotCaption?: string;
    slotCaption?: string;
  }): PersistedOrganicDraftRow => ({
    id: 'caption-1',
    status: 'draft',
    scheduled_date: '2026-04-21',
    platform_account_id: 'acct-1',
    slot_data: {
      dayId: '2026-04-21',
      ...(parts.slotCaption ? { caption: parts.slotCaption } : {}),
      ...(parts.snapshotCaption
        ? { draftSnapshot: makeDraft({ captionPreview: parts.snapshotCaption }) }
        : {}),
    },
    ...(parts.placementCaption
      ? { content_json: { copy: { caption: parts.placementCaption } } }
      : {}),
  });

  it('prefers refined content_json copy over a stale snapshot', () => {
    const entry = mapPersistedRowToCalendarEntry(
      rowWith({
        placementCaption: 'Refined caption',
        snapshotCaption: 'Stale caption',
        slotCaption: 'Slot caption',
      }),
      days,
    );
    expect(entry?.draft.captionPreview).toBe('Refined caption');
  });

  it('falls back to the snapshot when content_json carries no copy', () => {
    const entry = mapPersistedRowToCalendarEntry(
      rowWith({ snapshotCaption: 'Snapshot caption', slotCaption: 'Slot caption' }),
      days,
    );
    expect(entry?.draft.captionPreview).toBe('Snapshot caption');
  });

  it('falls back to slot_data.caption when neither refined copy nor snapshot exists', () => {
    const entry = mapPersistedRowToCalendarEntry(rowWith({ slotCaption: 'Slot caption' }), days);
    expect(entry?.draft.captionPreview).toBe('Slot caption');
  });
});

// #235: a multi-platform post is N sibling rows sharing a group_id. Without collapsing
// them the planner renders N identical cards — the whole visible symptom of the feature
// being unimplemented.
describe('collapseDraftGroups', () => {
  const days = buildWeekDays(new Date('2026-06-01T12:00:00'));
  const GROUP_ID = '22222222-2222-2222-2222-222222222222';

  const siblingRow = (
    platform: string,
    overrides: Partial<PersistedOrganicDraftRow> = {},
  ): PersistedOrganicDraftRow => ({
    id: `row-${platform}`,
    status: 'draft',
    scheduled_date: '2026-06-01 11:00:00+00',
    platform_account_id: `acct-${platform}`,
    // The source keeps its bare client_key; siblings carry the derived suffix. That is
    // how the collapse identifies which row the autosave still converges on.
    client_key: platform === 'instagram' ? 'post-abc' : `post-abc::${platform}`,
    group_id: GROUP_ID,
    slot_data: {
      placementId: `placement-${platform}`,
      dayId: '2026-06-01',
      platform: { name: platform, accountId: `acct-${platform}` },
      draftSnapshot: {
        id: `placement-${platform}`,
        title: 'One post, three destinations',
        platforms: [platform],
        captionPreview: 'Shared copy',
      },
    },
    ...overrides,
  });

  const mapRows = (rows: PersistedOrganicDraftRow[]) =>
    rows
      .map((row) => mapPersistedRowToCalendarEntry(row, days))
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  it('collapses three grouped rows into one entry with three platforms and three members', () => {
    // Deliberately out of canonical order: Supabase does not promise a row order, so
    // the collapse must impose one or the card's badges reshuffle between refetches.
    const entries = collapseDraftGroups(
      mapRows([siblingRow('linkedin'), siblingRow('instagram'), siblingRow('facebook')]),
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].draft.platforms).toEqual(['instagram', 'facebook', 'linkedin']);
    expect(entries[0].draft.groupId).toBe(GROUP_ID);
    expect(entries[0].draft.groupMembers).toHaveLength(3);
    expect(entries[0].draft.groupMembers?.map((member) => member.platform)).toEqual([
      'instagram',
      'facebook',
      'linkedin',
    ]);
    expect(entries[0].draft.groupMembers?.map((member) => member.backendDraftId)).toEqual([
      'row-instagram',
      'row-facebook',
      'row-linkedin',
    ]);
  });

  it('keeps the source row as the collapsed representative', () => {
    const entries = collapseDraftGroups(
      mapRows([siblingRow('facebook'), siblingRow('linkedin'), siblingRow('instagram')]),
    );

    // The FE autosave keys on client_key: collapsing onto a sibling would send every
    // subsequent edit to the wrong row.
    expect(entries[0].draft.clientKey).toBe('post-abc');
    expect(entries[0].draft.backendDraftId).toBe('row-instagram');
  });

  it('passes ungrouped rows through untouched', () => {
    const plain = mapRows([
      { ...siblingRow('instagram'), id: 'row-a', group_id: null, client_key: 'plain-a' },
      { ...siblingRow('linkedin'), id: 'row-b', group_id: null, client_key: 'plain-b' },
    ]);
    const entries = collapseDraftGroups(plain);

    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.draft.platforms)).toEqual([['instagram'], ['linkedin']]);
    expect(entries[0].draft.groupId).toBeNull();
    // Still a group of one, so consumers never branch on "not grouped".
    expect(entries[0].draft.groupMembers).toHaveLength(1);
  });

  it('does NOT collapse a group split across two days', () => {
    // Siblings can be rescheduled apart. Merging them across days would make one of
    // the days silently lose its post.
    const entries = collapseDraftGroups(
      mapRows([
        siblingRow('instagram'),
        siblingRow('linkedin', {
          scheduled_date: '2026-06-02 11:00:00+00',
          slot_data: {
            placementId: 'placement-linkedin',
            dayId: '2026-06-02',
            platform: { name: 'linkedin', accountId: 'acct-linkedin' },
            draftSnapshot: { id: 'placement-linkedin', platforms: ['linkedin'] },
          },
        }),
      ]),
    );

    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.dayId).sort()).toEqual(['2026-06-01', '2026-06-02']);
    expect(entries.map((entry) => entry.draft.platforms)).toEqual([['instagram'], ['linkedin']]);
  });
});

describe('field-edit read derivations', () => {
  const days = () => buildWeekDays(new Date('2026-04-20T12:00:00'));

  function rowWith(overrides: Partial<PersistedOrganicDraftRow>): PersistedOrganicDraftRow {
    return {
      id: 'backend-derive-1',
      status: 'draft',
      scheduled_date: '2026-04-21T00:00:00+00:00',
      platform_account_id: 'acct-1',
      slot_data: { dayId: '2026-04-21' },
      ...overrides,
    };
  }

  // hasCopy used to mean "content_json is non-empty", so a hand-typed caption left
  // the COPY chip unchecked while a media-only attach checked it with no copy at all.
  it('hasCopy is true for a hand-typed caption in content_json', () => {
    const mapped = mapPersistedRowToCalendarEntry(
      rowWith({ content_json: { copy: { caption: 'typed by a human' } } }),
      days(),
    );
    expect(mapped?.draft.hasCopy).toBe(true);
    expect(mapped?.draft.captionPreview).toBe('typed by a human');
  });

  it('hasCopy is FALSE for a non-empty content_json that carries no caption', () => {
    const mapped = mapPersistedRowToCalendarEntry(
      rowWith({ content_json: { publishingAssets: [{ role: 'single' }] } }),
      days(),
    );
    expect(mapped?.draft.hasCopy).toBe(false);
  });

  it('hasCopy still recognizes a legacy caption stored only in slot_data', () => {
    const mapped = mapPersistedRowToCalendarEntry(
      rowWith({ slot_data: { dayId: '2026-04-21', caption: 'legacy manual copy' } }),
      days(),
    );
    expect(mapped?.draft.hasCopy).toBe(true);
  });

  // The format revert: a stale draftSnapshot beat the value the user just saved.
  it('format prefers content_json over a stale draftSnapshot', () => {
    const mapped = mapPersistedRowToCalendarEntry(
      rowWith({
        content_json: { content: { format: 'Carousel' } },
        slot_data: {
          dayId: '2026-04-21',
          draftSnapshot: makeDraft({ format: 'Reel' }),
        },
      }),
      days(),
    );
    expect(mapped?.draft.format).toBe('Carousel');
  });

  it('hashtags prefer content_json over a stale draftSnapshot', () => {
    const mapped = mapPersistedRowToCalendarEntry(
      rowWith({
        content_json: { copy: { hashtags: { high: ['#fresh'] } } },
        slot_data: {
          dayId: '2026-04-21',
          draftSnapshot: { ...makeDraft(), hashtags: { high: ['#stale'] } },
        },
      }),
      days(),
    );
    expect(mapped?.draft.hashtags?.high).toEqual(['#fresh']);
  });

  it('creative direction falls back to content_json for an agent draft', () => {
    const mapped = mapPersistedRowToCalendarEntry(
      rowWith({ content_json: { creative: { creativeDirectionPrompt: 'moody, wide' } } }),
      days(),
    );
    expect(mapped?.draft.creativeDirectionPrompt).toBe('moody, wide');
  });

  // The "12:00 AM" report: a midnight-UTC timestamptz with a real time recorded
  // alongside it used to render as midnight because the label was sliced from the
  // ISO string's literal HH:MM.
  it('timeLabel reads the recorded time of day, not the instant s UTC wall clock', () => {
    const mapped = mapPersistedRowToCalendarEntry(
      rowWith({
        scheduled_date: '2026-04-21T00:00:00+00:00',
        content_json: { schedule: { timeOfDay: '17:30' } },
      }),
      days(),
    );
    expect(mapped?.draft.timeLabel).toBe('5:30 PM');
  });

  it('timeLabel prefers slot_data timeOfDay over a display label', () => {
    const mapped = mapPersistedRowToCalendarEntry(
      rowWith({ slot_data: { dayId: '2026-04-21', timeOfDay: '13:45', timeLabel: '9:00 AM' } }),
      days(),
    );
    expect(mapped?.draft.timeLabel).toBe('1:45 PM');
  });

  it('timeLabel derives from the instant in the recorded zone when nothing else is stored', () => {
    const mapped = mapPersistedRowToCalendarEntry(
      rowWith({
        scheduled_date: '2026-04-21T13:00:00.000Z',
        slot_data: { dayId: '2026-04-21', timeZone: 'UTC' },
      }),
      days(),
    );
    expect(mapped?.draft.timeLabel).toBe('1:00 PM');
  });
});

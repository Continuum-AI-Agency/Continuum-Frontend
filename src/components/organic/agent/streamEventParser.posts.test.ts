import { describe, expect, it } from 'bun:test';
import type { ChatMediaStripData } from '@continuum/contracts';
import { applyOrganicFrame } from './applyOrganicFrame';
import { parseOrganicStreamEvent } from './streamEventParser';
import type { PanelAction } from './useOrganicAgentReducer';

// Post-fetching tools used to have their results hand-parsed into post lists here, one shape per
// tool. The Backend now emits one typed `ui.media_strip` per call instead, so the parser's only
// media job is to validate that frame.

const strip: ChatMediaStripData = {
  toolCallId: 'call_1',
  toolName: 'getTopPosts',
  items: [
    {
      ref: { type: 'platform', platform: 'instagram', mediaId: '17890000000000001' },
      kind: 'video',
      w: null,
      h: null,
      permalink: 'https://www.instagram.com/reel/abc/',
      label: 'Top reel',
    },
    { ref: { type: 'draft', draftId: 'draft-1', slide: 2 }, kind: 'carousel', w: 1080, h: 1350 },
  ],
  total: 12,
};

const FORMER_POST_TOOLS = [
  'listDrafts',
  'getTopPosts',
  'listOwnInstagramMedia',
  'getCalendarPostedContent',
  'getCompetitorInstagramTopPosts',
];

describe('ui.media_strip', () => {
  it('parses into a media_strip card, refs untouched', () => {
    expect(parseOrganicStreamEvent({ type: 'ui.media_strip', data: strip })).toEqual({
      kind: 'uiCard',
      card: { type: 'media_strip', data: strip },
    });
  });

  it('refuses an item that smuggles a URL: tiles sign on view, never from the frame', () => {
    const [first] = strip.items;
    const withUrl = {
      ...strip,
      items: [{ ...first, thumbnailUrl: 'https://cdn.example.com/expired.jpg' }],
    };
    expect(parseOrganicStreamEvent({ type: 'ui.media_strip', data: withUrl }).kind).toBe('invalid');
  });

  it('a post tool result is a tool result only: no card is rebuilt from its shape', () => {
    for (const toolName of FORMER_POST_TOOLS) {
      const parsed = parseOrganicStreamEvent({
        type: 'tool.result',
        data: {
          toolCallId: `call_${toolName}`,
          toolName,
          ok: true,
          result: { posts: [{ mediaId: '1', thumbnail_url: 'https://cdn/x.jpg' }], rows: [] },
        },
      });
      expect(parsed.kind).toBe('toolResult');
    }
  });

  it('live, the strip reaches the transcript and the tool result does not draw a second one', () => {
    const actions: PanelAction[] = [];
    const dispatch = (action: PanelAction) => actions.push(action);
    applyOrganicFrame(
      {
        type: 'tool.result',
        data: { toolCallId: 'call_1', toolName: 'getTopPosts', ok: true, result: { rows: [] } },
      },
      dispatch,
      'chat',
    );
    applyOrganicFrame({ type: 'ui.media_strip', data: strip }, dispatch, 'chat');
    expect(actions.map((action) => action.type)).toEqual(['STREAM_TOOL_RESULT', 'STREAM_UI_CARD']);
  });
});

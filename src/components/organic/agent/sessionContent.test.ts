import { describe, expect, it } from 'bun:test';
import { agentMentionReferenceSchema } from '@/lib/agent-references';
import { organicSessionContent } from './sessionContent';
import type { AgentJobState, PipelineCardState } from './types';

function card(jobId: string, overrides: Partial<PipelineCardState> = {}): PipelineCardState {
  return { jobId, stages: [], status: 'completed', ...overrides };
}

function job(jobId: string, overrides: Partial<AgentJobState> = {}): AgentJobState {
  return { jobId, brandId: 'b1', status: 'completed', ...overrides };
}

describe('organicSessionContent', () => {
  it('lists each generated draft once, newest first, as a valid draft reference', () => {
    const items = organicSessionContent(
      {
        j1: card('j1', {
          draftId: 'd1',
          platform: 'instagram',
          preview: { caption: 'First caption', imageUrl: 'https://x/1.png', format: 'carousel' },
        }),
        j2: card('j2', { draftId: 'd2', status: 'running' }),
        j3: card('j3', {
          draftId: 'd1',
          preview: {
            caption: 'Revised caption',
            imageUrl: null,
            images: ['https://x/2.png'],
            format: null,
          },
        }),
      },
      {},
    );

    expect(items.map((item) => item.key)).toEqual(['draft:d1', 'draft:d2']);
    expect(items[0]?.label).toBe('Revised caption');
    expect(items[0]?.preview?.url).toBe('https://x/2.png');
    expect(items[1]?.label).toBe('draft');
    expect(items[1]?.description).toBe('running');
    for (const item of items) {
      expect(agentMentionReferenceSchema.parse(item.reference).metadata?.draftId).toBe(
        item.reference?.id,
      );
    }
  });

  it('picks up a draft that only a durable job knows about', () => {
    const items = organicSessionContent(
      {},
      {
        j9: job('j9', {
          draftId: 'd9',
          platform: 'tiktok',
          previewImages: ['https://x/story.png'],
        }),
      },
    );
    expect(items.map((item) => [item.key, item.label, item.preview?.url])).toEqual([
      ['draft:d9', 'tiktok draft', 'https://x/story.png'],
    ]);
  });

  it('skips jobs with no draft to point at, and labels a failed one instead of hiding it', () => {
    const items = organicSessionContent(
      { j1: card('j1'), j2: card('j2', { draftId: 'd2', status: 'failed', platform: 'tiktok' }) },
      { j3: job('j3') },
    );
    expect(items.map((item) => [item.key, item.description])).toEqual([
      ['draft:d2', 'tiktok · failed'],
    ]);
  });

  it('never carries a base64 preview, which would ride every later turn', () => {
    const [item] = organicSessionContent(
      {
        j1: card('j1', {
          draftId: 'd1',
          preview: { caption: null, imageUrl: 'data:image/png;base64,AAAA', format: null },
        }),
      },
      {},
    );
    expect(item?.preview?.url).toBeUndefined();
  });

  it('keeps a long caption out of the chip label', () => {
    const [item] = organicSessionContent(
      {
        j1: card('j1', {
          draftId: 'd1',
          preview: { caption: 'x'.repeat(300), imageUrl: null, format: null },
        }),
      },
      {},
    );
    expect(item?.label.length).toBeLessThanOrEqual(48);
    expect(String(item?.reference?.metadata?.captionPreview).length).toBe(240);
  });
});

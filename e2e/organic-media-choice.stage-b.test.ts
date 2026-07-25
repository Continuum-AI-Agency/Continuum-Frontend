/**
 * Stage B of `organic:media-choice:e2e:bench` (bug #220). Invoked by
 * Continuum-Backend/scripts/organic-media-choice-bench.ts, which passes the path to a JSON
 * artifact of the frames the REAL expand-draft worker actually emitted via
 * ORGANIC_MEDIA_CHOICE_FRAMES.
 *
 * This half proves the FE keeps the media-approval token through every hop that #220 broke,
 * using the REAL modules — no re-implementation of any gate:
 *   - the real `applyOrganicFrame` boundary parser (contracts schema `safeParse`)
 *   - the real `panelReducer`
 *   - the real `PipelineCard` component, rendered, then queried for a clickable action
 *   - the real `restoreSessionFromMessages` reload replay
 *
 * It runs as a separate PROCESS rather than an import from the Backend because AGENTS.md §5
 * forbids cross-project source imports: the wire frame is the only thing that crosses the
 * FE/BE boundary in production, so it is the only thing that crosses here. It is a `bun test`
 * file rather than a bare script so it inherits the project's happy-dom + module mocks from
 * bunfig's preload — rendering a real component needs a real DOM.
 *
 * Run standalone (after Stage A has written an artifact):
 *   ORGANIC_MEDIA_CHOICE_FRAMES=/tmp/…/frames.json \
 *     bun test e2e/organic-media-choice.stage-b.test.ts
 */

import { afterEach, describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { applyOrganicFrame } from '@/components/organic/agent/applyOrganicFrame';
import { PipelineCard } from '@/components/organic/agent/PipelineCard';
import { restoreSessionFromMessages } from '@/components/organic/agent/restoreSession';
import type { PipelineCardState } from '@/components/organic/agent/types';
import {
  initialPanelState,
  type PanelAction,
  type PanelState,
  panelReducer,
} from '@/components/organic/agent/useOrganicAgentReducer';

type Frame = { type: string; data: Record<string, unknown> };
type Bundle = { draftId: string; frames: Frame[] };

const artifactPath = process.env.ORGANIC_MEDIA_CHOICE_FRAMES;
if (!artifactPath) {
  throw new Error(
    'ORGANIC_MEDIA_CHOICE_FRAMES is required — Stage B grades the frames the REAL worker ' +
      'emitted. Run the bench via Continuum-Backend/scripts/organic-media-choice-bench.ts.',
  );
}
const artifact = JSON.parse(readFileSync(artifactPath, 'utf8')) as {
  withPreviews: Bundle;
  noPreviews: Bundle;
};

/**
 * Drive the real reducer with the real frames, exactly as the live stream does: a
 * ui.pipeline_card establishes the card (the worker emits one per stage) and the captured
 * frames are then applied through the real boundary parser. A frame the parser rejects never
 * reaches the reducer — which is precisely how #220's token used to disappear.
 */
function reduceRealFrames(bundle: Bundle, jobId: string): PanelState {
  let state = panelReducer(initialPanelState(), {
    type: 'PIPELINE_CARD',
    card: {
      jobId,
      brandId: 'bench-brand',
      status: 'running',
      draftId: bundle.draftId,
      toolCallId: `tool-${jobId}`,
      checkpoint: { textReady: true },
    },
  });

  for (const frame of bundle.frames) {
    applyOrganicFrame(
      frame as unknown as Record<string, unknown>,
      (action: PanelAction) => {
        state = panelReducer(state, action);
      },
      'chat',
      {},
    );
  }

  return state;
}

/** Render the REAL PipelineCard and report the actions the user actually gets. */
function buttonsFor(card: PipelineCardState): string[] {
  render(
    createElement(PipelineCard, {
      card,
      onEnrichDraft: () => {},
      onGenerateMedia: () => {},
    }),
  );
  return screen.queryAllByRole('button').map((el) => el.textContent?.trim() ?? '');
}

/**
 * Replay the same real frames through the real reload path, then through the real reducer —
 * which is exactly what the panel does on load (`OrganicAgentPanel.tsx`:
 * `restored.pipelineCards.forEach((card) => dispatch({ type: 'PIPELINE_CARD', card }))`).
 * Rendering the raw restored card instead would test a shape production never renders.
 */
function restoreCard(bundle: Bundle, jobId: string): PipelineCardState | undefined {
  const restored = restoreSessionFromMessages([
    {
      id: `m-${bundle.draftId}`,
      sessionId: 'bench-session',
      role: 'assistant',
      content: '',
      createdAt: '2026-07-25T10:00:00.000Z',
      uiCardFrames: [
        {
          type: 'ui.pipeline_card',
          data: {
            jobId,
            brandId: 'bench-brand',
            status: 'completed',
            draftId: bundle.draftId,
            checkpoint: { textReady: true },
          },
        },
        ...bundle.frames.filter((f) => f.type === 'draft.blueprint_ready'),
      ],
    } as never,
  ]);

  let state = initialPanelState();
  for (const card of restored.pipelineCards) {
    state = panelReducer(state, { type: 'PIPELINE_CARD', card });
  }
  return Object.values(state.pipeline).find((c) => c.draftId === bundle.draftId);
}

for (const [label, bundle, expectPreviews] of [
  ['previews signed', artifact.withPreviews, true],
  ['no previews signed (#220 shape)', artifact.noPreviews, false],
] as const) {
  describe(`stage-b · ${label}`, () => {
    afterEach(() => cleanup());

    const jobId = `job-${bundle.draftId}`;

    it('the real worker emitted a draft.blueprint_ready frame', () => {
      expect(bundle.frames.some((f) => f.type === 'draft.blueprint_ready')).toBe(true);
    });

    it('the real reducer carries previewRevision through the real boundary parser', () => {
      const card = reduceRealFrames(bundle, jobId).pipeline[jobId];
      expect(card).toBeTruthy();
      expect(card?.checkpoint?.blueprintReady).toBe(true);
      expect(typeof card?.checkpoint?.previewRevision).toBe('string');
      expect((card?.checkpoint?.previewRevision ?? '').length).toBeGreaterThan(0);
    });

    it(`carries preview images ${expectPreviews ? 'when emitted' : 'not at all when none were emitted'}`, () => {
      const card = reduceRealFrames(bundle, jobId).pipeline[jobId];
      const count = card?.preview?.images?.length ?? 0;
      if (expectPreviews) expect(count).toBeGreaterThan(0);
      else expect(count).toBe(0);
    });

    it('the rendered PipelineCard offers Generate media', () => {
      const card = reduceRealFrames(bundle, jobId).pipeline[jobId];
      const buttons = buttonsFor(card as PipelineCardState);
      expect(buttons.length).toBeGreaterThan(0);
      expect(buttons.some((text) => text.includes('Generate media'))).toBe(true);
    });

    it('a reload keeps the approval token and the affordance', () => {
      const restored = restoreCard(bundle, jobId);
      expect(restored).toBeTruthy();
      expect((restored?.checkpoint?.previewRevision ?? '').length).toBeGreaterThan(0);
      const buttons = buttonsFor(restored as PipelineCardState);
      expect(buttons.some((text) => text.includes('Generate media'))).toBe(true);
    });
  });
}

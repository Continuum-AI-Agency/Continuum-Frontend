// Presentation coverage for the proposed-plan surface. `ui.plan_card` ships 16+ fields
// per item and the old square-tile grid rendered two of them; these tests render the REAL
// ConceptPlan / ConceptCard from CONTRACT-VALIDATED plan data and assert that the
// information a person needs to judge a plan is on screen and reachable:
//
//   - the hook (what the post will actually SAY) is visible without clicking
//   - the rationale is recoverable IN FULL, not truncated into a dead end
//   - a run with no stage frames does not read as healthy progress
//   - a media failure does not read like a job that died with nothing to show
//
// `chat:e2e:bench` cannot run locally (the /organic workspace tabs never mount without
// seed state), so this is the anchor for the plan surface.

import { afterEach, describe, expect, it } from 'bun:test';
import { proposedPlanSchema } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ConceptCard } from './ConceptCard';
import { ConceptPlan } from './ConceptPlan';
import type { AgentJobState, PipelineCardState, PlanItem, UiPlanCard } from './types';
import { initialPanelState, panelReducer } from './useOrganicAgentReducer';

const HOOK = 'Stop rinsing your leggings in hot water.';
const ANGLE = 'Myth-bust the hot-wash habit on a care-label close-up';
const RATIONALE =
  'Cold-wash care searches are up 240% in your category this week, and your care-tip Reel from Aug 4 outperformed the account median by 3.1x, so the same instructional angle has first-party evidence behind it and not just a trend guess.';

const brief = (overrides: Record<string, unknown> = {}) => ({
  contentObjective: 'Teach one care rule people get wrong',
  targetAudience: 'Women 25-34 who buy performance activewear',
  angle: ANGLE,
  hook: HOOK,
  trendIntegration: 'Ride the cold-wash care conversation',
  toneAndVoice: 'Dry, confident, no exclamation marks',
  funnelStage: 'top',
  formatSuggestion: 'reel',
  productionNotes: ['Shoot the care label in macro', 'Keep the first beat under 1.5s'],
  ...overrides,
});

const rawItem = (overrides: Record<string, unknown> = {}) => ({
  itemId: 'item-a',
  kind: 'create_post',
  platform: 'instagram',
  scheduledAt: '2026-08-25T14:00:00.000Z',
  format: 'reel',
  trendId: null,
  trendTitle: 'Cold-wash care',
  angle: ANGLE,
  objective: 'save',
  audienceSegment: 'Lapsed buyers, 90-day window',
  rationale: RATIONALE,
  guidancePrompt: 'Keep it under 20 seconds and end on the product close-up',
  draftId: null,
  creativeBrief: brief(),
  ...overrides,
});

/** Contract-validated: a fixture the Backend could not actually emit proves nothing. */
function planFixture(overrides: Record<string, unknown> = {}): UiPlanCard {
  return proposedPlanSchema.parse({
    planId: 'plan-presentation-1',
    sessionId: 'session-1',
    brandId: 'brand-1',
    userId: 'user-1',
    weekStart: '2026-08-24',
    title: 'Back-to-gym week — Instagram led',
    summary: 'Three instructional posts built on the cold-wash trend and your two best Reels.',
    items: [rawItem()],
    evidence: [
      { kind: 'trend', refId: null, summary: 'Cold-wash care is up 240% in your category.' },
      { kind: 'metric', refId: null, summary: 'Care-tip Reels beat your median by 3.1x.' },
    ],
    estimatedDurationSeconds: 240,
    createdAt: '2026-08-23T09:00:00.000Z',
    ...overrides,
  });
}

const item = (overrides: Record<string, unknown> = {}): PlanItem =>
  planFixture({ items: [rawItem(overrides)] }).items[0];

const noop = () => {};

function renderPlan(plan: UiPlanCard, pipeline: PipelineCardState[] = []) {
  return render(
    <ConceptPlan
      onGenerateAllAction={noop}
      onGenerateItemAction={noop}
      onRejectAction={noop}
      onViewDraftAction={noop}
      pipeline={pipeline}
      plan={plan}
    />,
  );
}

function renderRow(props: Partial<React.ComponentProps<typeof ConceptCard>> = {}) {
  return render(<ConceptCard concept={item()} onGenerate={noop} status="pending" {...props} />);
}

afterEach(() => cleanup());

describe('plan header — the plan describes itself', () => {
  it('renders the plan its own title, summary and schedule instead of a hardcoded label', () => {
    renderPlan(planFixture());
    expect(screen.getByText('Back-to-gym week — Instagram led')).toBeTruthy();
    expect(screen.getByText(/Three instructional posts built on the cold-wash trend/)).toBeTruthy();
    expect(screen.getByText('1 post')).toBeTruthy();
    expect(screen.getByText('~4 min to generate')).toBeTruthy();
    expect(screen.getByText('Instagram')).toBeTruthy();
  });

  it('surfaces the evidence the plan was built on rather than dropping it on the floor', () => {
    renderPlan(planFixture());
    expect(screen.getByText('Grounded in 2 signals')).toBeTruthy();
  });
});

describe('the row face — judge a post without clicking', () => {
  it('leads with the hook, in the post’s own voice', () => {
    renderRow();
    const lead = screen.getByText(new RegExp(HOOK.replace('.', '\\.')));
    expect(lead.textContent).toBe(`“${HOOK}”`);
  });

  it('shows the angle beneath the hook, unquoted — direction is not copy', () => {
    renderRow();
    const angle = screen.getByText(ANGLE);
    expect(angle.textContent).toBe(ANGLE);
  });

  it('falls back to the angle as the lead when no hook was locked, and does not quote it', () => {
    renderRow({ concept: item({ creativeBrief: brief({ hook: null }) }) });
    const lead = screen.getByText(ANGLE);
    expect(lead.textContent).toBe(ANGLE);
    expect(screen.queryByText(`“${ANGLE}”`)).toBeNull();
  });

  it('promotes the written caption over the planner’s hook once copy lands', () => {
    const caption = 'Hot water is why your leggings lost their shape. Here is the fix.';
    renderRow({
      pipeline: {
        jobId: 'job-1',
        stages: [],
        status: 'completed',
        preview: { caption, imageUrl: null, images: null, format: 'reel' },
        checkpoint: { textReady: true },
        draftId: 'draft-1',
      },
      status: 'completed',
    });
    expect(screen.getByText(`“${caption}”`)).toBeTruthy();
    expect(screen.queryByText(`“${HOOK}”`)).toBeNull();
  });

  it('answers "why this post" with the rationale and its trend, both on the face', () => {
    renderRow();
    expect(screen.getByText(RATIONALE)).toBeTruthy();
    expect(screen.getByText(/^Trending: Cold-wash care$/)).toBeTruthy();
  });

  it('renders the metadata a strip should carry, not just two fields', () => {
    renderRow();
    expect(screen.getByText('instagram')).toBeTruthy();
    expect(screen.getByText('Reel')).toBeTruthy();
    expect(screen.getByText('Drive saves')).toBeTruthy();
    expect(screen.getByText('Top of funnel')).toBeTruthy();
  });
});

describe('the rationale is recoverable in full', () => {
  it('keeps the whole rationale in the document, clamped visually rather than truncated', () => {
    renderRow();
    const rationale = screen.getByText(RATIONALE);
    // The full string is present for assistive tech and for copy/paste even while the
    // row is compact — the old card cut it mid-word with no way to read the rest.
    expect(rationale.textContent).toBe(`Why${RATIONALE}`);
    expect(rationale.className).toMatch(/line-clamp-\d/);
  });

  it('drops the clamp when the row is expanded', () => {
    renderRow();
    fireEvent.click(screen.getByLabelText('Show creative brief'));
    expect(screen.getByText(RATIONALE).className).not.toMatch(/line-clamp-\d/);
  });
});

describe('inspection depth is behind expansion, not on the face', () => {
  it('hides audience, tone, guidance and production notes until asked', () => {
    renderRow();
    expect(screen.queryByText(/Women 25-34 who buy performance activewear/)).toBeNull();
    expect(screen.queryByText(/Dry, confident, no exclamation marks/)).toBeNull();
    expect(screen.queryByText(/Keep it under 20 seconds/)).toBeNull();
  });

  it('reveals every remaining brief field on expansion', () => {
    renderRow();
    fireEvent.click(screen.getByLabelText('Show creative brief'));
    expect(screen.getByText('Women 25-34 who buy performance activewear')).toBeTruthy();
    expect(screen.getByText('Lapsed buyers, 90-day window')).toBeTruthy();
    expect(screen.getByText('Dry, confident, no exclamation marks')).toBeTruthy();
    expect(screen.getByText('Teach one care rule people get wrong')).toBeTruthy();
    expect(screen.getByText('Ride the cold-wash care conversation')).toBeTruthy();
    expect(
      screen.getByText('Keep it under 20 seconds and end on the product close-up'),
    ).toBeTruthy();
    expect(screen.getByText(/Shoot the care label in macro/)).toBeTruthy();
  });
});

describe('dependsOn expresses ordering the grid could not', () => {
  const planWithDependency = () =>
    planFixture({
      items: [
        rawItem({ itemId: 'item-teaser', scheduledAt: '2026-08-26T14:00:00.000Z', format: 'post' }),
        rawItem({
          itemId: 'item-payoff',
          scheduledAt: '2026-08-25T14:00:00.000Z',
          format: 'carousel',
          dependsOn: ['item-teaser'],
        }),
      ],
    });

  it('orders a dependent after its dependency even when the schedule says otherwise', () => {
    const { container } = renderPlan(planWithDependency());
    const rows = [...container.querySelectorAll('[data-slot="concept-row"]')];
    expect(rows).toHaveLength(2);
    // item-teaser is scheduled LATER but is depended upon, so it must be placed first.
    expect(rows[0]?.textContent).toContain('Post');
    expect(rows[1]?.textContent).toContain('Carousel');
  });

  it('names what a dependent row follows', () => {
    renderPlan(planWithDependency());
    expect(screen.getByText(/^Follows /)).toBeTruthy();
  });

  it('never drops an item whose dependency is a cycle', () => {
    const { container } = renderPlan(
      planFixture({
        items: [
          rawItem({ itemId: 'item-a', dependsOn: ['item-b'] }),
          rawItem({ itemId: 'item-b', dependsOn: ['item-a'] }),
        ],
      }),
    );
    expect(container.querySelectorAll('[data-slot="concept-row"]')).toHaveLength(2);
  });
});

describe('state is honest — three failures that must not look alike', () => {
  const runningPipeline = (over: Partial<PipelineCardState> = {}): PipelineCardState => ({
    jobId: 'job-1',
    stages: [],
    status: 'running',
    ...over,
  });

  it('a run with no stage frames reads as a blind hold, never as healthy progress', () => {
    const { container } = renderRow({ pipeline: runningPipeline(), status: 'executing' });
    const row = container.querySelector('[data-slot="concept-row"]');
    expect(row?.getAttribute('data-status-kind')).toBe('blind');
    expect(screen.getAllByText('Running · no updates yet').length).toBeGreaterThan(0);
    // The resolver's diagnostic is for whoever is debugging; it is never the copy.
    expect(screen.queryByText(/no stage data/)).toBeNull();
    // And it must not invent a percentage: no progress indicator at all.
    expect(container.querySelector('[data-slot=progress-indicator]')).toBeNull();
  });

  it('a named stage is the only thing that earns an animated progress bar', () => {
    const { container } = renderRow({
      pipeline: runningPipeline({ currentStage: 'draft', pct: 40 }),
      status: 'executing',
    });
    const row = container.querySelector('[data-slot="concept-row"]');
    expect(row?.getAttribute('data-status-kind')).toBe('working');
    expect(screen.getAllByText('Writing copy').length).toBeGreaterThan(0);
    expect(container.querySelector('[data-slot=progress-indicator]')).not.toBeNull();
  });

  it('a media failure keeps the copy and offers the media retry, not a blanket failure', () => {
    const { container } = renderRow({
      concept: item({ draftId: 'draft-1' }),
      onEnrichDraft: noop,
      onViewDraft: noop,
      pipeline: {
        jobId: 'job-1',
        stages: [],
        status: 'failed',
        draftId: 'draft-1',
        checkpoint: { textReady: true, mediaStatus: 'failed' },
        error: { message: 'image model returned no candidates' },
      },
      status: 'failed',
    });
    const row = container.querySelector('[data-slot="concept-row"]');
    expect(row?.getAttribute('data-status-kind')).toBe('media_failed');
    expect(screen.getAllByText('Media didn’t render').length).toBeGreaterThan(0);
    // The draft survived, so its destinations and the media retry stay reachable.
    expect(screen.getByText('Calendar')).toBeTruthy();
    expect(screen.getByText('Try media again')).toBeTruthy();
    expect(screen.queryByText('Retry')).toBeNull();
  });

  it('a job that died with nothing to show reads as a plain failure with a retry', () => {
    const { container } = renderRow({
      pipeline: {
        jobId: 'job-1',
        stages: [],
        status: 'failed',
        error: { message: 'render exploded' },
      },
      status: 'failed',
    });
    const row = container.querySelector('[data-slot="concept-row"]');
    expect(row?.getAttribute('data-status-kind')).toBe('failed');
    expect(screen.getAllByText('Failed').length).toBeGreaterThan(0);
    expect(screen.getByText('render exploded')).toBeTruthy();
    expect(screen.getByText('Retry')).toBeTruthy();
    expect(screen.queryByText('Try media again')).toBeNull();
  });

  it('an untouched concept carries no status badge — the action says what to do', () => {
    const { container } = renderRow();
    const row = container.querySelector('[data-slot="concept-row"]');
    expect(row?.getAttribute('data-status-kind')).toBe('concept');
    // A plan of eight rows all badged "Concept" is uniform noise; the plan card's own
    // awaiting-approval state already says nothing has happened yet.
    expect(container.querySelector('[data-slot=badge].tabular-nums')).toBeNull();
    expect(screen.getByText('Write copy')).toBeTruthy();
  });
});

describe('a durable media failure survives the reducer and reaches the row', () => {
  // The Backend really stamps media_stage='failed' (jobs/poller.ts on dead-letter,
  // jobs/worker.ts on a realize failure). checkpointFromDurableState used to have no
  // case for it, so a media failure hydrated as a plain "copy ready" — success copy
  // over a job that produced no media. This walks the whole seam.
  const seeded = () =>
    panelReducer(initialPanelState(), {
      type: 'HYDRATE_JOBS',
      jobs: [
        { jobId: 'job-1', brandId: 'brand-1', status: 'running', toolCallId: 'call_abc' } as AgentJobState,
      ],
    });

  it('keeps the copy but marks the media failed', () => {
    const state = panelReducer(seeded(), {
      type: 'SYNC_GENERATION_SUMMARIES',
      summaries: [
        { jobId: 'job-1', brandId: 'brand-1', status: 'completed', mediaStage: 'failed' },
      ],
    });

    const card = state.pipeline['job-1'];
    expect(card?.checkpoint?.mediaStatus).toBe('failed');
    expect(card?.checkpoint?.textReady).toBe(true);

    const { container } = renderRow({ pipeline: card, status: 'completed' });
    expect(
      container.querySelector('[data-slot="concept-row"]')?.getAttribute('data-status-kind'),
    ).toBe('media_failed');
    expect(screen.queryAllByText(/Copy ready/)).toHaveLength(0);
  });
});

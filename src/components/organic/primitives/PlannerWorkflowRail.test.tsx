import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { PlannerWorkflowRail, resolvePlannerStage } from './PlannerWorkflowRail';

describe('resolvePlannerStage', () => {
  it('prioritizes active generation and review context', () => {
    expect(
      resolvePlannerStage({
        draftsCount: 2,
        scheduledCount: 0,
        isGenerating: true,
        hasSelection: true,
      }),
    ).toBe('generate');
    expect(
      resolvePlannerStage({
        draftsCount: 2,
        scheduledCount: 0,
        isGenerating: false,
        hasSelection: true,
      }),
    ).toBe('review');
  });

  it('moves from planning to scheduling as work becomes ready', () => {
    expect(
      resolvePlannerStage({
        draftsCount: 0,
        scheduledCount: 0,
        isGenerating: false,
        hasSelection: false,
      }),
    ).toBe('plan');
    expect(
      resolvePlannerStage({
        draftsCount: 2,
        scheduledCount: 1,
        isGenerating: false,
        hasSelection: false,
      }),
    ).toBe('schedule');
  });
});

describe('PlannerWorkflowRail', () => {
  afterEach(cleanup);

  it('marks the current stage for assistive technology', () => {
    render(<PlannerWorkflowRail currentStage="review" />);
    expect(screen.getByText('Review').getAttribute('aria-current')).toBe('step');
    expect(screen.getByText('Generate').getAttribute('aria-current')).toBeNull();
  });
});

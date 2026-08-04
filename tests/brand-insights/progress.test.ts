import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BRAND_INSIGHTS_PROGRESS_STAGE_ORDER,
  buildBrandInsightsProgressSteps,
} from '../../src/lib/brand-insights/progress.ts';

test('buildBrandInsightsProgressSteps follows configured stage order', () => {
  const steps = buildBrandInsightsProgressSteps({ stage: 'queued', status: 'pending' });
  assert.deepEqual(
    steps.map((step) => step.id),
    [...BRAND_INSIGHTS_PROGRESS_STAGE_ORDER],
  );
});

test('buildBrandInsightsProgressSteps marks earlier stages completed and current stage active', () => {
  const steps = buildBrandInsightsProgressSteps({ stage: 'questions', status: 'running' });
  const statuses = Object.fromEntries(steps.map((step) => [step.id, step.status]));

  assert.equal(statuses.queued, 'completed');
  assert.equal(statuses.scraping, 'completed');
  assert.equal(statuses.questions, 'current');
  assert.equal(statuses.secondary_platform_eval, 'pending');
});

test('buildBrandInsightsProgressSteps supports awaiting_strategic_analysis stage', () => {
  const steps = buildBrandInsightsProgressSteps({
    stage: 'awaiting_strategic_analysis',
    status: 'pending',
  });
  const statuses = Object.fromEntries(steps.map((step) => [step.id, step.status]));

  assert.equal(statuses.awaiting_strategic_analysis, 'current');
  assert.equal(statuses.queued, 'pending');
});

test('buildBrandInsightsProgressSteps supports awaiting_brand_context stage', () => {
  const steps = buildBrandInsightsProgressSteps({
    stage: 'awaiting_brand_context',
    status: 'pending',
  });
  const statuses = Object.fromEntries(steps.map((step) => [step.id, step.status]));

  assert.equal(statuses.awaiting_brand_context, 'current');
  assert.equal(statuses.queued, 'pending');
});

test('buildBrandInsightsProgressSteps derives terminal stage from status when stage is missing', () => {
  const completed = buildBrandInsightsProgressSteps({ status: 'completed' });
  const failed = buildBrandInsightsProgressSteps({ status: 'failed' });

  assert.equal(completed.find((step) => step.id === 'completed')?.status, 'current');
  assert.equal(failed.find((step) => step.id === 'failed')?.status, 'current');
});

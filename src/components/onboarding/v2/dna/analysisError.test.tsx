import { afterEach, expect, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { type AgentPreviewBuckets, emptyBuckets } from '../state/agentPreview';
import { AnalysisErrorContext, CardSurface } from './CardSurface';
import { RunProgressBanner } from './RunProgressBanner';

afterEach(cleanup);
const rejection = 'A selected document is unavailable or still processing.';
const kept = (): AgentPreviewBuckets => ({
  ...emptyBuckets(),
  voice: { tone: 'Warm' },
  sectionStatus: { ...emptyBuckets().sectionStatus, voice: 'done' },
});

test('the banner shows the backend error above the results it kept', () => {
  render(
    <RunProgressBanner buckets={kept()} running={false} error={rejection} onRetry={() => {}} />,
  );
  expect(screen.getByRole('alert').textContent).toContain(rejection);
  expect(screen.getByText('1 of 9 sections complete')).toBeTruthy();
});

test('no error line while a run is live or when nothing failed', () => {
  const { rerender } = render(<RunProgressBanner buckets={kept()} running error={rejection} />);
  expect(screen.queryByRole('alert')).toBeNull();
  rerender(<RunProgressBanner buckets={kept()} running={false} error={null} />);
  expect(screen.queryByRole('alert')).toBeNull();
});

test('a card the failure left empty says why instead of "Nothing came back"', () => {
  render(
    <AnalysisErrorContext.Provider value={rejection}>
      <CardSurface title="Voice" status="error" isEmpty settled>
        <p>content</p>
      </CardSurface>
    </AnalysisErrorContext.Provider>,
  );
  expect(screen.getByText(rejection)).toBeTruthy();
  expect(screen.queryByText('Nothing came back for this section.')).toBeNull();
});

test('a card that kept its content shows it, not the error', () => {
  render(
    <AnalysisErrorContext.Provider value={rejection}>
      <CardSurface title="Voice" status="done" isEmpty={false} settled>
        <p>content</p>
      </CardSurface>
    </AnalysisErrorContext.Provider>,
  );
  expect(screen.getByText('content')).toBeTruthy();
});

import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { WatchmanReadiness as Readiness } from '@continuum/contracts';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';
import { WatchmanReadiness } from './WatchmanReadiness';

afterEach(cleanup);
const readiness: Readiness = {
  state: 'blocked',
  checked_at: '2026-11-26T10:00:00Z',
  checks: [
    {
      key: 'worker',
      status: 'unavailable',
      reason: 'Worker stopped',
      recovery_action: 'contact_support',
    },
    {
      key: 'runtime',
      status: 'unavailable',
      reason: 'Runtime stopped',
      recovery_action: 'contact_support',
    },
    {
      key: 'credential',
      status: 'unknown',
      reason: 'Identity incomplete',
      recovery_action: 'resume_setup',
    },
    {
      key: 'account',
      status: 'expired',
      reason: 'Reconnect this account',
      recovery_action: 'reconnect_account',
    },
    {
      key: 'budget',
      status: 'unavailable',
      reason: 'Model budget exhausted',
      recovery_action: 'adjust_budget',
    },
    {
      key: 'entitlement',
      status: 'missing',
      reason: 'Plan required',
      recovery_action: 'contact_support',
    },
  ],
};

describe('Watchman readiness recovery', () => {
  it('maps all six blockers to their actual recovery controls', () => {
    const refresh = mock(() => undefined);
    const resume = mock(() => undefined);
    const budget = mock(() => undefined);
    render(
      <WatchmanReadiness
        readiness={readiness}
        canManage
        refreshing={false}
        onRefresh={refresh}
        onResumeSetup={resume}
        onBudget={budget}
      />,
    );
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Manage connections' }).getAttribute('href')).toBe(
      '/settings?section=integrations',
    );
    expect(
      screen.getByRole('link', { name: 'Review workspace billing' }).getAttribute('href'),
    ).toBe('/settings?section=billing');
    expect(screen.getAllByText(/background service needs attention/)).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Resume setup' }));
    fireEvent.click(screen.getByRole('button', { name: 'Adjust model budget' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check readiness again' }));
    expect(resume).toHaveBeenCalledTimes(1);
    expect(budget).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  it('keeps setup and budget mutations unavailable to a viewer', () => {
    render(
      <WatchmanReadiness
        readiness={readiness}
        canManage={false}
        refreshing
        onRefresh={() => undefined}
        onResumeSetup={() => undefined}
        onBudget={() => undefined}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Resume setup' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Adjust model budget' })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Check readiness again' }).hasAttribute('disabled'),
    ).toBe(true);
  });
});

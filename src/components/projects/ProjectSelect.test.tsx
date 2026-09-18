import { afterAll, afterEach, beforeAll, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Project } from '@continuum/contracts';

const { ProjectSelect } = await import('./ProjectSelect');

// Base UI's popover waits for `[data-starting-style]` to clear with a MutationObserver,
// which the shared bun-test-setup does not install — and only on the frames where the
// attribute is still present, so without this the suite passes or throws depending on
// machine load. Scoped to this file and removed afterwards: installing it globally
// silently drops unrelated chat tests (see memory: base-ui-mutationobserver-shim-backfires).
const hadMutationObserver = 'MutationObserver' in globalThis;
beforeAll(() => {
  if (!hadMutationObserver) {
    (globalThis as { MutationObserver?: unknown }).MutationObserver = window.MutationObserver;
  }
});
afterAll(() => {
  if (!hadMutationObserver) delete (globalThis as { MutationObserver?: unknown }).MutationObserver;
});

afterEach(cleanup);

const project = (id: string, name: string): Project =>
  ({
    id,
    brandId: 'brand-1',
    name,
    brief: null,
    color: '#3b82f6',
    status: 'active',
    adAccountIds: [],
    campaignIds: [],
    leadUserId: null,
    startsOn: null,
    endsOn: null,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }) as Project;

const openPicker = async () => {
  fireEvent.click(screen.getByLabelText('Select project'));
  await screen.findByPlaceholderText('Search or create…');
};

const type = (value: string) =>
  fireEvent.change(screen.getByPlaceholderText('Search or create…'), { target: { value } });

describe('ProjectSelect create row', () => {
  it('creates the typed project and selects it', async () => {
    const onCreate = mock(async () => 'project-new');
    const onChange = mock(() => {});
    render(
      <ProjectSelect projects={[]} value={null} onChange={onChange} onCreate={onCreate} />,
    );

    await openPicker();
    type('Winter challenge');

    fireEvent.click(await screen.findByText(/Create\s*[“"]Winter challenge/));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate.mock.calls[0]?.[0]).toBe('Winter challenge');
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('project-new'));
  });

  // A create row for a name that already exists would post a request the route
  // answers with 409 — the duplicate is the existing row, one line above.
  it('hides the create row when the name already exists, ignoring case', async () => {
    const onCreate = mock(async () => 'unused');
    render(
      <ProjectSelect
        projects={[project('p1', 'Winter Challenge')]}
        value={null}
        onChange={() => {}}
        onCreate={onCreate}
      />,
    );

    await openPicker();
    type('winter challenge');

    await waitFor(() =>
      expect(screen.queryAllByText(/Create\s*[“"]winter challenge/)).toHaveLength(0),
    );
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('surfaces a duplicate-name rejection instead of closing silently', async () => {
    const onCreate = mock(async () => {
      throw new Error('Creating the project failed: 409');
    });
    const onChange = mock(() => {});
    render(
      <ProjectSelect projects={[]} value={null} onChange={onChange} onCreate={onCreate} />,
    );

    await openPicker();
    type('Duplicate');
    fireEvent.click(await screen.findByText(/Create\s*[“"]Duplicate/));

    await screen.findByText('A project already has that name');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows no create affordance when the picker cannot create', async () => {
    render(<ProjectSelect projects={[]} value={null} onChange={() => {}} />);

    fireEvent.click(screen.getByLabelText('Select project'));
    await screen.findByPlaceholderText('Search projects...');
    expect(screen.queryAllByText(/^Create/)).toHaveLength(0);
    expect(screen.queryByText('Type a name to create a project.')).toBeNull();
  });
});

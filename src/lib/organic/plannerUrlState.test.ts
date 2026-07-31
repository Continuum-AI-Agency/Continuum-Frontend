import { afterEach, describe, expect, it, vi } from 'bun:test';

import { buildPlannerSearch, writePlannerUrlState } from './plannerUrlState';

describe('buildPlannerSearch', () => {
  it('sets a key that was absent', () => {
    expect(buildPlannerSearch('', { view: 'week' })).toBe('view=week');
  });

  it('overwrites a key that was already present', () => {
    expect(buildPlannerSearch('view=month', { view: 'list' })).toBe('view=list');
  });

  it('accepts a search string with a leading question mark', () => {
    expect(buildPlannerSearch('?view=month', { view: 'week' })).toBe('view=week');
  });

  it('preserves unrelated params and their order', () => {
    expect(
      buildPlannerSearch('?weekStart=2026-07-27&sessionId=abc&composePlatform=instagram', {
        view: 'list',
      }),
    ).toBe('weekStart=2026-07-27&sessionId=abc&composePlatform=instagram&view=list');
  });

  it('overwrites in place rather than moving the key to the end', () => {
    expect(buildPlannerSearch('view=month&weekStart=2026-07-27', { view: 'week' })).toBe(
      'view=week&weekStart=2026-07-27',
    );
  });

  it('sets every owned key', () => {
    expect(
      buildPlannerSearch('', { view: 'week', tab: 'metrics', draftId: 'draft-1', edit: 'copy' }),
    ).toBe('view=week&tab=metrics&draftId=draft-1&edit=copy');
  });

  it('removes a key when its value is null', () => {
    expect(buildPlannerSearch('view=week&draftId=draft-1', { draftId: null })).toBe('view=week');
  });

  it('removes the edit key when its value is null', () => {
    expect(buildPlannerSearch('edit=copy&tab=planner', { edit: null })).toBe('tab=planner');
  });

  it('tolerates removing a key that is not present', () => {
    expect(buildPlannerSearch('view=week', { draftId: null })).toBe('view=week');
  });

  it('treats an empty patch as a no-op', () => {
    expect(buildPlannerSearch('view=week&draftId=draft-1', {})).toBe('view=week&draftId=draft-1');
  });

  it('treats an explicitly undefined value as absent from the patch, not a removal', () => {
    expect(buildPlannerSearch('view=week&draftId=draft-1', { draftId: undefined })).toBe(
      'view=week&draftId=draft-1',
    );
  });

  it('returns an empty string when the last param is removed', () => {
    expect(buildPlannerSearch('draftId=draft-1', { draftId: null })).toBe('');
  });

  it('encodes values that need it', () => {
    expect(buildPlannerSearch('', { draftId: 'a b&c' })).toBe('draftId=a+b%26c');
  });

  it('does not mutate the caller search string', () => {
    const current = 'view=month';
    buildPlannerSearch(current, { view: 'week' });
    expect(current).toBe('view=month');
  });
});

describe('writePlannerUrlState', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, '', '/organic');
  });

  it('records the merged state in the address bar', () => {
    window.history.replaceState(null, '', '/organic?weekStart=2026-07-27&view=month');

    writePlannerUrlState({ view: 'list' });

    expect(window.location.pathname).toBe('/organic');
    expect(window.location.search).toBe('?weekStart=2026-07-27&view=list');
  });

  it('drops the question mark entirely once no params remain', () => {
    window.history.replaceState(null, '', '/organic?draftId=draft-1');

    writePlannerUrlState({ draftId: null });

    expect(window.location.search).toBe('');
    expect(window.location.pathname).toBe('/organic');
  });

  it('preserves the hash fragment', () => {
    window.history.replaceState(null, '', '/organic?view=month#week-3');

    writePlannerUrlState({ view: 'week' });

    expect(window.location.hash).toBe('#week-3');
    expect(window.location.search).toBe('?view=week');
  });

  it('is a safe no-op with no window', () => {
    vi.stubGlobal('window', undefined);

    expect(() => writePlannerUrlState({ view: 'week' })).not.toThrow();
  });
});

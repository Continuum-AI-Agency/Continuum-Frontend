import { afterEach, describe, expect, it } from 'bun:test';

import { releaseStrandedLocks } from './strandedLock';

afterEach(() => {
  document.body.innerHTML = '';
  document.body.removeAttribute('style');
  document.body.removeAttribute('inert');
});

describe('releaseStrandedLocks — a modal lock left behind with nothing open', () => {
  it('lifts pointer-events:none from body when no dialog is open', () => {
    document.body.style.pointerEvents = 'none';
    expect(releaseStrandedLocks(document)).toEqual(['body pointer-events']);
    expect(document.body.style.pointerEvents).toBe('');
  });

  it('lifts inert from the page when no dialog is open', () => {
    document.body.innerHTML = '<main id="app" inert><button>Take this on</button></main>';
    document.body.setAttribute('inert', '');
    expect(releaseStrandedLocks(document)).toEqual(['body inert', 'inert on main#app']);
    expect(document.querySelector('[inert]')).toBeNull();
  });

  it('keeps the lock while a dialog is genuinely open', () => {
    document.body.style.pointerEvents = 'none';
    document.body.innerHTML =
      '<main inert><button>Approve</button></main><div role="alertdialog" data-open>Create the ad set?</div>';
    expect(releaseStrandedLocks(document)).toEqual([]);
    expect(document.body.style.pointerEvents).toBe('none');
    expect(document.querySelector('main')?.hasAttribute('inert')).toBe(true);
  });

  it('treats a dialog that is closing or closed as not open', () => {
    document.body.style.pointerEvents = 'none';
    document.body.innerHTML = '<div role="dialog" data-closed hidden>Old</div>';
    expect(releaseStrandedLocks(document)).toEqual(['body pointer-events']);
  });

  it('does nothing on a healthy page', () => {
    document.body.innerHTML = '<main><button>Ask</button></main>';
    expect(releaseStrandedLocks(document)).toEqual([]);
  });
});

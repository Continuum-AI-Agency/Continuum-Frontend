import { describe, expect, it } from 'bun:test';

import {
  describeAddPlaceholderBlock,
  describeClearBlock,
  describeComposerBlock,
  describeExportBlock,
  describeRefreshBlock,
} from './disabledReasons';

describe('describeAddPlaceholderBlock', () => {
  it('blocks while generation is running', () => {
    const hint = describeAddPlaceholderBlock({ isGenerating: true });
    expect(hint?.reason).toContain('Generation is running');
  });

  it('allows adding when idle', () => {
    expect(describeAddPlaceholderBlock({ isGenerating: false })).toBeNull();
  });
});

describe('describeClearBlock', () => {
  it('explains there is nothing to hide when the view is empty', () => {
    const hint = describeClearBlock({ isGenerating: false, draftsCount: 0 });
    expect(hint?.reason).toContain('no posts in this view to hide');
  });

  it('blocks hiding while generation is running', () => {
    const hint = describeClearBlock({ isGenerating: true, draftsCount: 5 });
    expect(hint?.reason).toContain('Generation is running');
  });

  // The control hides; it never deletes. Copy that says "clear" or "delete" re-introduces
  // exactly the fear the renamed control just removed.
  it('never suggests posts are deleted', () => {
    const reasons = [
      describeClearBlock({ isGenerating: false, draftsCount: 0 })?.reason ?? '',
      describeClearBlock({ isGenerating: true, draftsCount: 5 })?.reason ?? '',
    ];
    for (const reason of reasons) {
      expect(reason.toLowerCase()).not.toContain('delete');
      expect(reason.toLowerCase()).not.toContain('clearing');
    }
  });

  it('allows hiding when posts exist and generation is idle', () => {
    expect(describeClearBlock({ isGenerating: false, draftsCount: 5 })).toBeNull();
  });
});

describe('describeRefreshBlock', () => {
  it('names the platform when no account is connected', () => {
    const hint = describeRefreshBlock({
      hasAccount: false,
      isLoading: false,
      platformLabel: 'Instagram',
    });
    expect(hint?.reason).toContain('Instagram');
    expect(hint?.reason).toContain('refresh analytics');
    expect(hint?.unlocks).toContain('metrics');
  });

  it('explains a refresh is already in flight', () => {
    const hint = describeRefreshBlock({
      hasAccount: true,
      isLoading: true,
      platformLabel: 'Instagram',
    });
    expect(hint?.reason).toContain('already refreshing');
  });

  it('allows refresh with a connected account and idle load state', () => {
    expect(
      describeRefreshBlock({ hasAccount: true, isLoading: false, platformLabel: 'TikTok' }),
    ).toBeNull();
  });
});

describe('describeExportBlock', () => {
  it('requires a connected account before exporting or emailing', () => {
    const hint = describeExportBlock({
      hasAccount: false,
      isLoading: false,
      isExporting: false,
      platformLabel: 'Facebook',
    });
    expect(hint?.reason).toContain('Facebook');
    expect(hint?.reason).toContain('export or email a report');
    expect(hint?.unlocks).toContain('CSV');
    expect(hint?.unlocks).toContain('Continuum Report');
  });

  it('explains a report is already being prepared before load state', () => {
    const hint = describeExportBlock({
      hasAccount: true,
      isLoading: true,
      isExporting: true,
      platformLabel: 'Facebook',
    });
    expect(hint?.reason).toContain('already being prepared');
  });

  it('asks the user to wait while analytics load', () => {
    const hint = describeExportBlock({
      hasAccount: true,
      isLoading: true,
      isExporting: false,
      platformLabel: 'Facebook',
    });
    expect(hint?.reason).toContain('finish loading');
    expect(hint?.reason).toContain('exporting or emailing');
  });

  it('allows export once loaded with an account and no active export', () => {
    expect(
      describeExportBlock({
        hasAccount: true,
        isLoading: false,
        isExporting: false,
        platformLabel: 'YouTube',
      }),
    ).toBeNull();
  });
});

describe('describeComposerBlock', () => {
  it('explains the agent is mid-response', () => {
    const hint = describeComposerBlock({ isStreaming: true, hasSession: true });
    expect(hint?.reason).toContain('agent is responding');
  });

  it('explains the workspace is still warming up before a session exists', () => {
    const hint = describeComposerBlock({ isStreaming: false, hasSession: false });
    expect(hint?.reason).toContain('workspace ready');
  });

  it('allows sending with a live idle session', () => {
    expect(describeComposerBlock({ isStreaming: false, hasSession: true })).toBeNull();
  });
});

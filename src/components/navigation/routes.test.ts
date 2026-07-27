import { describe, expect, it } from 'bun:test';

import {
  APP_NAVIGATION,
  APP_NAVIGATION_FOOTER,
  APP_NAVIGATION_GROUPS,
  getContextualSuggestions,
  isRouteActive,
} from './routes';

function params(query = ''): URLSearchParams {
  return new URLSearchParams(query);
}

describe('navigation structure', () => {
  it('keeps a flat list of navigable areas for breadcrumb + command palette', () => {
    expect(APP_NAVIGATION.map((i) => i.label)).toEqual([
      'Home',
      'Canvas',
      'Automations',
      'Organic',
      'Scale',
      'Library',
      'Brand Spy',
    ]);
    expect(APP_NAVIGATION.map((i) => i.href)).toEqual([
      '/dashboard',
      '/ai-studio',
      '/automations',
      '/organic',
      '/scale',
      '/library',
      '/competitor-spy',
    ]);
  });

  it('groups the sidebar into Hessian-style sections', () => {
    expect(APP_NAVIGATION_GROUPS.map((g) => g.label)).toEqual([
      null,
      'Organic',
      'Scale',
      'Intelligence',
      'Storage',
      null,
    ]);
  });

  it('keeps Goals out of the global sidebar lead group', () => {
    const lead = APP_NAVIGATION_GROUPS[0];
    expect(lead.label).toBeNull();
    expect(lead.items.map((i) => i.href)).toEqual(['/dashboard', '/ai-studio', '/automations']);
    expect(
      APP_NAVIGATION_GROUPS.flatMap((group) => group.items).some((i) => i.href === '/goals'),
    ).toBe(false);
  });

  it('nests Organic sub-routes with area-qualified labels', () => {
    const organic = APP_NAVIGATION_GROUPS.find((g) => g.label === 'Organic');
    expect(organic?.items.map((i) => i.label)).toEqual([
      'Organic Agent',
      'Organic Analytics',
      'Calendar',
    ]);
    expect(organic?.items.map((i) => i.href)).toEqual([
      '/organic?tab=agent',
      '/organic?tab=metrics',
      '/organic?tab=planner',
    ]);
  });

  it('nests Scale sub-routes as Jaina / Paid Analytics / Paid Optimization', () => {
    const scale = APP_NAVIGATION_GROUPS.find((g) => g.label === 'Scale');
    expect(scale?.items.map((i) => i.label)).toEqual([
      'Jaina',
      'Paid Analytics',
      'Paid Optimization',
    ]);
    expect(scale?.items.map((i) => i.href)).toEqual([
      '/scale?tab=jaina',
      '/scale?tab=dashboard',
      '/scale?tab=performance',
    ]);
  });

  it('disambiguates the Agent and Analytics sub-labels across Organic and Scale', () => {
    const organic = APP_NAVIGATION_GROUPS.find((g) => g.label === 'Organic');
    const scale = APP_NAVIGATION_GROUPS.find((g) => g.label === 'Scale');
    const organicLabels = organic?.items.map((i) => i.label) ?? [];
    const scaleLabels = scale?.items.map((i) => i.label) ?? [];

    // No bare "Agent"/"Analytics" survives, and no label is shared across areas.
    for (const label of [...organicLabels, ...scaleLabels]) {
      expect(label).not.toBe('Agent');
      expect(label).not.toBe('Analytics');
    }
    expect(organicLabels.some((label) => scaleLabels.includes(label))).toBe(false);
  });

  it('puts Library under a Storage section', () => {
    const storage = APP_NAVIGATION_GROUPS.find((g) => g.label === 'Storage');
    expect(storage?.items.map((i) => i.href)).toEqual(['/library']);
  });

  it('puts Brand Spy under an Intelligence section between Scale and Storage', () => {
    const labels = APP_NAVIGATION_GROUPS.map((g) => g.label);
    expect(labels.indexOf('Intelligence')).toBe(labels.indexOf('Scale') + 1);
    expect(labels.indexOf('Storage')).toBe(labels.indexOf('Intelligence') + 1);

    const intelligence = APP_NAVIGATION_GROUPS.find((g) => g.label === 'Intelligence');
    expect(intelligence?.items.map((i) => i.label)).toEqual(['Brand Spy']);
    expect(intelligence?.items.map((i) => i.href)).toEqual(['/competitor-spy']);
  });

  it('exposes a single locked, greyed-out Developers entry with a stated reason', () => {
    const developers = APP_NAVIGATION_GROUPS.flatMap((g) => g.items).find(
      (i) => i.label === 'Developers',
    );
    expect(developers).toBeDefined();
    expect(developers!.disabled).toBe(true);
    expect(developers!.locked).toBe(true);
    // BUG-009: a disabled entry must carry a user-facing reason.
    expect(developers!.disabledReason).toBe('You are not enrolled in our developers program');
  });

  it('footer is Settings + admin-gated Admin', () => {
    expect(APP_NAVIGATION_FOOTER.map((i) => i.label)).toEqual(['Settings', 'Admin']);
    expect(APP_NAVIGATION_FOOTER.find((i) => i.label === 'Admin')?.adminOnly).toBe(true);
  });

  it('carries no Beta badge anywhere', () => {
    expect(APP_NAVIGATION.every((i) => i.badge?.label !== 'Beta')).toBe(true);
  });
});

describe('isRouteActive', () => {
  it('matches Home only on exact /dashboard', () => {
    expect(isRouteActive('/dashboard', params(), { href: '/dashboard' })).toBe(true);
    expect(isRouteActive('/dashboard/x', params(), { href: '/dashboard' })).toBe(false);
  });

  it('matches /scale as a parent prefix', () => {
    expect(isRouteActive('/scale', params(), { href: '/scale' })).toBe(true);
    expect(isRouteActive('/scale/approvals', params(), { href: '/scale' })).toBe(true);
    expect(isRouteActive('/scaled', params(), { href: '/scale' })).toBe(false);
  });

  it('matches query-bearing sub-routes only when every param matches', () => {
    expect(
      isRouteActive('/scale', params('tab=performance'), { href: '/scale?tab=performance' }),
    ).toBe(true);
    expect(
      isRouteActive('/scale', params('tab=dashboard'), { href: '/scale?tab=performance' }),
    ).toBe(false);
    expect(isRouteActive('/organic', params('tab=metrics'), { href: '/organic?tab=metrics' })).toBe(
      true,
    );
    expect(isRouteActive('/scale', params(), { href: '/scale?tab=jaina' })).toBe(false);
  });
});

describe('getContextualSuggestions', () => {
  it('offers Scale-specific actions on /scale', () => {
    const labels = getContextualSuggestions('/scale').map((s) => s.label);
    expect(labels).toEqual(['Ask Jaina', 'Analyze ROAS drop', 'Optimize campaigns']);
  });

  it('offers Organic-specific actions on /organic', () => {
    const labels = getContextualSuggestions('/organic').map((s) => s.label);
    expect(labels).toContain('Create reel plan');
    expect(labels).toContain('Ask the Organic Agent');
  });

  it('inherits the area set on a nested sub-path via longest-prefix match', () => {
    expect(getContextualSuggestions('/scale/approvals').map((s) => s.label)).toEqual(
      getContextualSuggestions('/scale').map((s) => s.label),
    );
  });

  it('returns no suggestions for an unmapped route', () => {
    expect(getContextualSuggestions('/nowhere')).toEqual([]);
  });

  it('only points suggestions at real navigable hrefs', () => {
    const hrefs = getContextualSuggestions('/dashboard').map((s) => s.href);
    for (const href of hrefs) {
      expect(href.startsWith('/')).toBe(true);
    }
  });
});
